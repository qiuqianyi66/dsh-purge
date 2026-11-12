// F17：启动自检留痕。结构化 JSONL 落本地状态目录，用于真机复盘与回滚定位。
//
// 三条硬约束：
//   1. 绝不写敏感凭据：按字段名黑名单剔除 token/secret/cookie 之类，长字符串一律截断。
//   2. 有轮转：超过上限就滚成 .1/.2，避免无限增长。
//   3. 写日志失败不能影响主流程，任何异常都吞在内部并返回 ok=false。
import fs from "node:fs";
import path from "node:path";

export const SELFCHECK_LOG_MAX_BYTES = 512 * 1024;
export const SELFCHECK_LOG_KEEP = 2;

const SECRET_KEY = /(token|secret|password|passwd|authorization|cookie|credential|api[-_]?key|private[-_]?key)/i;

export function selfcheckLogPath(dshHome) {
  return path.join(String(dshHome || ""), "dsh-purge", "logs", "selfcheck.log");
}

/** 只留可以安全落盘的字段：拉黑敏感键、深拷贝限深、字符串截断。 */
export function sanitizeSelfcheckEvent(input, depth = 0) {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return input.length > 160 ? `${input.slice(0, 157)}…` : input;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(input)) {
    const head = input.slice(0, 12).map((v) => sanitizeSelfcheckEvent(v, depth + 1));
    return input.length > 12 ? head.concat(`…+${input.length - 12}`) : head;
  }
  if (typeof input === "object") {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = sanitizeSelfcheckEvent(v, depth + 1);
    }
    return out;
  }
  return String(input);
}

function rotateIfNeeded(logPath, incomingBytes, maxBytes, keep) {
  let size = 0;
  try {
    size = fs.statSync(logPath).size;
  } catch {
    return;
  }
  if (size + incomingBytes <= maxBytes) return;
  for (let i = keep; i >= 1; i -= 1) {
    const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
    const to = `${logPath}.${i}`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch {
      // 轮转失败就继续写老文件，不抛
    }
  }
}

/**
 * F17：把一次诊断压成可落盘的计数摘要。
 * 只保留数字与短标签，不含宿主路径、文件内容或补丁名，避免日志成为第二份证据库。
 * @param {object} report drift.diagnose 的返回
 * @returns {{clean:number,drifted:number,dead_target:number,carrier_missing:number,retired:number,optional_missing:number,skipped_surface:number,no_carrier:number,needs_action:number}}
 */
export function summarizeDiagnose(report) {
  const n = (key) => (Array.isArray(report?.[key]) ? report[key].length : 0);
  const drifted = n("drifted");
  const dead = n("dead_target");
  const missing = n("carrier_missing");
  return {
    clean: n("clean"),
    drifted,
    dead_target: dead,
    carrier_missing: missing,
    retired: n("retired"),
    optional_missing: n("optional_missing"),
    skipped_surface: n("skipped_surface"),
    no_carrier: n("no_carrier"),
    needs_action: drifted + dead + missing,
  };
}

/**
 * 追加一条自检记录。永不抛错：返回 {ok, path, bytes}。
 * @param {{dshHome:string, action:string, data?:object, maxBytes?:number, keep?:number}} params
 */
export function appendSelfcheckEvent({ dshHome, action, data = {}, maxBytes = SELFCHECK_LOG_MAX_BYTES, keep = SELFCHECK_LOG_KEEP } = {}) {
  const logPath = selfcheckLogPath(dshHome);
  try {
    const event = sanitizeSelfcheckEvent({
      ts: new Date().toISOString(),
      action: String(action || "unknown"),
      plugin: "dsh-purge",
      ...data,
    });
    const line = `${JSON.stringify(event)}\n`;
    const bytes = Buffer.byteLength(line, "utf8");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    rotateIfNeeded(logPath, bytes, maxBytes, keep);
    fs.appendFileSync(logPath, line, "utf8");
    return { ok: true, path: logPath, bytes };
  } catch (e) {
    return { ok: false, path: logPath, bytes: 0, error: String(e && e.message ? e.message : e) };
  }
}

/** 读最近若干条，按行解析；坏行跳过不抛（日志不该拖垮调用方）。 */
export function readSelfcheckLog({ dshHome, limit = 50 } = {}) {
  const logPath = selfcheckLogPath(dshHome);
  let text = "";
  try {
    text = fs.readFileSync(logPath, "utf8");
  } catch {
    return { path: logPath, entries: [], truncated: false };
  }
  const lines = text.split("\n").filter(Boolean);
  const tail = lines.slice(-Math.max(1, limit));
  const entries = [];
  for (const line of tail) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // 坏行（例如写入时被截断）直接跳过
    }
  }
  return { path: logPath, entries, truncated: lines.length > tail.length };
}

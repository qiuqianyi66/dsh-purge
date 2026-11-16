// lib/anchor-overrides.js — 本地重锚覆盖（只读加载 + 内存合并）
//
// 为什么需要它：补丁锚点是逐字文本。宿主小版本改一句文案、搬一个文件，补丁就整条
// 失配；过去只能改源码再发版。这里允许用户在自己机器的
// `$DSH_HOME/dsh-purge/anchor-overrides.json` 里钉一条新锚点，apply / status /
// diagnose 三处共用同一份覆盖；文件删掉即恢复原状，不动插件源码。
//
// 设计边界：
// - 只做「追加候选」，不替换原锚点：老宿主继续命中老锚点，新宿主命中新候选；
// - 覆盖项一律标 fallback，原锚点 0 命中时不再按 expect 契约拒写（见 core 的缺口判定）；
// - 坏 JSON / 坏条目只记录错误、不抛异常：诊断要能说出「覆盖没生效」而不是崩掉。

import fs from "node:fs";
import path from "node:path";

export function anchorOverridesPath(dshHome) {
  if (!dshHome) return "";
  return path.join(dshHome, "dsh-purge", "anchor-overrides.json");
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pattern = typeof raw.pattern === "string" ? raw.pattern : "";
  const replacement =
    typeof raw.replacement === "string"
      ? raw.replacement
      : typeof raw.replace === "string"
        ? raw.replace
        : "";
  if (!pattern || !replacement) return null;
  const entry = {
    pattern,
    replace: replacement,
    fallback: true,
    source: "override",
    note: typeof raw.note === "string" ? raw.note : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
  };
  // 覆盖项也可以带命中数契约；不带则按“见到就替换”处理。
  if (Number.isInteger(raw.expect) && raw.expect >= 0) entry.expect = raw.expect;
  return entry;
}

/**
 * 读取覆盖文件。永远返回结构，不抛异常：
 * { path, exists, ok, ids: number[], entries: Map<number, entry[]>, errors: string[] }
 */
export function readAnchorOverrides(dshHome) {
  const fp = anchorOverridesPath(dshHome);
  const out = { path: fp, exists: false, ok: true, ids: [], entries: new Map(), errors: [] };
  if (!fp || !fs.existsSync(fp)) return out;
  out.exists = true;
  let raw = "";
  try {
    raw = fs.readFileSync(fp, "utf8");
  } catch (e) {
    out.ok = false;
    out.errors.push(`读取失败：${e.message}`);
    return out;
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    out.ok = false;
    out.errors.push(`JSON 解析失败：${e.message}`);
    return out;
  }
  const bucket =
    doc && typeof doc === "object" && doc.patches && typeof doc.patches === "object" ? doc.patches : doc;
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    out.ok = false;
    out.errors.push('顶层结构应为 { "patches": { "<补丁 id>": { "pattern": "...", "replacement": "..." } } }');
    return out;
  }
  for (const [key, value] of Object.entries(bucket)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) {
      out.errors.push(`忽略非法补丁 id：${key}`);
      continue;
    }
    const list = Array.isArray(value) ? value : [value];
    const entries = list.map(normalizeEntry).filter(Boolean);
    if (!entries.length) {
      out.errors.push(`#${id} 缺少 pattern/replacement，已忽略`);
      continue;
    }
    out.ids.push(id);
    out.entries.set(id, entries);
  }
  return out;
}

/** 兼容旧的 patterns/replace 形态，与 core.patchReplacements 同口径。 */
function replacementsOf(patch) {
  if (Array.isArray(patch.replacements)) return patch.replacements;
  return (patch.patterns ?? []).map((pat) => ({ pattern: pat, replace: patch.replace }));
}

/** 把覆盖追加进补丁的内存副本；没有覆盖时原样返回。 */
export function mergeAnchorOverrides(patches, report) {
  if (!report || !report.entries || report.entries.size === 0) return patches;
  return patches.map((patch) => {
    if (patch.anchorOverrides) return patch;
    const extra = report.entries.get(patch.id);
    if (!extra || extra.length === 0) return patch;
    return {
      ...patch,
      replacements: [...replacementsOf(patch), ...extra],
      anchorOverrides: true,
    };
  });
}

/** 给诊断/状态展示用的轻量摘要（不带完整 pattern 文本）。 */
export function summarizeAnchorOverrides(report) {
  if (!report) return null;
  return {
    path: report.path,
    exists: report.exists,
    ok: report.ok,
    ids: [...report.ids],
    count: report.ids.length,
    errors: [...report.errors],
  };
}

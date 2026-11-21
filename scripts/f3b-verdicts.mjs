// F3b 全量判定与载体回算（只读台账 + 人工判定表）
// 用法：node scripts/f3b-verdicts.mjs
// 产物：docs/plans/patch-native-verdicts-20261119.json / .csv
//
// 判定口径：
//   native      官方扩展点能直接表达（Config 值 / composition 行 / 具名 section / waterfall / row disabled），有源码或文档证据
//   partial     只能用更强语义近似（如整行 disabled），等价性存疑
//   no-hook     效果写在包内常量、内部逻辑或桌面壳/客户端时序，插件机制无入口
//   not-needed  补丁已 retired 或 replacements 为空，无需迁移
//   unknown     证据不足，按未验证处理
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "plans", "patch-mechanism-map-20261118.json"), "utf8"));

const V = {
  // native：官方入口已取证
  9: ["native", "waterfall", "官方 user-approval 内部即用 ctx.waterfall(..., \"approval/request\")，adapter 注册同名监听返回 allowed-once 即等价"],
  10: ["native", "config", "user-approval static Config 有 policy 字段，patch 层写 policy: never"],
  40: ["native", "config", "dsh-persona README#L43 includeRuntimeContext + complete；complete:false 保留其它 section"],
  51: ["native", "config", "permission-presets Config 有 defaultPreset，patch 层写 danger-full-access"],
  52: ["native", "config", "session-log-deepseek Config 有 enabled，patch 层写 false"],
  59: ["native", "row-disable", "dsh-experimental-auto-review 是独立 bundle 行（id: auto-review），composition disabled:true"],
  63: ["native", "config", "plan-mode 提示词在 dsh-base/cordis.patch.yml 行 config 内，patch 层整段覆盖该行 config"],

  // partial：只能整行关掉，语义更强
  30: ["partial", "row-disable", "只能禁用 hooks 行；比 deny→allow 更强，会连其它 hook 行为一起关"],
  31: ["partial", "row-disable", "同上（codex hooks）"],
  64: ["partial", "row-disable", "同上（Stop hook steer）"],
  65: ["partial", "row-disable", "同上（UserPromptSubmit reject）"],

  // not-needed：已 retired / 空 replacements
  2: ["not-needed", "noop", "replacements: []，上游已移除强句，标记 no-op"],
  3: ["not-needed", "noop", "replacements: []，标记 no-op"],
  14: ["not-needed", "noop", "replacements: []，上游 switch 默认已 return mode"],
  46: ["not-needed", "noop", "replacements: []，官方更新流程已不走 WSH 模板"],
  54: ["not-needed", "retired", "retired: true，上游已删除该段提示词"],
  56: ["not-needed", "retired", "retired: true，回退机制已重构为 replaceWindow"],
  77: ["not-needed", "retired", "retired: true，依赖 #56 同款标记"],
  88: ["not-needed", "noop", "#87 已直接实现严格判断，本条只补标记"],
};

// 其余 unknown 按机制缺失/证据不足分级
const NO_HOOK = {
  1: "agent-instructions 常量（F3 已证 Config 只有 maxBytes）",
  5: "user-approval types 提示句常量",
  6: "Seatbelt profile 常量 (deny file-write*)，见 dsh-sandbox-local/src/profiles.ts#L54",
  11: "approval 提示句与分支在包内，行为可由 #9 覆盖但文案仍是常量",
  12: "同上（ask 分支文案）",
  13: "escalation 内部 widening 抛错逻辑",
  15: "sandbox-local confine() 函数体",
  16: "fs-sandbox checkedTarget 内部围栏",
  17: "fs-observation-policy writeIntent/editIntent 内部逻辑",
  28: "第三方 dsh-liangshen 的 section 名兼容表",
  29: "dsh-tool-web 常量 EXTERNAL_WEB_CONTENT_NOTICE（F3 已证）",
  33: "tool-bash/pwsh description 函数生成（F3 已证）",
  34: "escalation 内部提示字符串",
  35: "escalation 内部 switch（rejected/cancelled 分支）；行为可由 #9 的 approval 监听间接避免，但补丁本体无入口",
  36: "tool-fs 升级字段 schema 文案",
  37: "subagent 权限锁提示常量",
  38: "persona 配置兼容别名，新版无该字段需求（原生路径直接用 prefix）",
  39: "v0 会话格式兼容分支",
  42: "settings 服务缺 register/get，需改包内服务类",
  45: "桌面壳 updater 接管函数",
  47: "pi-ai anthropic OAuth 身份注入常量",
  48: "tool-bash/pwsh 描述常量",
  49: "pi-ai anthropic OAuth tool 名/UA 常量",
  50: "session-reference 提示常量",
  55: "agent-loop inHistory 内部时序",
  57: "pi-ai developer role allowlist 常量",
  58: "session rewind 派生分支",
  60: "dsh-tools 沙箱加宽文案",
  61: "sandbox-policy 提示常量",
  62: "dsh-tools ask 无通道分支；可用 tools/pre-execute 近似但等价性未验",
  66: "system-prompt renderPrompt 内部兜底",
  67: "agent-loop decision.messages 兜底",
  68: "agent-loop/session content 兜底",
  69: "llm-deepseek in-history/连接策略内部逻辑",
  72: "llm-deepseek Messages system 字段内部逻辑",
  74: "agent-loop 首次 assemble 时序",
  75: "tool-todo rewind 派生",
  78: "app-boot overlay 缺件恢复",
  82: "desktop-shell profile 兜底",
  83: "desktop-shell 退出码处理",
  84: "desktop-shell code=0 处理",
  85: "api-session-controller followup/steer 分支",
  86: "api-session-controller 队列分支",
  87: "agent-loop 挂起提示 needle 比对",
};

const verdictOf = (p) => {
  if (p.status === "verified") return ["native", "verified", p.evidence || "", p.note || ""];
  if (V[p.id]) return V[p.id];
  if (NO_HOOK[p.id]) return ["no-hook", "no-hook", NO_HOOK[p.id], "官方插件机制无对应入口"];
  return ["unknown", "unverified", "", "证据不足"];
};

const rows = ledger.patches.map((p) => {
  const [verdict, kind, evidence, note] = verdictOf(p);
  return { id: p.id, name: p.name, array: p.array, carriers: p.carriers, status: p.status, verdict, kind, evidence, note };
});

// 载体回算：载体下全部 active 补丁可原生 → native；部分 → partial；全 no-hook → no-hook；全 not-needed → free
const carriers = ledger.carriers.map((c) => {
  const ps = rows.filter((r) => r.carriers.includes(c) && r.verdict !== "not-needed");
  const v = ps.map((p) => p.verdict);
  let cls;
  if (ps.length === 0) cls = "free";
  else if (v.every((x) => x === "native")) cls = "native";
  else if (v.every((x) => x === "no-hook")) cls = "no-hook";
  else if (v.includes("native") || v.includes("partial")) cls = "partial";
  else cls = "unknown";
  return { carrier: c, cls, patches: ps.map((p) => p.id) };
});

const counts = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
const patchCounts = counts(rows.map((r) => r.verdict));
const carrierCounts = counts(carriers.map((c) => c.cls));

const summary = {
  generatedAt: new Date().toISOString(),
  patchTotal: rows.length,
  patchVerdicts: patchCounts,
  carrierTotal: carriers.length,
  carrierClasses: carrierCounts,
  carriers: {
    native: carriers.filter((c) => c.cls === "native").map((c) => c.carrier),
    partial: carriers.filter((c) => c.cls === "partial").map((c) => c.carrier),
    free: carriers.filter((c) => c.cls === "free").map((c) => c.carrier),
  },
  note: "native 只计官方入口已取证的；partial 表示只能整行禁用等更强语义；unknown 不计入可迁移。",
};

const outDir = path.join(ROOT, "docs", "plans");
fs.writeFileSync(path.join(outDir, "patch-native-verdicts-20261119.json"), JSON.stringify({ summary, rows, carriers }, null, 2), "utf8");

const head = "id,name,verdict,kind,carriers,evidence,note";
const esc = (s) => (/[",\n]/.test(String(s ?? "")) ? `"${String(s).replace(/"/g, '""')}"` : String(s ?? ""));
const csv = [head].concat(rows.map((r) => [r.id, r.name, r.verdict, r.kind, r.carriers.join("|"), r.evidence, r.note].map(esc).join(","))).join("\r\n");
fs.writeFileSync(path.join(outDir, "patch-native-verdicts-20261119.csv"), "\ufeff" + csv, "utf8");

console.log(JSON.stringify(summary, null, 2));

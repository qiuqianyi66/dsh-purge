// F2 机制映射（只读）
// 输入：docs/plans/patch-mechanism-map-20261118.json（F1 台账）
// 输出：同名 CSV/JSON 增补 mechanism/status/evidence/note 四列（F1 字段全部保留）
// 口径：verified 只在官方文档能直接证明「该机制可以表达该效果」时使用；
//       机制清单见 practices.md L10（restrict→guard→waterfall→assemble），其余一律 unknown。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const HOST = "D:/DeepSeek Harness/resources/app/dsh/node_modules/@deepseek-ai";
const DOC = `${HOST}/dsh-agent-preset/skills/dsh-doc/references`;

const E = {
  IDENT: `${HOST}/dsh-system-prompt/README.md#L46 includeHarnessIdentity=false`,
  PERSONA: `${HOST}/dsh-persona/README.md#L32-L44 prefix/suffix/complete/includeRuntimeContext`,
  SECTION: `${HOST}/dsh-system-prompt/README.md#L56-L64 ctx.systemPrompt.section({name,order,text})`,
  SHADOW: `${HOST}/dsh-system-prompt/README.md#L12,L28,L116 scoped section 同名 shadow global`,
  CONFIG: `${DOC}/practices.md#L22 Config 走 cordis.patch.yml（用户 patch 层随升级存活）`,
  RESTRICT: `${DOC}/practices.md#L10,L17 tools.restrict() 只能移除工具`,
  GUARD: `${DOC}/practices.md#L10,L17 tools.guard() 同步拒绝`,
  WATERFALL: `${DOC}/practices.md#L10,L16 waterfall（tools/pre-execute 等）可改写决策`,
  COMPOSE: `${DOC}/composition-reference.md#L7-L20 insert/覆盖 config/disabled`,
  BUNDLE: `${DOC}/host-plugin.md#L1-L27 dsh.bundle.patch 分发`,
  NONE: `${DOC}/practices.md#L10 机制清单不含「改写他人包内部实现」；无对应证据`,
};

// [mechanism, status, evidence, note]
// status ∈ verified | unknown
const MAP = {
  1: ["systemPrompt section", "unknown", E.SHADOW, "agent-instructions 的 INTRO 是宿主常量；同名 scoped section 或可 shadow，section 名与归属未核"],
  2: ["retire", "unknown", E.NONE, "0.2.2-rc.1 已把强句改回中性 guidance，补丁自述为 no-op；退役需先证明当前宿主无强句"],
  3: ["retire", "unknown", E.NONE, "同上，#3 亦为 no-op marker 形态"],
  4: ["persona", "verified", E.PERSONA, "dsh-persona 的 prefix/complete 可直接给出「只保留自定义人设、不写官方身份」"],
  5: ["systemPrompt section", "unknown", E.SHADOW, "审批提示句在 user-approval 的 prompt 段；能否整段 shadow 未核"],
  6: ["source-only", "unknown", E.NONE, "改 sandbox-local 的 deny 判定实现，插件机制无对应钩子"],
  7: ["config", "verified", E.CONFIG, "写的就是 base 的 cordis.patch.yml 默认值；用户 patch 层可等价覆盖"],
  8: ["config", "verified", E.CONFIG, "同上，approval 默认值属配置项"],
  9: ["waterfall", "unknown", E.WATERFALL, "自动放行可用 tools/pre-execute 返回 allow 表达，但与改内部 grant 的等价性未验"],
  10: ["config", "unknown", E.CONFIG, "若 user-approval 暴露 approval 默认配置项可等价；Config 字段未核"],
  11: ["waterfall", "unknown", E.WATERFALL, "never 提示句→放行，需 pre-execute 决策改写，等价性未验"],
  12: ["waterfall", "unknown", E.WATERFALL, "同上（ask 分支）"],
  13: ["source-only", "unknown", E.NONE, "改 escalation 阶梯内部判定"],
  14: ["waterfall", "unknown", E.WATERFALL, "无条件授信可由 pre-execute 直接 allow，等价性未验"],
  15: ["source-only", "unknown", E.NONE, "sandbox confine 直通属内部实现"],
  16: ["config", "unknown", E.CONFIG, "fs-sandbox 围栏是否以 Config 暴露未核"],
  17: ["source-only", "unknown", E.NONE, "observation policy 意图放行属内部策略"],
  18: ["config", "verified", E.COMPOSE, "整行 disabled 可达到「不再有重复调用守卫」，非改内部实现"],
  19: ["config", "verified", E.COMPOSE, "整行 disabled 可关闭结果修剪器"],
  21: ["config", "verified", E.CONFIG, "写的是 base 的 bash 等待值，用户 patch 层可覆盖"],
  22: ["config", "verified", `${HOST}/dsh-tool-fs/lib/index.js#L2009-L2018 Config{readLimit,readMaxLineLength,readMaxBytes}；bak 基线同字段`, "F3 已核：上限本就是 Config 默认值，用户 patch 层改值即可，不需要改包"],
  23: ["config", "verified", `${HOST}/dsh-subagent/lib/index.js#L2962-L2964 Config{maxDepth default}；bak L2963 default(1)`, "F3 已核：补丁只是把 Config 默认值从 1 抬到 10，配置行即可等价"],
  24: ["preset composition", "verified", E.COMPOSE, "预设插件列表即 composition 行，insert 即可打开 tool-web"],
  25: ["config", "verified", E.IDENT, "includeHarnessIdentity:false 直接对应该补丁效果"],
  26: ["persona", "verified", E.PERSONA, "complete:true + 去身份 prefix 即该补丁语义"],
  28: ["source-only", "unknown", E.NONE, "第三方 dsh-liangshen 的 phase-1 注入段，属他人包实现"],
  29: ["source-only", "unknown", E.NONE, "tool-web 的 untrusted 框架是工具描述常量，无改写 API"],
  30: ["config", "unknown", E.COMPOSE, "整行 disabled 可绕过 hooks deny，但语义强于 deny→allow，等价性未验"],
  31: ["config", "unknown", E.COMPOSE, "同上（codex hooks）"],
  32: ["systemPrompt section", "verified", `${HOST}/dsh-harness-dev-context/lib/index.js#L99-L116 section name app:web-surface；shadow 口径见 ${HOST}/dsh-system-prompt/README.md#L116`, "F3 已核：身份句是具名 section，可在 agent scope 注册同名 section 整段 shadow"],
  33: ["source-only", "unknown", E.NONE, "bash/pwsh 工具描述是宿主常量，11 处文案无 API 改写"],
  34: ["waterfall", "unknown", E.WATERFALL, "escalation hint 文案在工具结果侧，工具结果可由 waterfall 改写但等价性未验"],
  35: ["waterfall", "unknown", E.WATERFALL, "升级结果永不 reject 属内部状态机，pre-execute 无法覆盖"],
  36: ["source-only", "unknown", E.NONE, "tool-fs 的升级 schema 字段描述属工具实现"],
  37: ["systemPrompt section", "unknown", E.SHADOW, "subagent 权限锁提示段可否 shadow 未核"],
  38: ["source-only", "unknown", E.NONE, "第三方 persona 0.1.2 旧字段兼容，属他人包实现"],
  39: ["source-only", "unknown", E.NONE, "v0 会话格式兼容，属 session 实现"],
  40: ["retire", "unknown", E.NONE, "0.1.5 兼容；现宿主 complete 语义已由 registry 统一，是否还需要该补丁未证"],
  42: ["source-only", "unknown", E.NONE, "settings 服务旧 API 补回，属宿主服务实现"],
  43: ["persona", "verified", E.PERSONA, "四个内置预设各挂 persona 行即可只去身份句"],
  45: ["source-only", "unknown", E.NONE, "桌面壳升级交接，无插件 API"],
  46: ["source-only", "unknown", E.NONE, "同上，ASCII 脚本改写"],
  47: ["source-only", "unknown", E.NONE, "第三方 pi-ai OAuth 首段系统提示，属他人包实现"],
  48: ["source-only", "unknown", E.NONE, "工具描述文案，同 #33"],
  49: ["source-only", "unknown", E.NONE, "第三方 OAuth 伪装 claude-cli，属他人包实现"],
  50: ["systemPrompt section", "unknown", E.SHADOW, "跨会话引用框架是否 section 化未核"],
  51: ["config", "unknown", E.CONFIG, "permission-presets 是否以 Config 暴露默认权限未核"],
  52: ["config", "unknown", E.CONFIG, "session-log-deepseek 的上传默认是否可配置未核"],
  53: ["systemPrompt section", "verified", `${HOST}/dsh-harness-dev-context/lib/index.js#L99-L116 app:web-surface 同源；shadow 口径见 ${HOST}/dsh-system-prompt/README.md#L116`, "F3 已核：与 #32 同一 section，禁止另开服务器句也在其中"],
  54: ["systemPrompt section", "unknown", E.SHADOW, "deliverables-prompt 的禁止句可否整段 shadow 未核"],
  55: ["source-only", "unknown", E.NONE, "agent-loop 每步替换首条 system，属循环实现"],
  56: ["source-only", "unknown", E.NONE, "回退 UI 只藏被撤范围，属客户端渲染实现"],
  57: ["source-only", "unknown", E.NONE, "provider 侧 developer role 白名单，属适配器实现"],
  58: ["source-only", "unknown", E.NONE, "回退空标记不进请求，属会话派生实现"],
  59: ["config", "unknown", E.COMPOSE, "auto-review 整行 disabled 可达到不拦工具，语义强于原补丁，等价性未验"],
  60: ["waterfall", "unknown", E.WATERFALL, "run_code 加宽自动放行可由 pre-execute allow 表达，等价性未验"],
  61: ["systemPrompt section", "unknown", E.SHADOW, "sandbox-policy 只读策略提示是否 section 化未核"],
  62: ["waterfall", "unknown", E.WATERFALL, "无通道 fail-open 依赖「是否存在审批 UI」，pre-execute 拿不到该状态"],
  63: ["preset composition", "unknown", E.COMPOSE, "计划模式文案横跨 base 与三个预设，是否可纯 composition 覆盖未核"],
  64: ["source-only", "unknown", E.NONE, "hooks Stop 不再 steer，属他人 hook 实现"],
  65: ["source-only", "unknown", E.NONE, "hooks pre-step deny 不再 reject 整轮，属他人 hook 实现"],
  66: ["source-only", "unknown", E.NONE, "renderPrompt undefined 兜底属防御补丁，官方修好即可退役"],
  67: ["source-only", "unknown", E.NONE, "decision.messages 兜底属防御补丁"],
  68: ["source-only", "unknown", E.NONE, "systemNodes 缺 content 兜底属防御补丁"],
  69: ["source-only", "unknown", E.NONE, "llm-deepseek in-history 恢复，属 provider 实现"],
  70: ["preset composition", "verified", E.COMPOSE, "极简预设的 bash 文案即预设内容，直接改 composition 文本"],
  71: ["persona", "verified", E.PERSONA, "梁神预设挂 persona 行即可只去身份句"],
  72: ["source-only", "unknown", E.NONE, "Messages.system 用当前提示，属 provider 适配实现"],
  73: ["preset composition", "verified", E.COMPOSE, "预设内多余镜像句，属预设文本"],
  74: ["source-only", "unknown", E.NONE, "首次 assemble 前挂默认提示，属循环时序"],
  75: ["source-only", "unknown", E.NONE, "回退重置 todo，属会话派生实现"],
  76: ["persona", "verified", E.PERSONA, "用户自造 unrestricted 预设挂 persona 行"],
  77: ["source-only", "unknown", E.NONE, "回退标记到达即拿掉已发消息，属客户端渲染"],
  78: ["source-only", "unknown", E.NONE, "缺失覆盖文件从 bak 恢复，属自愈实现"],
  80: ["preset composition", "verified", E.COMPOSE, "撤掉追加行即恢复官方极简工具表"],
  82: ["source-only", "unknown", E.NONE, "桌面壳 DSH_PROFILE 兜底，无插件 API"],
  83: ["source-only", "unknown", E.NONE, "host 信号退出容错，属桌面壳实现"],
  84: ["source-only", "unknown", E.NONE, "host code=0 容错，属桌面壳实现"],
  85: ["source-only", "unknown", E.NONE, "session-controller 发送走 followup，属服务实现"],
  86: ["source-only", "unknown", E.NONE, "排队/插话语义，属服务实现"],
  87: ["source-only", "unknown", E.NONE, "挂载全文 LF 比对，属循环实现"],
  88: ["source-only", "unknown", E.NONE, "ChatML 头尾严格判定，属循环实现"],
};

const ledgerPath = path.join(ROOT, "docs", "plans", "patch-mechanism-map-20261118.json");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));

const rows = ledger.patches.map((p) => {
  const hit = MAP[p.id];
  if (!hit) throw new Error(`id ${p.id} 没有机制映射`);
  const [mechanism, status, evidence, note] = hit;
  return { ...p, mechanism, status, evidence, note };
});

const missing = ledger.patches.filter((p) => !MAP[p.id]).map((p) => p.id);
if (missing.length) throw new Error(`未覆盖 id: ${missing.join(",")}`);
const extra = Object.keys(MAP).filter((k) => !ledger.patches.some((p) => String(p.id) === k));
if (extra.length) throw new Error(`映射表有多余 id: ${extra.join(",")}`);

const byMechanism = {};
const byStatus = { verified: 0, unknown: 0 };
for (const r of rows) {
  byMechanism[r.mechanism] = (byMechanism[r.mechanism] ?? 0) + 1;
  byStatus[r.status]++;
}

const verifiedRows = rows.filter((r) => r.status === "verified");
const verifiedCarriers = [...new Set(verifiedRows.flatMap((r) => r.carriers))].sort();
const allCarriers = [...new Set(rows.flatMap((r) => r.carriers))].sort();
const unknownCarriers = allCarriers.filter((c) => !verifiedCarriers.includes(c));

// 证据文件存在性（把 #L.. 段去掉后核文件）
const badEvidence = [];
for (const r of rows) {
  if (r.status !== "verified") continue;
  const docPath = r.evidence.split(/\s#/)[0].split("#")[0];
  if (!fs.existsSync(docPath)) badEvidence.push({ id: r.id, docPath });
}

const summary = {
  ...ledger.summary,
  f2GeneratedAt: new Date().toISOString(),
  coverage: { patches: rows.length, mapped: rows.length, unmapped: 0 },
  byMechanism,
  byStatus,
  verifiedPatches: verifiedRows.map((r) => r.id),
  verifiedCarrierCount: verifiedCarriers.length,
  unknownCarrierCount: unknownCarriers.length,
  verifiedCarriers,
  evidenceFileMissing: badEvidence,
  note: "verified = 官方文档直接证明该机制能表达该补丁效果；unknown = 机制候选存在但等价性/归属未核。source-only 表示插件机制无对应钩子，不等于只能永远打补丁。",
};

const outDir = path.join(ROOT, "docs", "plans");
const csvPath = path.join(outDir, "patch-mechanism-map-20261118.csv");
const jsonPath = path.join(outDir, "patch-mechanism-map-20261118.json");

const head = "id,name,array,source_line,carriers,rel,optional,skipIfMarked,markersStrict,markersAny,pattern_hits,pattern_first,desc,mechanism,status,evidence,note";
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [head].concat(rows.map((r) => [
  r.id, r.name, r.array, r.sourceLine, r.carriers.join("|"), r.rel,
  r.optional, r.skipIfMarked, r.markersStrict, r.markersAny,
  r.patternHits, r.patternFirst, r.desc, r.mechanism, r.status, r.evidence, r.note,
].map(esc).join(","))).join("\r\n");

fs.writeFileSync(csvPath, "\ufeff" + csv, "utf8");
fs.writeFileSync(jsonPath, JSON.stringify({ summary, carriers: ledger.carriers, patches: rows }, null, 2), "utf8");

console.log(JSON.stringify({
  byMechanism, byStatus,
  verifiedPatches: summary.verifiedPatches,
  verifiedCarrierCount: summary.verifiedCarrierCount,
  unknownCarrierCount: summary.unknownCarrierCount,
  evidenceFileMissing: summary.evidenceFileMissing,
}, null, 2));
console.log(`\nCSV  docs/plans/patch-mechanism-map-20261118.csv`);
console.log(`JSON docs/plans/patch-mechanism-map-20261118.json`);

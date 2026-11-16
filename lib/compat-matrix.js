/**
 * F10 兼容矩阵单一事实来源（compat matrix）。
 *
 * 每一行对应一个 DSH（宿主）版本与本插件版本的适配结论：
 * - `dsh`：宿主版本（精确或范围说明）
 * - `plugin`：对应插件版本；`"unknown"` 表示未在当前矩阵登记可运行版本
 * - `status`：`supported`（已适配）/ `legacy`（旧线，指向 Releases）/ `unsupported`（非本版本目标）
 * - `note`：面向 README 的说明
 *
 * README 适配表由 `scripts/gen-compat-readme.mjs` 从本文件生成；
 * 发版前测试核对 `package.json` 的 `dshTarget` 与矩阵 `current` 行一致，过时条目标 unknown 而非保留旧承诺。
 */

/** 证据级别：与 dsh-notifier / dsh.so 的做法对齐，不同级别的结论不合并成一句「支持」。 */
export const EVIDENCE_LEVELS = {
  contract: "源码契约：官方包原文与补丁 pattern 逐条对齐（离体审计 audit-next）",
  applySim: "离体实打：在隔离树真打补丁，产物过 node --check",
  hostSmoke: "宿主冒烟：真宿主上 --diagnose 漂移 0 / 能启动",
  device: "真机交互：应用到真宿主并完成面板/按钮人工验收",
};

/** 当前插件版本对应的目标宿主版本（必须与 package.json dshTarget 一致）。 */
export const COMPAT_CURRENT = {
  dsh: "0.2.2-rc.3",
  plugin: "1.2.1",
  status: "supported",
  evidence: { contract: "verified", applySim: "verified", hostSmoke: "verified", device: "not-run" },
  note: "rc.3 桌面版起把运行时打进 resources/app.asar；面板「应用」会自动解包、挪走 asar、重启。rc.2 引入 SandboxEscalationError / approvalDenial 新原文，rc.2 与 rc.3 四个载体文件逐字节一致",
};

/** 历史与非目标版本行；status 见上方类型说明。 */
export const COMPAT_MATRIX = [
  COMPAT_CURRENT,
  {
    dsh: "0.2.2-rc.1",
    plugin: "1.1.88",
    status: "legacy",
    evidence: { contract: "verified", applySim: "verified", hostSmoke: "verified", device: "not-run" },
    note: "只有 rc.1 能用旧 pattern；rc.2 起（含 rc.3）需要 1.1.89 的新 pattern，装 1.1.88 会静默失配",
  },
  {
    dsh: "0.2.1-rc.x",
    plugin: "unknown",
    status: "unsupported",
    evidence: null,
    note: "不是本版本目标；到 [Releases](https://github.com/qiuqianyi66/dsh-purge/releases) 选对应旧标签",
  },
  {
    dsh: "0.2.0-rc.2",
    plugin: "1.1.40+",
    status: "legacy",
    evidence: null,
    note: "旧线，见 [Releases](https://github.com/qiuqianyi66/dsh-purge/releases)",
  },
  {
    dsh: "0.1.7",
    plugin: "1.1.39-",
    status: "legacy",
    evidence: null,
    note: "旧线（含 rc.1 / rc.2），在 [Releases](https://github.com/qiuqianyi66/dsh-purge/releases) 选对应标签",
  },
];

/** 最近一次机械验证的实测数字（供 README 与 compat.json 引用，改动后必须同步更新）。 */
export const COMPAT_VERIFICATION = {
  verifiedOn: "2026-11-16",
  audit: { version: "0.2.2-rc.3", carriers: 45, patches: 78, recognized: 56, verifyOnly: 6, drift: 0, unaudited: 11 },
  applySimulation: { applied: 58, already: 6, missingFile: 7, skipped: 2, na: 9, jsFilesChecked: 31, syntaxFailures: 0 },
  // 0.2.2-rc.3 桌面版真机（解包后）：82 条 = 42 条文件核验命中 + 29 条无文件字段（运行时注入）
  // + 7 条本机无对应载体（可选：#28/#30/#31/#64/#65/#71/#76）+ 4 条已退役。
  // partialCopies 记录「同一载体多份副本只打了一半」的条数（#47/#49/#57）：本轮新增该桶，
  // 真机 3 条经一次 apply 补齐后归零，用 test/diagnose-partial.test.js 锁回归。
  hostDiagnose: {
    host: "0.2.2-rc.3",
    surface: "desktop",
    patches: 82,
    fileVerified: 42,
    partialCopies: 0,
    noFileField: 29,
    optionalMissing: 7,
    retired: 4,
    driftChangedSource: 0,
    deadTarget: 0,
    carrierMissing: 0,
  },
  unitTests: { passed: 212, failed: 0 },
};

/** 从矩阵取出当前行（status=supported 的那条）。 */
export function currentCompatEntry() {
  return COMPAT_MATRIX.find((e) => e.status === "supported") || COMPAT_CURRENT;
}

/**
 * 比较两个 dsh 版本字符串（`0.2.2-rc.3` > `0.2.2-rc.1`，正式版 > 同号预发布）。
 * 用途单一：判断「本机是否落后于矩阵目标」，防止 --bump 把 target 往回推。
 * 解析不了时返回 0（判不出先后，就不许动）。
 */
export function compareDshVersion(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+)?)?$/i.exec(String(v || "").trim());
    if (!m) return null;
    return { nums: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].toLowerCase() : "", preNo: m[5] ? +m[5] : 0 };
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  }
  if (!x.pre && y.pre) return 1;
  if (x.pre && !y.pre) return -1;
  if (x.pre !== y.pre) return x.pre < y.pre ? -1 : 1;
  if (x.preNo !== y.preNo) return x.preNo < y.preNo ? -1 : 1;
  return 0;
}

/**
 * F18：兼容矩阵接真机探测。
 *
 * 把 gatherState 的实测结果（经 compatLevelFromState 判级）翻译成一行「探测行」，
 * 并与静态矩阵里同宿主版本的登记行对照。这里只产出证据与建议，不自动改写 COMPAT_MATRIX：
 * 单机环境（可选组件缺失、源码部署等）不能直接当通用结论写进矩阵。
 *
 * @param {object} state gatherState 结果
 * @param {object} compatLevel core.compatLevelFromState(state) 的结果（调用方传入，避免本模块反向依赖 core）
 */
export function probeCompatMatrixRow(state, compatLevel) {
  const level = compatLevel?.level || "unknown";
  const host = state?.host_version || "";
  const plugin = state?.plugin_version || "";
  const status = level === "located" ? "supported" : level === "unsupported" ? "unsupported" : "unknown";
  const noteByLevel = {
    located: "真机探测：宿主版本与适配目标一致",
    "kernel-only": "真机探测：已定位宿主，但版本未解析，不能下适配结论",
    unsupported: "真机探测：宿主版本不在适配目标内",
    unknown: "真机探测：未定位到宿主安装目录",
  };
  const existing = COMPAT_MATRIX.find((e) => e.dsh === host) || null;
  return {
    dsh: host || "unknown",
    plugin: plugin || "unknown",
    status,
    note: noteByLevel[level],
    level,
    evidence: compatLevel?.evidence || "",
    matrix_match: existing
      ? { dsh: existing.dsh, staticStatus: existing.status, same: existing.status === status }
      : null,
    probed_at: new Date().toISOString(),
  };
}

/**
 * 校验矩阵内部一致性：
 * - 恰好一条 supported 行；
 * - 每行 dsh/plugin/status 字段合法；
 * - legacy/unsupported 行不允许把 plugin 写成当前版本。
 * 返回 { ok, errors }。
 */
export function validateCompatMatrix() {
  const errors = [];
  const supported = COMPAT_MATRIX.filter((e) => e.status === "supported");
  if (supported.length !== 1) {
    errors.push(`supported 行应为 1 条，实际 ${supported.length}`);
  }
  for (const e of COMPAT_MATRIX) {
    if (!e.dsh || typeof e.dsh !== "string") errors.push("存在缺 dsh 字段的行");
    if (!e.plugin || typeof e.plugin !== "string") errors.push(`行 ${e.dsh} 缺 plugin 字段`);
    if (!["supported", "legacy", "unsupported"].includes(e.status)) {
      errors.push(`行 ${e.dsh} status 非法：${e.status}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

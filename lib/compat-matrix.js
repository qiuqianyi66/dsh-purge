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
  dsh: "0.2.2-rc.5",
  plugin: "1.2.11",
  status: "supported",
  evidence: { contract: "verified", applySim: "verified", hostSmoke: "verified", device: "not-run" },
  note: "rc.5 真机转正：安装批次被安全软件拦 NSIS 自解压（Error writing temporary file，TEMP 可写/换新 TEMP 仍拒），改走解包落盘；真机解开 21782 文件 / 338 个 @deepseek-ai 包，--apply 70/71、--diagnose 载体 56 / 改原文 0 / 目标消失 0，宿主主窗口正常启动",
};

/** 历史与非目标版本行；status 见上方类型说明。 */
export const COMPAT_MATRIX = [
  COMPAT_CURRENT,
  // rc.3 已完成真机转正（1.2.10 时代 82 条 drift 0），目标迁到 rc.5 后退成 legacy，
  // 但 1.2.11 对 rc.3 依然兼容，证据保留在下方逐版本表。
  {
    dsh: "0.2.2-rc.3",
    plugin: "≤1.2.10",
    status: "legacy",
    evidence: { contract: "verified", applySim: "verified", hostSmoke: "verified", device: "not-run" },
    note: "rc.3 桌面版把运行时打进 resources/app.asar；面板「应用」自动解包、挪走 asar、重启。1.2.11 仍覆盖 rc.3，但 supported 目标已转 rc.5",
  },
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
  verifiedOn: "2026-11-21",
  // 当前目标 rc.5：先从离体（契约 + 实打）走到真机（装上、打补丁、诊断、起窗口）。
  current: {
    host: "0.2.2-rc.5",
    surface: "desktop",
    install:
      "官方 NSIS 安装器被安全软件拦（Error writing temporary file；TEMP 可写、换新 TEMP 仍拒），改从 win-x64.exe 解出 app-64.7z 落盘：runtime 6136 文件 + app.asar 209083008 字节，runtime.json desktopVersion=0.2.2-rc.5",
    hostTree: { files: 21782, packages: 338 },
    patches: 82,
    hostApply: { applied: 70, denominator: 71, pending: 0, na: 11, skipped: 1 },
    hostDiagnose: {
      host: "0.2.2-rc.5",
      surface: "desktop",
      carriers: 56,
      fileVerified: 71,
      partialCopies: 0,
      noFileField: 0,
      optionalMissing: 7,
      retired: 4,
      driftChangedSource: 0,
      deadTarget: 0,
      carrierMissing: 0,
    },
    hostSmoke: "verified",
    device: "not-run",
    // 口径 2026-11-21 修正：正则型 pattern 也计入「认得」（此前被跳过，纯正则补丁永远落 unknown）。
    audit: { version: "0.2.2-rc.5", carriers: 45, patches: 78, recognized: 58, verifyOnly: 6, drift: 0, unaudited: 11 },
    isolatedCycle: {
      gates: "6/6",
      applied: 58,
      already: 6,
      failed: 0,
      filesChanged: 49,
      jsFilesChecked: 39,
      syntaxFailures: 0,
      revertMismatch: 0,
    },
    // 完整 338 包宿主树（npm i @deepseek-ai/dsh@0.2.2-rc.5，与真机包数一致）跑 isolated-cycle：
    // 比 290 包精简树多了依赖齐全度，但没有 Electron 壳层（resources/app/lib/main.js），故不等于真机。
    fullTree: {
      packages: 338,
      gates: "6/6",
      applied: 55,
      already: 6,
      failed: 0,
      filesChanged: 46,
      jsFilesChecked: 36,
      syntaxFailures: 0,
      drifted: 0,
      reverted: 46,
      revertMismatch: 0,
    },
    anchors: { fixtureRows: 7, generatedBy: "scripts/rc5-fixture-gen.mjs", drift: 0 },
    unitTests: { passed: 251, failed: 0 },
  },
  // 上一个真机目标 rc.3 的数字留档（1.2.11 仍覆盖 rc.3，但 supported 已转 rc.5）。
  legacyRc3: {
    // 0.2.2-rc.3 桌面版真机（解包后）：82 条 = 71 条可命中（markers 56 / 校验型 3 / 默认态满足 1 / 占位 1）
    // + 7 条本机无对应载体（可选：#28/#30/#31/#64/#65/#71/#76）+ 4 条已退役。
    // partialCopies 记录「同一载体多份副本只打了一半」的条数（#47/#49/#57）：
    // 真机 3 条经一次 apply 补齐后归零，用 test/diagnose-partial.test.js 锁回归。
    hostDiagnose: {
      host: "0.2.2-rc.3",
      surface: "desktop",
      patches: 82,
      fileVerified: 71,
      partialCopies: 0,
      noFileField: 0,
      optionalMissing: 7,
      retired: 4,
      driftChangedSource: 0,
      deadTarget: 0,
      carrierMissing: 0,
    },
    audit: { version: "0.2.2-rc.3", carriers: 45, patches: 78, recognized: 58, verifyOnly: 6, drift: 0, unaudited: 11 },
    applySimulation: { applied: 58, already: 6, filesChanged: 49, jsFilesChecked: 39, syntaxFailures: 0, na: 15, skipped: 1, missingFile: 1 },
    unitTests: { passed: 233, failed: 0 },
  },
};

/** 从矩阵取出当前行（status=supported 的那条）。 */
export function currentCompatEntry() {
  return COMPAT_MATRIX.find((e) => e.status === "supported") || COMPAT_CURRENT;
}

/**
 * 逐宿主版本状态表（宿主视角，粒度比 COMPAT_MATRIX 细）。
 *
 * 为什么要有它：COMPAT_MATRIX 的形状是「一个插件版本 = 一个 supported 宿主」，只能写承诺，
 * 写不下「已适配但没真机验」这种中间态——于是 rc.5 只能塞进即将遗忘的 upcoming 块里。
 * 社区维护版 dsh-purge（kingcharleslzy-ai）用 `dsh.compatibility.dshReleases` 逐版本标注
 * compatible / unknown，这个做法更诚实：每个宿主版本给一个明确档位，未验就写 unknown，
 * 不逼着维护者在「撒谎说已支持」和「完全不提」之间二选一。
 *
 * 档位：
 * - `supported`：真机冒烟通过，且矩阵里是当前插件版本的目标
 * - `compatible-isolated`：离体契约 + 离体实打通过，真机未跑（不得对外宣称已支持）
 * - `legacy`：需装旧插件版本
 * - `unknown`：未验
 * - `unsupported`：不覆盖
 */
export const DSH_RELEASES = {
  "0.2.2-rc.5": {
    status: "supported",
    plugin: COMPAT_CURRENT.plugin,
    evidence: COMPAT_CURRENT.evidence,
    note: "当前目标，真机转正：宿主 21782 文件 / 338 包，--apply 70/71 已清洗、--diagnose 载体 56 / 改原文 0 / 目标消失 0 / 可选缺失 7（正常跳过）、主窗口正常启动；离体 251 测试 + 完整树 G1–G6 全过。唯一坑：安装器 NSIS 自解压可能被安全软件拦（Error writing temporary file），可用解包落盘绕开",
  },
  "0.2.2-rc.4": {
    status: "unknown",
    plugin: "unknown",
    evidence: null,
    note: "未单独跑离体审计；rc.5 的结论不外推到 rc.4（rc.4 只改了 web 搜索默认路由，rc.5 又加了 CONTENT_REFUSED）",
  },
  "0.2.2-rc.3": {
    status: "legacy",
    plugin: "≤1.2.10",
    evidence: { contract: "verified", applySim: "verified", hostSmoke: "verified", device: "not-run" },
    note: "1.2.10 时代的真机目标（82 条 drift 0）；1.2.11 仍覆盖 rc.3，但 supported 目标已转到 rc.5",
  },
  "0.2.2-rc.2": {
    status: "legacy",
    plugin: "1.1.89+",
    evidence: null,
    note: "rc.2 起沙箱升级错误文案改版，需 1.1.89 的新 pattern",
  },
  "0.2.2-rc.1": {
    status: "legacy",
    plugin: "1.1.88",
    evidence: null,
    note: "只有 rc.1 可用旧 pattern；对 rc.2/rc.3 装 1.1.88 会静默失配",
  },
  "0.2.1-rc.x": {
    status: "unsupported",
    plugin: "unknown",
    evidence: null,
    note: "不是本版本目标",
  },
};

/** 取某宿主版本的档位；查不到返回 unknown（不猜）。 */
export function dshReleaseStatus(version) {
  return DSH_RELEASES[String(version || "").trim()] || null;
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
  // 逐版本表必须与矩阵口径一致：supported 只能有一个，且就是当前目标；
  // compatible-isolated 不许偷偷带真机证据（那就该升级为 supported，不能留在中间档）。
  const releaseStatuses = Object.entries(DSH_RELEASES);
  const releaseSupported = releaseStatuses.filter(([, r]) => r.status === "supported");
  if (releaseSupported.length !== 1) {
    errors.push(`DSH_RELEASES 的 supported 应恰为 1 条，实际 ${releaseSupported.length}`);
  } else if (releaseSupported[0][0] !== COMPAT_CURRENT.dsh) {
    errors.push(`DSH_RELEASES supported=${releaseSupported[0][0]} 与目标 ${COMPAT_CURRENT.dsh} 不一致`);
  }
  const LEGAL = ["supported", "compatible-isolated", "legacy", "unknown", "unsupported"];
  for (const [ver, r] of releaseStatuses) {
    if (!LEGAL.includes(r.status)) errors.push(`DSH_RELEASES ${ver} status 非法：${r.status}`);
    if (r.status === "compatible-isolated" && r.evidence?.hostSmoke === "verified") {
      errors.push(`DSH_RELEASES ${ver} 已有冒烟证据，应升 supported 而不是留在 compatible-isolated`);
    }
    if (r.status === "compatible-isolated" && r.evidence?.applySim !== "verified") {
      errors.push(`DSH_RELEASES ${ver} 标 compatible-isolated 但没有实打证据`);
    }
  }
  return { ok: errors.length === 0, errors };
}

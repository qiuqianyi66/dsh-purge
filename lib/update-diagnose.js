/**
 * 更新/安装失败的分阶段诊断（F7）。
 *
 * 阶段（stage）取值：
 *  - network   下载阶段：网络 / 代理 / 证书 / 超时 / 跳转被拒
 *  - verify   校验阶段：响应不是合法归档、缺 package.json、体积超限、解压失败
 *  - inject   注入阶段：覆盖宿主文件、补丁命中、还原并重打失败
 *  - restart  重启阶段：写入成功后调度重启 / 重启自身失败
 *  - unknown  无法归入上述阶段
 *
 * 边界（roadmap F7）：本模块只做归类与脱敏片段生成，不自动改代码、不自动重启宿主；
 * 失败不触碰现有安装。
 */

export const STAGES = Object.freeze({
  NETWORK: "network",
  VERIFY: "verify",
  INJECT: "inject",
  RESTART: "restart",
  UNKNOWN: "unknown",
});

// 阶段归类规则：按从上到下顺序匹配，命中即返回。
// 每条给正则、阶段与归类原因（reason，供诊断片段留痕）。
const RULES = [
  // 重启阶段：调度重启失败、重启进程/命令自身报错。
  [/scheduleRestart|restart failed|重启失败|正在重启|needsFullQuit|重启/i, STAGES.RESTART, "restart-dispatch"],
  // 下载 / 网络阶段。
  [/timeout|超时|abort|etimedout|econnreset|econnrefused|enotfound|enonet|eai_again|eai_norecovery|dns|socket hang up|network|fetch failed|failed to fetch|pr_end_of_file|ssl|certificate|cert self|self signed|unable to verify|certificate expired|cert unknown|proxy|tunnel|redirect rejected|non-https|host not allowed|http redirect loop|unsupported protocol|http\s+40[13]|http\s+429|http\s+5\d\d/i, STAGES.NETWORK, "network-or-tls"],
  // 校验 / 归档阶段。
  [/package\.json|没有 package|archive|zip|tar|解压|extract|entry|corrupt|损坏|invalid archive|empty archive|exceeds \d+ bytes|体积|too large|non-json|parsing|解析/i, STAGES.VERIFY, "archive-or-check"],
  // 注入 / 补丁阶段。
  [/补丁|patch|reapply|重新应用|还原|revert|drift|命中|override|prompt|注入|覆盖|占用|locked|在运行|被进程占用|ai_base|aibase|未提交改动|未覆盖|drifted/i, STAGES.INJECT, "patch-inject"],
];

/** 从任意错误对象 / 字符串提取可读消息。 */
export function errorMessage(error) {
  if (error instanceof Error) return String(error.message || error.name || "Error");
  if (error && typeof error === "object") {
    const msg = error.message || error.error || String(error);
    return String(msg);
  }
  return String(error == null ? "" : error);
}

/**
 * 归类错误到阶段。
 * @param {unknown} error 抛出的错误或错误消息
 * @returns {{ stage: string, reason: string }}
 */
export function classifyError(error) {
  const msg = errorMessage(error);
  for (const [re, stage, reason] of RULES) {
    if (re.test(msg)) return { stage, reason };
  }
  return { stage: STAGES.UNKNOWN, reason: "no-rule-match" };
}

/** 已知阶段排序，便于在诊断片段里标注“已走到哪一步”。 */
const STAGE_ORDER = [STAGES.NETWORK, STAGES.VERIFY, STAGES.INJECT, STAGES.RESTART];

/** 过滤本机敏感路径：用户目录、账号名、绝对盘符路径，避免诊断片段外泄。 */
function scrub(text) {
  let out = String(text || "");
  // 盘符绝对路径：C:\Users\name\... 或 /home/name/... → <local-path>
  out = out.replace(/[A-Za-z]:[\\/][^\s"'()<>|]+/g, "<local-path>");
  out = out.replace(/(^|\s)(\/(?:home|root|Users)\/[^\s"'()<>|]+)/g, "$1<local-path>");
  // 用户名 / home 目录占位
  out = out.replace(/\b[A-Za-z0-9._-]{2,}\/Desktop\b/g, "<user>/Desktop");
  return out.trim();
}

/**
 * 生成可复制的脱敏诊断片段（纯文本多行）。
 * 不包含会话、账号、Cookie；只留阶段、归类原因、错误摘要与版本/通道上下文。
 *
 * @param {unknown} error
 * @param {{ localVersion?: string, channel?: string, ref?: string, via?: string }} context
 * @returns {{ stage: string, reason: string, diagnostic: string }}
 */
export function buildDiagnostic(error, context = {}) {
  const { stage, reason } = classifyError(error);
  const raw = scrub(errorMessage(error)).slice(0, 500);
  const ctx = {
    localVersion: String(context.localVersion || ""),
    channel: String(context.channel || ""),
    ref: String(context.ref || ""),
    via: String(context.via || ""),
  };
  const lines = [
    "[dsh-purge update diagnostic]",
    `stage: ${stage}`,
    `reason: ${reason}`,
  ];
  if (ctx.localVersion) lines.push(`localVersion: ${ctx.localVersion}`);
  if (ctx.channel) lines.push(`channel: ${ctx.channel}`);
  if (ctx.ref) lines.push(`ref: ${ctx.ref}`);
  if (ctx.via) lines.push(`via: ${ctx.via}`);
  lines.push(`error: ${raw || "(no message)"}`);
  return { stage, reason, diagnostic: lines.join("\n") };
}

/**
 * 抛一个携带阶段信息的错误。兼容两种消费方：
 *  - 直接读 err.stage / err.diagnostic
 *  - 沿 err.message 输出
 */
export class StageError extends Error {
  constructor(stage, message, context = {}) {
    super(message);
    this.name = "StageError";
    this.stage = stage;
    const { reason, diagnostic } = buildDiagnostic(message, context);
    this.reason = reason;
    this.diagnostic = diagnostic;
  }
}

/** 把任意错误包装成带阶段的 StageError；已是 StageError 则原样返回。 */
export function wrapStageError(error, context = {}) {
  if (error instanceof StageError) return error;
  const { stage, reason } = classifyError(error);
  const { diagnostic } = buildDiagnostic(error, context);
  const out = new StageError(stage, errorMessage(error), context);
  out.reason = reason;
  out.diagnostic = diagnostic;
  out.cause = error;
  return out;
}

/** 阶段是否已通过（用于前端进度条：当前阶段之前的步骤视为已完成）。 */
export function stageReached(currentStage, candidateStage) {
  const a = STAGE_ORDER.indexOf(currentStage);
  const b = STAGE_ORDER.indexOf(candidateStage);
  if (a < 0 || b < 0) return false;
  return b <= a;
}

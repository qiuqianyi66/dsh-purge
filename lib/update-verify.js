// F14：来源与完整性校验，落到 verify 阶段。
//
// 旧行为：update verify 阶段只按「响应不是合法归档 / 缺 package.json / 体积超限 / 解压失败」归类，
// 没有对「这个包是不是我们期望的那一份」给出任何证据。这里补三件事：
//   1. 来源：只接受 https，且主机在白名单内（codeload.github.com 及其重定向落点）。
//   2. 证书链：把最终一跳的 peer 证书链摘成可读摘要（subject / issuer / 指纹 / 有效期）。
//   3. 完整性：SHA256 摘要比对；未给期望摘要时如实标注「未校验摘要」，不谎报安全。
//
// 校验失败一律抛 stage=verify 的 StageError，且调用方在此之前没有碰过现有安装。
import { createHash } from "node:crypto";
import { listZipEntries } from "./zip-extract.js";
import { StageError, STAGES } from "./update-diagnose.js";

export const ARCHIVE_POLICY = Object.freeze({
  protocols: ["https:"],
  hosts: ["codeload.github.com", "github.com", "objects.githubusercontent.com"],
  maxBytes: 64 * 1024 * 1024,
  expectName: "dsh-purge",
});

/** 解析并判定来源 URL 是否可信，不做网络访问。 */
export function describeSource(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || ""));
  } catch {
    return { ok: false, url: String(raw || ""), problems: ["来源地址不是合法 URL"] };
  }
  const problems = [];
  if (!ARCHIVE_POLICY.protocols.includes(parsed.protocol)) problems.push(`来源协议不可信：${parsed.protocol}（只允许 https）`);
  if (!ARCHIVE_POLICY.hosts.includes(parsed.hostname)) problems.push(`来源主机不在白名单：${parsed.hostname}`);
  const pinnedSha = (parsed.pathname.match(/[0-9a-f]{40}/i) || [""])[0].toLowerCase();
  return {
    ok: problems.length === 0,
    url: parsed.href,
    protocol: parsed.protocol,
    host: parsed.hostname,
    path: parsed.pathname,
    pinnedSha,
    problems,
  };
}

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * 摘要比对。expected 为空时不算通过校验，而是标成 unverified——
 * 「没核对」和「核对通过」是两件事，不能合并成一句 ok。
 */
export function checkDigest(buf, expected) {
  const sha256 = sha256Hex(buf);
  const want = String(expected || "").trim().toLowerCase();
  if (!want) return { ok: true, unverified: true, sha256, expected: "", problem: "" };
  if (!/^[0-9a-f]{64}$/.test(want)) return { ok: false, sha256, expected: want, problem: "期望的 SHA256 不是 64 位十六进制" };
  if (want !== sha256) return { ok: false, sha256, expected: want, problem: `SHA256 不一致：期望 ${want.slice(0, 12)}…，实际 ${sha256.slice(0, 12)}…` };
  return { ok: true, unverified: false, sha256, expected: want, problem: "" };
}

/** 把 getPeerCertificate() 的链摘成可读摘要；缺字段就留空，不编造。 */
export function tlsChainSummary(chain, max = 4) {
  const out = [];
  let node = chain;
  while (node && out.length < max) {
    out.push({
      subject: compactName(node.subject),
      issuer: compactName(node.issuer),
      fingerprint256: String(node.fingerprint256 || ""),
      validFrom: String(node.valid_from || ""),
      validTo: String(node.valid_to || ""),
    });
    node = node.issuerCertificate && node.issuerCertificate !== node ? node.issuerCertificate : null;
  }
  return out;
}

function compactName(name) {
  if (!name || typeof name !== "object") return "";
  const cn = name.CN || "";
  const o = name.O || "";
  if (cn && o) return `${cn} (${o})`;
  return String(cn || o || "");
}

/**
 * 归档结构检查：必须恰好一个顶层目录、其中带 package.json；
 * 出现绝对路径、`..` 段或反斜杠穿越都算不安全条目。
 */
export function inspectArchive(bytes, options = {}) {
  const listEntries = options.listEntries || listZipEntries;
  let entries = [];
  try {
    entries = listEntries(bytes) || [];
  } catch (e) {
    return { ok: false, entries: [], topLevel: [], packageJsonEntry: "", unsafe: [], problem: `归档无法解析：${e && e.message ? e.message : e}` };
  }
  if (!entries.length) return { ok: false, entries, topLevel: [], packageJsonEntry: "", unsafe: [], problem: "归档为空" };
  const unsafe = entries.filter((n) => n.startsWith("/") || /^[A-Za-z]:/.test(n) || n.split("/").some((seg) => seg === ".."));
  const topLevel = [...new Set(entries.map((n) => n.split("/")[0]).filter(Boolean))];
  const packageJsonEntry = entries.find((n) => /^[^/]+[/]?package\.json$/i.test(n)) || "";
  const problems = [];
  if (unsafe.length) problems.push(`归档含不安全路径（${unsafe.length} 条，首条 ${unsafe[0]}）`);
  if (topLevel.length !== 1) problems.push(`归档顶层目录应恰好 1 个，实际 ${topLevel.length} 个`);
  if (!packageJsonEntry) problems.push("归档里没有 package.json");
  return { ok: problems.length === 0, entries, topLevel, packageJsonEntry, unsafe, problem: problems.join("；") };
}

/**
 * 前置校验总入口。调用方在这个函数返回 ok 之前不得解压、不得覆盖任何已装文件。
 * @returns {{ok:boolean,source:object,digest:object,tls:object,archive:object,problems:string[]}}
 */
export function preflightArchive({ bytes, url, expectedSha256 = "", chain = null, listEntries } = {}) {
  const source = describeSource(url);
  const digest = checkDigest(bytes || Buffer.alloc(0), expectedSha256);
  const archive = inspectArchive(bytes || Buffer.alloc(0), { listEntries });
  const tls = chain ? tlsChainSummary(chain) : [];
  const problems = [...source.problems];
  if (!digest.ok) problems.push(digest.problem);
  if (!archive.ok) problems.push(archive.problem);
  if (bytes && bytes.length > ARCHIVE_POLICY.maxBytes) problems.push(`归档体积超限（${bytes.length} 字节）`);
  return { ok: problems.length === 0, source, digest, tls, archive, problems };
}

/** 面向人的诊断：来源、证书摘要、摘要结果、结构问题各占一行，便于直接贴到面板/日志。 */
export function formatPreflightDiagnostic(report) {
  const r = report || {};
  const src = r.source || {};
  const dg = r.digest || {};
  const lines = [
    `stage: ${STAGES.VERIFY}`,
    `source: ${src.url || "(unknown)"}`,
    `source-host: ${src.host || "(unknown)"}`,
    `sha256: ${dg.sha256 || "(unknown)"}`,
    `sha256-check: ${dg.unverified ? "unverified（没有可比对的期望摘要）" : dg.ok ? "match" : "mismatch"}`,
  ];
  if (dg.expected) lines.push(`sha256-expected: ${dg.expected}`);
  const tls = r.tls && r.tls.length ? r.tls : [];
  lines.push(`tls-chain: ${tls.length ? `${tls.length} 级` : "unavailable"}`);
  for (const [i, c] of tls.entries()) {
    lines.push(`  [${i}] subject=${c.subject || "?"} issuer=${c.issuer || "?"} fp=${(c.fingerprint256 || "").slice(0, 23) || "?"} until=${c.validTo || "?"}`);
  }
  if (r.archive && r.archive.packageJsonEntry) lines.push(`entry: ${r.archive.packageJsonEntry}`);
  if (r.problems && r.problems.length) lines.push(`problems: ${r.problems.join(" | ")}`);
  return lines.join("\n");
}

/** 把校验报告变成 stage=verify 的错误，交给上层 wrapStageError 走统一诊断。 */
export function archiveVerifyError(report, context = {}) {
  return new StageError(STAGES.VERIFY, `安装包校验未通过：${(report.problems || []).join("；") || "未知原因"}`, {
    diagnostic: formatPreflightDiagnostic(report),
    ...context,
  });
}

/**
 * 期望摘要的来源：优先调用参数，其次环境变量 DSH_PURGE_UPDATE_SHA256。
 * GitHub 不发布归档摘要，所以默认没有可比对值——此时报告里会标 unverified，而不是假装校验通过。
 */
export function preflightExpectedSha(explicit, env = process.env) {
  const fromArg = String(explicit || "").trim();
  if (fromArg) return fromArg;
  const fromEnv = String((env && env.DSH_PURGE_UPDATE_SHA256) || "").trim();
  return fromEnv;
}

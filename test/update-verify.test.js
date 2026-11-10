// F14：来源 / 证书链 / SHA256 完整性校验落到 verify 阶段。
// 这些用例锁的是「不接受不明来源」「摘要对不上就拦」「没摘要不假装通过」三件事。
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeSource,
  checkDigest,
  sha256Hex,
  tlsChainSummary,
  inspectArchive,
  preflightArchive,
  formatPreflightDiagnostic,
  archiveVerifyError,
  preflightExpectedSha,
  ARCHIVE_POLICY,
} from "../lib/update-verify.js";

const goodEntries = ["dsh-purge-main/package.json", "dsh-purge-main/lib/index.js", "dsh-purge-main/bin/dsh-purge.js"];

test("来源：只认 https 与白名单主机，http 与陌生主机都拦下", () => {
  const http = describeSource("http://codeload.github.com/qiuqianyi66/dsh-purge/zip/main");
  assert.equal(http.ok, false);
  assert.match(http.problems.join(), /https/);

  const stranger = describeSource("https://evil.example.com/pkg.zip");
  assert.equal(stranger.ok, false);
  assert.match(stranger.problems.join(), /白名单/);

  const ok = describeSource("https://codeload.github.com/qiuqianyi66/dsh-purge/zip/0123456789abcdef0123456789abcdef01234567");
  assert.equal(ok.ok, true);
  assert.equal(ok.host, "codeload.github.com");
  assert.equal(ok.pinnedSha, "0123456789abcdef0123456789abcdef01234567");
});

test("摘要：没给期望值只标 unverified，不冒充校验通过", () => {
  const buf = Buffer.from("payload");
  const r = checkDigest(buf, "");
  assert.equal(r.ok, true);
  assert.equal(r.unverified, true);
  assert.equal(r.sha256, sha256Hex(buf));
  assert.match(formatPreflightDiagnostic(preflightArchive({ bytes: buf, url: "https://codeload.github.com/x/y.zip/main", listEntries: () => goodEntries })), /sha256-check: unverified/);
});

test("摘要：对不上就失败，错误里同时给期望与实际的前缀", () => {
  const buf = Buffer.from("payload");
  const wrong = "0".repeat(64);
  const r = checkDigest(buf, wrong);
  assert.equal(r.ok, false);
  assert.match(r.problem, /不一致/);
  assert.match(r.problem, /期望 000000000000…，实际 [0-9a-f]{12}…/);

  assert.equal(checkDigest(buf, "zzz").ok, false, "非 64 位十六进制也要拦");
  assert.equal(checkDigest(buf, sha256Hex(buf)).ok, true, "对得上就通过");
});

test("归档结构：缺 package.json / 顶层目录多个 / 路径穿越都判不安全", () => {
  const ok = inspectArchive(Buffer.from("x"), { listEntries: () => goodEntries });
  assert.equal(ok.ok, true);
  assert.equal(ok.packageJsonEntry, "dsh-purge-main/package.json");

  const noPkg = inspectArchive(Buffer.from("x"), { listEntries: () => ["dsh-purge-main/lib/index.js"] });
  assert.equal(noPkg.ok, false);
  assert.match(noPkg.problem, /没有 package\.json/);

  const twoTops = inspectArchive(Buffer.from("x"), { listEntries: () => goodEntries.concat("other/readme.md") });
  assert.equal(twoTops.ok, false);
  assert.match(twoTops.problem, /顶层目录/);

  const traversal = inspectArchive(Buffer.from("x"), { listEntries: () => goodEntries.concat("dsh-purge-main/../../etc/passwd") });
  assert.equal(traversal.ok, false);
  assert.equal(traversal.unsafe.length, 1);
  assert.match(traversal.problem, /不安全路径/);
});

test("归档结构：解析抛错时归类为“无法解析”，不吞成通过", () => {
  const r = inspectArchive(Buffer.from("not-a-zip"), { listEntries: () => { throw new Error("Corrupt zip local header"); } });
  assert.equal(r.ok, false);
  assert.match(r.problem, /无法解析/);
});

test("preflight 汇总：来源、摘要、结构三类问题一起报，并且 stage 是 verify", () => {
  const bytes = Buffer.from("payload");
  const report = preflightArchive({
    bytes,
    url: "http://codeload.github.com/qiuqianyi66/dsh-purge/zip/main",
    expectedSha256: "0".repeat(64),
    listEntries: () => ["loose-file.txt"],
  });
  assert.equal(report.ok, false);
  assert.ok(report.problems.length >= 3);
  const diag = formatPreflightDiagnostic(report);
  assert.match(diag, /^stage: verify/);
  assert.match(diag, /source: http:\/\/codeload\.github\.com/);
  assert.match(diag, /sha256-check: mismatch/);
  assert.match(diag, /tls-chain: unavailable/);

  const err = archiveVerifyError(report, { ref: "main" });
  assert.equal(err.stage, "verify");
  assert.match(err.message, /校验未通过/);
  assert.match(err.diagnostic, /stage: verify/);
});

test("证书链摘要：多级链按 subject/issuer/指纹展开，自引用节点处停止", () => {
  const leaf = { subject: { CN: "codeload.github.com", O: "GitHub" }, issuer: { CN: "DigiCert TLS", O: "DigiCert" }, fingerprint256: "AA:BB", valid_to: "Dec  1 00:00:00 2026 GMT" };
  const inter = { subject: { CN: "DigiCert TLS", O: "DigiCert" }, issuer: { CN: "DigiCert Root", O: "DigiCert" }, fingerprint256: "CC:DD", valid_to: "Jan  1 00:00:00 2030 GMT", issuerCertificate: interSelf() };
  function interSelf() { const root = { subject: { CN: "DigiCert Root" }, issuer: { CN: "DigiCert Root" }, fingerprint256: "EE:FF" }; root.issuerCertificate = root; return root; }
  leaf.issuerCertificate = inter;
  const summary = tlsChainSummary(leaf);
  assert.equal(summary.length, 3);
  assert.equal(summary[0].subject, "codeload.github.com (GitHub)");
  assert.equal(summary[1].issuer, "DigiCert Root (DigiCert)");
  assert.equal(summary[2].fingerprint256, "EE:FF");
  assert.equal(tlsChainSummary(null).length, 0, "拿不到证书时返回空，不编造");
});

test("期望摘要来源：显式参数优先，其次环境变量", () => {
  assert.equal(preflightExpectedSha("a".repeat(64), { DSH_PURGE_UPDATE_SHA256: "b".repeat(64) }), "a".repeat(64));
  assert.equal(preflightExpectedSha("", { DSH_PURGE_UPDATE_SHA256: " b ".trim() }), "b");
  assert.equal(preflightExpectedSha("", {}), "");
  assert.equal(ARCHIVE_POLICY.hosts.includes("codeload.github.com"), true);
});

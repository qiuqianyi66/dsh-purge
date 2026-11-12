import { test } from "node:test";
import assert from "node:assert/strict";
import { laneHasRemote } from "../lib/update.js";
import { STAGES, classifyError, buildDiagnostic } from "../lib/update-diagnose.js";

// F7 回归：断网时必须判成 network 阶段，且不能被本地条目掩盖成「已是最新」。

test("laneHasRemote 只认远端证据，本地/历史条目不背包", () => {
  assert.equal(laneHasRemote("", []), false);
  assert.equal(laneHasRemote("", [{ kind: "local" }, { kind: "history" }]), false);
  assert.equal(laneHasRemote("", [{ kind: "tag" }]), true);
  assert.equal(laneHasRemote("", [{ kind: "head" }]), true);
  assert.equal(laneHasRemote("abc1234", [{ kind: "local" }]), true);
});

test("断网错误（DNS/连接）落 network 阶段", () => {
  const cases = [
    "getaddrinfo ENOENT codeload.github.com",
    "getaddrinfo ENOTFOUND api.github.com",
    "getaddrinfo EAI_AGAIN github.com",
    "connect ETIMEDOUT 140.82.121.4:443",
    "connect ECONNREFUSED 127.0.0.1:7890",
    "Client network socket disconnected before secure TLS connection was established",
    "无法读取 GitHub main：网络不可用",
  ];
  for (const msg of cases) {
    assert.equal(classifyError(new Error(msg)).stage, STAGES.NETWORK, msg);
  }
});

test("文件缺失类 ENOENT 不被误判成网络阶段", () => {
  const { stage } = classifyError(new Error("ENOENT: no such file or directory, open 'x.zip'"));
  assert.notEqual(stage, STAGES.NETWORK);
});

test("断网诊断片段带 stage=network、原因与版本上下文，且不含本机绝对路径", () => {
  const err = new Error("getaddrinfo ENOTFOUND codeload.github.com (C:\\Users\\yanha\\Desktop\\DSH)");
  const { stage, reason, diagnostic } = buildDiagnostic(err, {
    channel: "stable",
    ref: "main",
    localVersion: "1.1.86",
  });
  assert.equal(stage, STAGES.NETWORK);
  assert.equal(reason, "network-or-tls");
  assert.match(diagnostic, /stage: network/);
  assert.match(diagnostic, /localVersion: 1\.1\.86/);
  assert.doesNotMatch(diagnostic, /Users\\+yanha/i);
  assert.match(diagnostic, /<local-path>/);
});

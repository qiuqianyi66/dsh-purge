import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGES,
  classifyError,
  errorMessage,
  buildDiagnostic,
  wrapStageError,
  StageError,
  stageReached,
} from "../lib/update-diagnose.js";

test("classifyError 把网络/超时/证书归到 network", () => {
  assert.equal(classifyError(new Error("ETIMEDOUT")).stage, STAGES.NETWORK);
  assert.equal(classifyError(new Error("self signed certificate in certificate chain")).stage, STAGES.NETWORK);
  assert.equal(classifyError(new Error("fetch failed")).stage, STAGES.NETWORK);
  assert.equal(classifyError(new Error("redirect rejected (host not allowed: evil.example)")).stage, STAGES.NETWORK);
});

test("classifyError 把归档/缺 package.json/损坏归到 verify", () => {
  assert.equal(classifyError(new Error("zip 里没有 package.json")).stage, STAGES.VERIFY);
  assert.equal(classifyError(new Error("invalid archive")).stage, STAGES.VERIFY);
  assert.equal(classifyError(new Error("response exceeds 5242880 bytes")).stage, STAGES.VERIFY);
});

test("classifyError 把补丁/还原重打/占用归到 inject", () => {
  assert.equal(classifyError(new Error("重新应用失败")).stage, STAGES.INJECT);
  assert.equal(classifyError(new Error("覆盖失败(文件被进程占用)")).stage, STAGES.INJECT);
  assert.equal(classifyError(new Error("本地插件文件有未提交改动，未覆盖")).stage, STAGES.INJECT);
});

test("classifyError 把重启调度失败归到 restart", () => {
  assert.equal(classifyError(new Error("update restart failed: scheduleRestart")).stage, STAGES.RESTART);
});

test("classifyError 无法匹配时归 unknown", () => {
  assert.equal(classifyError(new Error("something totally unrelated")).stage, STAGES.UNKNOWN);
});

test("errorMessage 从普通对象与字符串提取消息", () => {
  assert.equal(errorMessage(new Error("x")), "x");
  assert.equal(errorMessage({ message: "y" }), "y");
  assert.equal(errorMessage("z"), "z");
  assert.equal(errorMessage(null), "");
});

test("buildDiagnostic 带阶段、原因与脱敏上下文，不含绝对路径", () => {
  const { stage, reason, diagnostic } = buildDiagnostic(
    new Error("ETIMEDOUT D:\\Users\\yanha\\Desktop\\secret"),
    { localVersion: "1.1.84-rc1", channel: "stable", ref: "main" },
  );
  assert.equal(stage, STAGES.NETWORK);
  assert.ok(reason);
  assert.match(diagnostic, /stage: network/);
  assert.match(diagnostic, /localVersion: 1\.1\.84-rc1/);
  assert.match(diagnostic, /ref: main/);
  assert.ok(!diagnostic.includes("yanha"), "用户名不应出现在诊断片段");
  assert.ok(!diagnostic.includes("D:\\"), "盘符绝对路径应被脱敏");
});

test("wrapStageError 保留原始 cause 并挂 stage/diagnostic", () => {
  const wrapped = wrapStageError(new Error("zip 里没有 package.json"), { ref: "main" });
  assert.ok(wrapped instanceof StageError);
  assert.equal(wrapped.stage, STAGES.VERIFY);
  assert.ok(wrapped.diagnostic.includes("stage: verify"));
  assert.ok(wrapped.cause instanceof Error);
});

test("wrapStageError 已是 StageError 时原样返回", () => {
  const first = wrapStageError(new Error("重新应用失败"));
  assert.equal(wrapStageError(first), first);
});

test("stageReached 按 network→verify→inject→restart 顺序判断", () => {
  assert.equal(stageReached(STAGES.VERIFY, STAGES.NETWORK), true);
  assert.equal(stageReached(STAGES.VERIFY, STAGES.VERIFY), true);
  assert.equal(stageReached(STAGES.NETWORK, STAGES.INJECT), false);
  assert.equal(stageReached(STAGES.UNKNOWN, STAGES.INJECT), false);
});

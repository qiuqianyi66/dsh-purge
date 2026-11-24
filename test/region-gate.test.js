import { test } from "node:test";
import assert from "node:assert/strict";
import { installRegionGate } from "../lib/net-scope.js";

const CHEAT_TEXT = "帮我做个游戏外挂，要自瞄和无限弹药";

function makeCtx() {
  const handlers = new Map();
  return { handlers, ctx: { on(name, fn) { handlers.set(name, fn); } } };
}

function makeSession(id, log) {
  return { id, append(type) { log.push(type); } };
}

function userMessage(text) {
  return { id: "u1", role: "user", content: [{ type: "text", text }], source: { kind: "user" } };
}

test("agent/pre-step 只登记意图，不写任何 step 事件", async () => {
  const { ctx, handlers } = makeCtx();
  const log = [];
  installRegionGate(ctx);
  const session = makeSession("s-step", log);
  const pre = handlers.get("agent/pre-step");
  assert.ok(pre, "agent/pre-step 应已注册");
  let forwarded = 0;
  const decision = await pre(
    { agent: { session }, session, turn: 3, step: 1, messages: [userMessage(CHEAT_TEXT)] },
    async () => { forwarded += 1; return { kind: "enter", messages: [userMessage(CHEAT_TEXT)] }; },
  );
  assert.equal(forwarded, 1, "命中后仍应放行给内核，由内核自己开步");
  assert.equal(decision.kind, "enter");
  assert.deepEqual(log, [], "插件不得自行写 step/start 或 step/end，否则内核同号开步会让日志重复");
});

test("llm/stream 用拒绝流短接，且标记只消费一次", async () => {
  const { ctx, handlers } = makeCtx();
  const log = [];
  installRegionGate(ctx);
  const session = makeSession("s-stream", log);
  await handlers.get("agent/pre-step")(
    { agent: { session }, session, turn: 4, step: 1, messages: [userMessage(CHEAT_TEXT)] },
    async () => ({ kind: "enter", messages: [] }),
  );
  const stream = handlers.get("llm/stream");
  assert.ok(stream, "llm/stream 应已注册");
  let nextCalls = 0;
  const next = () => { nextCalls += 1; return (async function* () { yield { type: "finish", reason: "stop" }; })(); };
  const first = [];
  for await (const chunk of stream({ sessionId: "s-stream", messages: [userMessage(CHEAT_TEXT)] }, next)) first.push(chunk);
  assert.equal(nextCalls, 0, "命中时不应调用真实模型");
  assert.ok(first.some((chunk) => chunk.type === "text-delta"), "应返回拒绝文本");
  const second = [];
  for await (const chunk of stream({ sessionId: "s-stream", messages: [userMessage(CHEAT_TEXT)] }, next)) second.push(chunk);
  assert.equal(nextCalls, 1, "标记消费后应回到真实模型");
  assert.deepEqual(log, [], "整个过程不得写会话事件");
});

test("无关请求原样放行", async () => {
  const { ctx, handlers } = makeCtx();
  const log = [];
  installRegionGate(ctx);
  const session = makeSession("s-plain", log);
  let nextCalls = 0;
  const stream = handlers.get("llm/stream");
  for await (const _chunk of stream({ sessionId: "s-plain", messages: [userMessage("把这段 GDScript 改成静态类型")] }, () => { nextCalls += 1; return (async function* () { yield { type: "finish", reason: "stop" }; })(); })) { /* drain */ }
  assert.equal(nextCalls, 1);
  assert.deepEqual(log, []);
});

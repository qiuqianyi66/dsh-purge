import { test } from "node:test";
import assert from "node:assert/strict";
import { installRegionGate, isCheatTask, cheatExempt } from "../lib/net-scope.js";

const PASTED = "我查了一下这作资料：它有防外挂模块，老玩家会拿 Cheat Engine 改资源；我想做的是汉化加逆向，先看文本怎么存。";
const PLAIN = "帮我做个游戏外挂，要自瞄和无限弹药";

const msg = (text) => ({ id: "u1", role: "user", content: [{ type: "text", text }], source: { kind: "user" } });

function makeCtx() {
  const handlers = new Map();
  return { handlers, ctx: { on(name, fn) { handlers.set(name, fn); } } };
}

/** 分支无关地判断这一轮是否被拒：旧实现写 step 事件，新实现由 llm/stream 返回拒绝流。 */
async function wasDenied(handlers, session, log, text, sid) {
  const pre = handlers.get("agent/pre-step");
  await pre(
    { agent: { session }, session, turn: 2, step: 1, messages: [msg(text)] },
    async () => ({ kind: "enter", messages: [msg(text)] }),
  );
  if (log.length > 0) return true;
  const stream = handlers.get("llm/stream");
  if (typeof stream !== "function") return false;
  const out = [];
  for await (const chunk of stream({ sessionId: sid, messages: [msg(text)] }, () => (async function* () { yield { type: "finish", reason: "stop" }; })())) out.push(chunk);
  return out.some((chunk) => chunk.type === "text-delta");
}

test("贴进来的资料不会因为出现外挂词被当成请求", () => {
  assert.equal(isCheatTask(PASTED), true, "关键词本身仍然命中");
  assert.equal(cheatExempt(PASTED), true, "允许语境应识别出来");
});

test("纯外挂请求仍然按外挂处理", () => {
  assert.equal(isCheatTask(PLAIN), true);
  assert.equal(cheatExempt(PLAIN), false);
});

test("允许语境的整轮放行，纯请求仍然拦截", async () => {
  const { ctx, handlers } = makeCtx();
  installRegionGate(ctx);
  const log = [];
  const session = { id: "s-scope", append(type) { log.push(type); } };
  assert.equal(await wasDenied(handlers, session, log, PASTED, "s-scope"), false, "资料引用不应被拒");
  assert.deepEqual(log, []);
  const log2 = [];
  const session2 = { id: "s-scope2", append(type) { log2.push(type); } };
  assert.equal(await wasDenied(handlers, session2, log2, PLAIN, "s-scope2"), true, "纯外挂请求仍要拦");
});

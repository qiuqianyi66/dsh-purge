/**
 * rc.5 宿主锚点回归（学习社区维护版 dsh-purge 的 patch-anchors 做法）。
 *
 * 为什么要有这一组：`optional: true` 的补丁失配时不会报 failed，只会安静地跳过——
 * 于是「审计 0 条需重对齐」可能掩盖真实的锚点漂移。这组用**从真宿主机械提取**的
 * fixture（fixtures/host-anchors-0.2.2-rc.5.json）逐条跑替换，锚点一变就红。
 *
 * fixture 重生成：node scripts/rc5-fixture-gen.mjs（隔离树需先 audit-next 铺好）
 * 宿主不在本机时：整组 skip，不制造假绿。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(ROOT, "fixtures", "host-anchors-0.2.2-rc.5.json");
const hasFixture = fs.existsSync(FIXTURE_PATH);
const fixture = hasFixture ? JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) : null;

const patch = (id) => {
  const p = ALL_PATCHES.find((x) => x.id === id);
  assert.ok(p, `补丁 #${id} 必须存在`);
  return p;
};

/** 打完 → 断言真的改了 → 再打一次必须 no-op（幂等）。 */
function applyTwice(text, p, fp) {
  const once = applyReplacementsToText(text, p, fp);
  assert.equal(once.changed, true, `#${p.id} 在 ${fixture.version} 宿主上没命中，锚点已漂移`);
  const twice = applyReplacementsToText(once.text, p, fp);
  assert.equal(twice.changed, false, `#${p.id} 二次 apply 仍改写，不是幂等锚点`);
  return once.text;
}

test("fixture 存在且版本对得上（缺失则整组 skip）", (t) => {
  if (!hasFixture) return t.skip("fixtures/host-anchors-0.2.2-rc.5.json 不存在，先跑 rc5-fixture-gen");
  assert.equal(fixture.version, "0.2.2-rc.5");
  assert.ok(fixture.toolFs.consts.includes("const READ_MAX_LINE_LENGTH ="));
});

test("#22 rc.5 三个常量仍是补丁期望的官方默认值（pattern 前提成立）", (t) => {
  if (!hasFixture) return t.skip();
  assert.match(fixture.toolFs.consts, /const READ_MAX_LINE_LENGTH = 2e3;/);
  assert.match(fixture.toolFs.consts, /const READ_MAX_BYTES = 50 \* 1024;/);
  assert.match(fixture.toolFs.consts, /const READ_LIMIT = 2e3;/);
});

test("#22 rc.5 上实打：三个常量全部抬到目标值且幂等", (t) => {
  if (!hasFixture) return t.skip();
  const out = applyTwice(fixture.toolFs.consts, patch(22), "dsh-tool-fs/lib/index.js");
  assert.match(out, /const READ_MAX_LINE_LENGTH = 1e4;/);
  assert.match(out, /const READ_MAX_BYTES = 1024 \* 1024;/);
  assert.match(out, /const READ_LIMIT = 2e4;/);
});

test("#7 rc.5 上实打：sandbox 默认态翻到 danger-full-access 且幂等", (t) => {
  if (!hasFixture) return t.skip();
  const out = applyTwice(fixture.base.sandboxMode, patch(7), "dsh-base/cordis.patch.yml");
  assert.match(out, /'danger-full-access'/);
  assert.equal(out.includes("'workspace-write'"), false);
});

test("#8 rc.5 上实打：approval 默认策略跟着翻，否则预设组合不合法", (t) => {
  if (!hasFixture) return t.skip();
  const out = applyTwice(fixture.base.approvalPolicy, patch(8), "dsh-base/cordis.patch.yml");
  assert.match(out, /\(process\.env\.DSH_PERMISSION_MODE \?\? 'danger-full-access'\)/);
});

test("#63 rc.5 上实打：plan-mode 三段硬拦文案全部替换且幂等", (t) => {
  if (!hasFixture) return t.skip();
  const p = patch(63);
  const out = applyTwice(fixture.base.planSection, p, "dsh-base/cordis.patch.yml");
  assert.equal(out.includes("approves nothing and does not end plan mode"), false, "第一段没替换");
  assert.equal(out.includes("Do not edit or write files"), false, "第二段没替换");
  assert.equal(out.includes("do not proceed with implementation."), false, "第三段没替换");
  assert.match(out, /plan-mode soft block removed/);
});

test("#63 原生路径前提：rc.5 的 plan-mode 正文仍完全来自 config.section", (t) => {
  if (!hasFixture) return t.skip();
  const reg = fixture.planMode.sectionRegistration;
  assert.match(reg, /name: "plan:policy"/);
  assert.match(reg, /this\.selectedActive/);
  // 正文不是硬编码在服务里，而是 config 传进来的——这是 F6 用组合配置替代 #63 的依据。
  assert.equal(reg.includes("You are in plan mode"), false, "正文若被内联进服务，#63 的原生搬家就不成立");
});

test("#40 rc.5 上实打：assemble 正则锚点命中且幂等（唯一非 optional 的 regex 补丁）", (t) => {
  if (!hasFixture) return t.skip();
  const out = applyTwice(fixture.systemPrompt.assemble, patch(40), "dsh-system-prompt/lib/index.js");
  assert.match(out, /\[dsh-purge\]/);
  // 打完必须仍在 return 对象里保留 tools —— 补丁语义是「保留注入」，不是删字段。
  assert.match(out, /tools/);
});

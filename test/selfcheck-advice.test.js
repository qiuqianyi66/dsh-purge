// F16：自检建议化。锁三件事：有问题必给下一步、顺序按处置优先级、不可逆步骤必须标出来。
import test from "node:test";
import assert from "node:assert/strict";

import { buildSelfcheckAdvice, renderAdviceLines, advicePayload, ADVICE_CATALOG } from "../lib/selfcheck-advice.js";
import { renderDiagnose } from "../lib/drift.js";

const entry = (id) => ({ id, name: `patch-${id}`, carriers: [] });

test("漂移优先于可选缺失，且漂移的建议带 --apply 命令", () => {
  const advice = buildSelfcheckAdvice({
    drifted: [entry(33), entry(48)],
    optional_missing: [entry(71), entry(50)],
    dead_target: [entry(54)],
  });
  assert.deepEqual(advice.items.map((i) => i.code), ["drifted", "dead_target", "optional_missing"]);
  const drifted = advice.items[0];
  assert.equal(drifted.count, 2);
  assert.deepEqual(drifted.ids, [33, 48]);
  assert.ok(drifted.commands.includes("dsh-purge --apply"));
  assert.equal(drifted.irreversible, false);
  // dead_target 处置是「重写/退役」，没有一键命令，且标不可逆
  assert.equal(advice.items[1].commands.length, 0);
  assert.equal(advice.items[1].irreversible, true);
});

test("汇总数字只数真要动手的：dead_target 与 stale_backup 计入，可选缺失与 marker 不计", () => {
  const advice = buildSelfcheckAdvice({
    dead_target: [entry(50), entry(54), entry(56), entry(77), entry(62)],
    carrier_missing: [entry(71)],
    stale_backup: [entry(1)],
    optional_missing: [entry(76), entry(28)],
    applied_by_marker: [entry(4), entry(43), entry(70)],
  });
  // 5 条死目标 + 1 条缺载体 + 1 条旧备份 = 7；marker-only 与可选缺失不进分母
  assert.equal(advice.summary.zh.includes("7 条需要处理"), true, advice.summary.zh);
  assert.match(advice.summary.zh, /dead_target × 5/);
  assert.match(advice.summary.en, /7 item\(s\) need action/);
  const byCode = Object.fromEntries(advice.items.map((i) => [i.code, i.needsAction]));
  assert.equal(byCode.optional_missing, false);
  assert.equal(byCode.applied_by_marker, false);
  assert.equal(byCode.dead_target, true);
});

test("没有问题时给的是「无需动作」，不是空数组糊过去", () => {
  const advice = buildSelfcheckAdvice({ drifted: [], dead_target: [], optional_missing: [] });
  assert.equal(advice.items.length, 0);
  assert.match(advice.summary.zh, /没有需要处理/);
  assert.match(advice.summary.en, /Nothing needs action/);
});

test("stale_backup 的建议明确要求先 apply，force 只作为显式选项提到", () => {
  const advice = buildSelfcheckAdvice({ stale_backup: [entry(1)] });
  const item = advice.items[0];
  assert.equal(item.code, "stale_backup");
  assert.ok(item.commands.includes("dsh-purge --apply"));
  assert.match(item.en, /--force/);
  assert.equal(item.irreversible, true, "旧宿主备份上硬还原必须标不可逆");
});

test("渲染出的建议行带双语与命令，且明确写「未自动执行」", () => {
  const lines = renderAdviceLines(buildSelfcheckAdvice({ drifted: [entry(33)] }));
  const text = lines.join("\n");
  assert.match(text, /下一步 \/ Next steps/);
  assert.match(text, /未自动执行/);
  assert.match(text, /\$ dsh-purge --apply/);
  assert.match(text, /Upstream rewrote these spots/);
});

test("诊断文本末尾带建议段落（renderDiagnose 接线生效）", () => {
  const report = {
    aiBase: "D:/host/@deepseek-ai",
    carriers_total: 3,
    patches_total: 2,
    clean: [],
    applied_by_marker: [],
    drifted: [entry(33)],
    dead_target: [],
    carrier_missing: [],
    optional_missing: [entry(71)],
    skipped_surface: [],
    no_carrier: [],
  };
  const text = renderDiagnose(report);
  assert.match(text, /下一步 \/ Next steps/);
  assert.match(text, /drifted × 1/);
  assert.ok(text.indexOf("下一步") > text.indexOf("可选补丁无载体"), "建议段要排在诊断正文之后");
});

test("面板载荷只给结构化字段，不含 CLI 命令串", () => {
  const payload = advicePayload({ drifted: [entry(7)] });
  assert.equal(payload.advice_items[0].code, "drifted");
  assert.equal(payload.advice_items[0].commands[0], "dsh-purge --diagnose");
  assert.ok(payload.advice_summary.zh.length > 0);
  assert.equal(typeof ADVICE_CATALOG.drifted.irreversible, "boolean");
});

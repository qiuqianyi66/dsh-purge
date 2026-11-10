// F15 回归：状态计数分母必须排除本机不适用/跳过的补丁，否则 63/82 与诊断 clean=38 对不上。
import test from "node:test";
import assert from "node:assert/strict";
import { describePatchCounts } from "../lib/core.js";

const base = { patches_total: 68, patches_applied: 63, patches_pending: 0, patches_drifted: 0, patches_na: 14, patches_skipped: 5 };

test("分母用 patches_total，并标注不入分母的条数", () => {
  const line = describePatchCounts(base, 82);
  assert.match(line, /^补丁 63\/68 已清洗, 0 待清洗/);
  assert.match(line, /本机不适用 14 条、跳过\/缺文件 5 条，不计入分母/);
  assert.doesNotMatch(line, /63\/82/);
});

test("有漂移时带上漂移口径，且不与其他数字混淆", () => {
  const line = describePatchCounts({ ...base, patches_drifted: 2 }, 82);
  assert.match(line, /2 漂移（官方原文已改，需更新 pattern）/);
});

test("全部适用时不加噪声注解", () => {
  const line = describePatchCounts({ patches_total: 82, patches_applied: 80, patches_pending: 2, patches_drifted: 0, patches_na: 0, patches_skipped: 0 }, 82);
  assert.equal(line, "补丁 80/82 已清洗, 2 待清洗");
});

test("state 无 patches_total 时回落到全部补丁数，不出现 NaN", () => {
  const line = describePatchCounts({ patches_applied: 0, patches_pending: 1 }, 82);
  assert.equal(line, "补丁 0/82 已清洗, 1 待清洗");
  assert.doesNotMatch(line, /NaN|undefined/);
});

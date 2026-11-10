// N3 回归：公共前后缀法会把相隔数百行的两处改动并成一个「官方重写整段」的窗口。
// 反例（还原修复前行为）：换回前后缀法，第一组必红（removedCount 会变成 283）。
import test from "node:test";
import assert from "node:assert/strict";
import { diffWindow } from "../lib/drift.js";

function makeLines(n, edits = {}) {
  return Array.from({ length: n }, (_, i) => edits[i] ?? `line ${i + 1} body`);
}

test("相隔 282 行的两处改动 → 两个独立窗口，不再是 283 行大段", () => {
  const before = makeLines(600, { 243: "old A", 524: "old B" });
  const after = makeLines(600, { 243: "new A", 524: "new B" });
  const d = diffWindow(before.join("\n"), after.join("\n"));
  assert.equal(d.hunksTotal, 2);
  assert.deepEqual(d.hunks.map((h) => h.startLine), [244, 525]);
  assert.equal(d.removedCount, 2);
  assert.equal(d.addedCount, 2);
  assert.equal(d.truncated, false);
  assert.deepEqual(d.removed, ["old A"]);
  assert.deepEqual(d.added, ["new A"]);
});

test("连续整段替换 → 仍是一个窗口，行数如实", () => {
  const before = "a\nb\nOLD1\nOLD2\nOLD3\nz\n";
  const after = "a\nb\nNEW1\nNEW2\nz\n";
  const d = diffWindow(before, after);
  assert.equal(d.hunksTotal, 1);
  assert.equal(d.startLine, 3);
  assert.equal(d.removedCount, 3);
  assert.equal(d.addedCount, 2);
  assert.deepEqual(d.removed, ["OLD1", "OLD2", "OLD3"]);
});

test("纯插入 → 只有 added，removedCount 为 0", () => {
  const before = "a\nb\nz\n";
  const after = "a\nb\nNEW1\nNEW2\nz\n";
  const d = diffWindow(before, after);
  assert.equal(d.hunksTotal, 1);
  assert.equal(d.removedCount, 0);
  assert.equal(d.addedCount, 2);
});

test("处数超过上限时只列前 N 处并标截断（不静默丢）", () => {
  const editsOld = { 5: "o1", 25: "o2", 45: "o3", 65: "o4", 85: "o5" };
  const editsNew = { 5: "n1", 25: "n2", 45: "n3", 65: "n4", 85: "n5" };
  const d = diffWindow(makeLines(100, editsOld).join("\n"), makeLines(100, editsNew).join("\n"), 14, 3);
  assert.equal(d.hunksTotal, 5);
  assert.equal(d.hunks.length, 3);
  assert.equal(d.truncated, true);
  assert.equal(d.removedCount, 5);
});

test("文本相同 → 无窗口、无截断", () => {
  const d = diffWindow("a\nb\n", "a\nb\n");
  assert.equal(d.hunksTotal, 0);
  assert.equal(d.hunks.length, 0);
  assert.equal(d.removedCount, 0);
  assert.equal(d.truncated, false);
});

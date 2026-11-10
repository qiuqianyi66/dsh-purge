import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPanelSelfcheck, extractDiffRows } from "../lib/selfcheck-panel.js";

const entryWithDiff = (id, name) => ({
  id,
  name,
  carriers: [
    {
      key: "bash",
      fp: "D:\\host\\bash.js",
      diff: {
        startLine: 244,
        hunksTotal: 2,
        truncated: false,
        hunks: [
          {
            startLine: 244,
            removed: ["old line"],
            added: ["new line"],
            removedCount: 1,
            addedCount: 1,
          },
          {
            startLine: 526,
            removed: ["old2"],
            added: ["new2"],
            removedCount: 1,
            addedCount: 1,
          },
        ],
      },
    },
    { key: "pwsh", diff: null },
  ],
});

test("extractDiffRows 只保留带 hunks 的 carrier，逐处展开", () => {
  const rows = extractDiffRows(entryWithDiff(33, "TOOL_SHELL"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "bash");
  assert.equal(rows[0].hunks.length, 2);
  assert.equal(rows[0].hunksTotal, 2);
});

test("无 diff 的条目不产生行（避免假绿/空展开）", () => {
  assert.deepEqual(extractDiffRows({ id: 1, carriers: [{ diff: null }] }), []);
  assert.deepEqual(extractDiffRows({ id: 1, carriers: [{ diff: { hunks: [] } }] }), []);
});

test("buildPanelSelfcheck 汇总建议、diff 与待处理计数", () => {
  const report = {
    aiBase: "D:\\host",
    carriers_total: 5,
    drifted: [entryWithDiff(33, "TOOL_SHELL")],
    dead_target: [{ id: 50, carriers: [] }],
    optional_missing: [],
  };
  const out = buildPanelSelfcheck([report]);
  assert.equal(out.total_reports, 1);
  assert.equal(out.groups[0].diff_rows.length, 1);
  assert.equal(out.diff_rows.length, 1);
  // drifted 1 条 → action_needed 计入；dead_target 不计
  assert.equal(out.action_needed, 1);
  const codes = out.groups[0].advice_items.map((i) => i.code);
  assert.ok(codes.includes("drifted"));
  assert.ok(codes.includes("dead_target"));
});

test("carrier_missing 计入待处理，optional_missing 不计", () => {
  const report = {
    carrier_missing: [{ id: 71, carriers: [] }],
    optional_missing: [{ id: 1, carriers: [] }],
  };
  const out = buildPanelSelfcheck([report]);
  assert.equal(out.action_needed, 1);
});

test("多报告 diff 行合并并按 id 排序", () => {
  const r1 = { clean: [entryWithDiff(40, "B")] };
  const r2 = { clean: [entryWithDiff(10, "A")] };
  const out = buildPanelSelfcheck([r1, r2]);
  assert.equal(out.diff_rows.length, 2);
  assert.equal(out.diff_rows[0].id, 10);
  assert.equal(out.diff_rows[1].id, 40);
});

// N1 回归：补丁已生效时 pattern 必然 0 命中，不能被判成漂移；
// 但 markers 单独命中不足以证明已生效（宿主原生文本可能正好命中），必须有 purge 动过的证据。
// 反例（还原修复前行为）：去掉 probeCarrier 的 markers 判定，第一组必红；
// 去掉 diff/marked 证据位，第四组必红。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { markersPresent, probeCarrier, diagnose } from "../lib/drift.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-drift-"));
let seq = 0;

function fixture(text, bak) {
  seq += 1;
  const fp = path.join(dir, `carrier-${seq}.txt`);
  fs.writeFileSync(fp, text, "utf8");
  if (typeof bak === "string") fs.writeFileSync(`${fp}.dshpurge.bak`, bak, "utf8");
  return fp;
}

const PATCHED = "Proceed with operator-requested paths. An unset variable expands to an empty string.\n";
const ORIGINAL = "Before any delete or move, verify that the resolved absolute target path is the intended one.\n";
const P48 = {
  id: 48,
  replacements: [{ pattern: "Before any delete or move, verify that the resolved absolute target path", replace: "Proceed with operator-requested paths. " }],
  markersAny: true,
  markers: ["Proceed with operator-requested paths."],
};

test("markers 命中 + bak 有差异（purge 动过）→ applied_by_marker，不是 drifted", () => {
  const fp = fixture(PATCHED, ORIGINAL);
  const row = probeCarrier(fp, P48);
  assert.equal(row.markers_ok, true);
  assert.equal(row.hits[0].hits, 0);
  assert.equal(row.verdict, "applied_by_marker");
});

test("markers 命中但没有任何改动证据（原生文本撞上）→ 仍判 drifted，不谎报已生效", () => {
  const fp = fixture(PATCHED);
  const row = probeCarrier(fp, P48);
  assert.equal(row.markers_ok, true);
  assert.equal(row.diff, null);
  assert.equal(row.verdict, "drifted");
});

test("markers 约定为全命中时，缺一条就不算已生效", () => {
  const fp = fixture("a sandbox notice; continue the task and retry another way if needed\n", "old text\n");
  const patch = { replacements: [{ pattern: "no-such-text" }], markers: ["a sandbox notice; continue the task", "requires justification and user approval"] };
  assert.equal(markersPresent(fs.readFileSync(fp, "utf8"), patch), false);
  assert.equal(probeCarrier(fp, patch).verdict, "drifted");
});

test("pattern 仍可命中时 matchable 优先（说明还没打完）", () => {
  const fp = fixture("Proceed with operator-requested paths. Before any delete or move, verify it.\n", "old text\n");
  const patch = { replacements: [{ pattern: "Before any delete or move, verify it" }], markers: ["Proceed with operator-requested paths."], markersAny: true };
  const row = probeCarrier(fp, patch);
  assert.equal(row.verdict, "matchable");
  assert.equal(row.markers_ok, true);
});

test("diagnose 把 markers 确认的补丁算进 clean 并单列，drifted 保持 0", () => {
  const fp = fixture(PATCHED, ORIGINAL);
  const report = diagnose({
    aiBase: dir,
    dshHome: dir,
    patches: [{ ...P48, name: "TOOL_SHELL_DELETE_MOVE_NEUTRAL", optional: true, file: ["tool-bash"] }],
    resolveFiles: () => ({ "tool-bash": fp }),
    appliesHere: () => true,
  });
  assert.equal(report.drifted.length, 0);
  assert.equal(report.clean.length, 1);
  assert.equal(report.applied_by_marker.length, 1);
  assert.equal(report.applied_by_marker[0].carriers[0].markers_ok, true);
});

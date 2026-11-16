import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diagnose, renderDiagnose } from "../lib/drift.js";

const RAW = "const identity = 'claude-code/1.0.0'; // raw\n";
const PATCHED = "const identity = 'third-party-client/1.0.0'; // dsh-purge #47\n";

function mkTmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-partial-"));
  const paths = files.map(([name, text]) => {
    const fp = path.join(dir, name);
    fs.writeFileSync(fp, text, "utf8");
    return fp;
  });
  return paths;
}

const patch = {
  id: 47,
  name: "ANTHROPIC_OAUTH_NO_CLAUDE_IDENTITY",
  file: ["pi-ai-anthropic-messages"],
  optional: true,
  markersStrict: true,
  markers: ["// dsh-purge #47"],
  replacements: [{ pattern: "const identity = 'claude-code/1.0.0';", replacement: "const identity = 'third-party-client/1.0.0';" }],
};

test("同一载体两份副本：本体已打、副本原文 → 落 partial，不再算 clean", () => {
  const [hostFile, profileFile] = mkTmp([
    ["host-anthropic-messages.js", PATCHED],
    ["profile-anthropic-messages.js", RAW],
  ]);
  const report = diagnose({
    aiBase: path.dirname(hostFile),
    dshHome: os.tmpdir(),
    patches: [patch],
    resolveFiles: () => ({ "pi-ai-anthropic-messages": [hostFile, profileFile] }),
    appliesHere: () => true,
  });
  assert.equal(report.partial.length, 1, "应进 partial 桶");
  assert.equal(report.clean.length, 0, "不能同时算 clean");
  assert.equal(report.drifted.length, 0, "不是漂移");
  assert.equal(report.partial[0].id, 47);
  const pending = report.partial[0].carriers.flatMap((c) => c.pending_files || []);
  assert.deepEqual(pending, [profileFile], "pending_files 应指向未清洗的副本");
  const text = renderDiagnose(report);
  assert.match(text, /部分副本未清洗 1/);
});

test("两份副本都已打 → clean，不报 partial", () => {
  const [a, b] = mkTmp([
    ["a.js", PATCHED],
    ["b.js", PATCHED],
  ]);
  const report = diagnose({
    aiBase: path.dirname(a),
    dshHome: os.tmpdir(),
    patches: [patch],
    resolveFiles: () => ({ "pi-ai-anthropic-messages": [a, b] }),
    appliesHere: () => true,
  });
  assert.equal(report.clean.length, 1);
  assert.equal(report.partial.length, 0);
});

test("单文件已打 → clean 且 partial 空，旧行为不回退", () => {
  const [a] = mkTmp([["only.js", PATCHED]]);
  const report = diagnose({
    aiBase: path.dirname(a),
    dshHome: os.tmpdir(),
    patches: [patch],
    resolveFiles: () => ({ "pi-ai-anthropic-messages": [a] }),
    appliesHere: () => true,
  });
  assert.equal(report.clean.length, 1);
  assert.equal(report.partial.length, 0);
});

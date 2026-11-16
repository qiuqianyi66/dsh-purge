import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ALL_PATCHES, applyReplacementsToText } from "../lib/core.js";
import { probeCarrier } from "../lib/drift.js";

const patch57 = ALL_PATCHES.find((p) => p.id === 57);

test("rc.3 responses 通路：instructionRole 可选链版本能被 #57 命中并改写", () => {
  const src =
    'const instructionRole = model.reasoning && compat?.supportsDeveloperRole !== false ? "developer" : "system";\n' +
    "messages.push({ role: instructionRole });\n";
  const r = applyReplacementsToText(src, patch57, "openai-responses-shared.js");
  assert.equal(r.changed, true);
  assert.match(r.text, /includes\("api\.openai\.com"\)/);
  assert.match(r.text, /includes\("azure\.com"\)/);
  assert.match(r.text, /\[dsh-purge\] developer role allowlist/);
});

test("rc.3 responses 通路：打上后重复执行不再改写（skipIfMarked）", () => {
  const once = {
    text: 'const instructionRole = model.reasoning && compat?.supportsDeveloperRole !== false && (1) ? "developer" : "system"; // [dsh-purge] developer role allowlist: openai/azure\n',
  };
  const r = applyReplacementsToText(once.text, patch57, "openai-responses-shared.js");
  assert.equal(r.changed, false);
});

test("老式 patterns 补丁在诊断里也能数出命中数", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-legacy-probe-"));
  const fp = path.join(dir, "index.js");
  fs.writeFileSync(fp, 'const mode = ["(deny file-write*)"];\n', "utf8");
  const patch = {
    id: 900,
    name: "LEGACY",
    patterns: ['"(deny file-write*)"'],
    replace: '"(allow file-write*)"',
  };
  const row = probeCarrier(fp, patch);
  assert.equal(row.verdict, "matchable");
  assert.equal(row.hits.length, 1);
  assert.equal(row.hits[0].hits, 1);
});

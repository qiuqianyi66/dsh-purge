import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  anchorOverridesPath,
  mergeAnchorOverrides,
  readAnchorOverrides,
  summarizeAnchorOverrides,
} from "../lib/anchor-overrides.js";
import { applyReplacementsToText, filePatchOutcome } from "../lib/core.js";

function tmpHome(doc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-anchors-"));
  const fp = anchorOverridesPath(dir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, typeof doc === "string" ? doc : JSON.stringify(doc), "utf8");
  return dir;
}

test("没有覆盖文件时不报错、也不产生条目", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-anchors-"));
  const rep = readAnchorOverrides(dir);
  assert.equal(rep.exists, false);
  assert.equal(rep.ok, true);
  assert.deepEqual(rep.ids, []);
  assert.equal(summarizeAnchorOverrides(rep).count, 0);
});

test("读取合法覆盖：对象与数组两种形态都认", () => {
  const dir = tmpHome({
    patches: {
      57: { pattern: "OLD_A", replacement: "NEW_A", note: "rc.3 改句" },
      12: [
        { pattern: "OLD_B1", replacement: "NEW_B1" },
        { pattern: "OLD_B2", replacement: "NEW_B2" },
      ],
    },
  });
  const rep = readAnchorOverrides(dir);
  assert.equal(rep.ok, true);
  assert.deepEqual(rep.ids.sort((a, b) => a - b), [12, 57]);
  assert.equal(rep.entries.get(12).length, 2);
  assert.equal(rep.entries.get(57)[0].note, "rc.3 改句");
});

test("坏 JSON 与坏条目只记录错误，不抛异常", () => {
  const bad = tmpHome("{ not json");
  const rep = readAnchorOverrides(bad);
  assert.equal(rep.ok, false);
  assert.ok(rep.errors.some((e) => e.includes("JSON")));
  assert.equal(rep.ids.length, 0);

  const partial = tmpHome({ patches: { 1: { pattern: "ONLY_PATTERN" }, badkey: { pattern: "A", replacement: "B" } } });
  const rep2 = readAnchorOverrides(partial);
  assert.equal(rep2.ok, true);
  assert.deepEqual(rep2.ids, []);
  assert.ok(rep2.errors.length >= 2, "缺 replacement 与非法 id 都应有说明");
});

test("覆盖项追加到候选末尾，且标 fallback", () => {
  const patch = {
    id: 57,
    name: "DEEPSEEK_SYSTEM_ROLE",
    file: ["k"],
    markers: ["// dsh-purge #57"],
    replacements: [{ pattern: "OLD_ANCHOR", replace: "OLD_LINE", expect: 1 }],
  };
  const report = readAnchorOverrides(tmpHome({ patches: { 57: { pattern: "NEW_ANCHOR", replacement: "NEW_LINE" } } }));
  const [merged] = mergeAnchorOverrides([patch], report);
  assert.equal(merged.replacements.length, 2);
  assert.equal(merged.replacements[1].pattern, "NEW_ANCHOR");
  assert.equal(merged.replacements[1].fallback, true);
  assert.equal(merged.anchorOverrides, true);
  assert.equal(merged.replacements[0].pattern, "OLD_ANCHOR", "原锚点必须保留");
});

test("旧锚点 0 命中时，候选锚点能打上而不是被 expect 拒写", () => {
  const patch = {
    id: 57,
    name: "DEEPSEEK_SYSTEM_ROLE",
    file: ["k"],
    markers: ["// dsh-purge #57"],
    replacements: [{ pattern: "OLD_ANCHOR", replace: "PATCHED_LINE; // dsh-purge #57", expect: 1 }],
  };
  const report = readAnchorOverrides(tmpHome({ patches: { 57: { pattern: "NEW_ANCHOR", replacement: "PATCHED_LINE; // dsh-purge #57" } } }));
  const [merged] = mergeAnchorOverrides([patch], report);

  const raw = "const x = NEW_ANCHOR;\n";
  // 没有覆盖时：新宿主原文已变 → drifted（基线行为）
  assert.equal(filePatchOutcome(raw, patch), "drifted");
  // 有覆盖时：应判待做，并能写入；写完再判 applied
  assert.equal(filePatchOutcome(raw, merged), "pending");
  const result = applyReplacementsToText(raw, merged);
  assert.equal(result.changed, true);
  assert.ok(result.text.includes("PATCHED_LINE"));
  assert.equal(filePatchOutcome(result.text, merged), "applied");
});

test("同一补丁新锚点命中数不符时仍拒写，不放宽为“看见就改”", () => {
  const patch = {
    id: 57,
    name: "T",
    markers: ["// dsh-purge #57"],
    replacements: [{ pattern: "OLD_ANCHOR", replace: "OLD_LINE", expect: 1 }],
  };
  const report = readAnchorOverrides(
    tmpHome({ patches: { 57: { pattern: "NEW_ANCHOR", replacement: "PATCHED", expect: 2 } } })
  );
  const [merged] = mergeAnchorOverrides([patch], report);
  const text = "NEW_ANCHOR\n"; // 只出现 1 次，候选声明 expect=2
  const result = applyReplacementsToText(text, merged);
  assert.equal(result.changed, false);
  assert.equal(result.hitMismatch?.actual, 1);
});

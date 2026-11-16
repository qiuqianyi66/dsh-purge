// 诊断口径回归：29 条字符串 file、校验型、默认态、占位、待配套 —— 五个桶各自的边界。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { diagnose } from "../lib/drift.js";
import { ALL_PATCHES, filePatchOutcome } from "../lib/core.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-caliber-"));

function fixture(name, text) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, text, "utf8");
  return fp;
}

function diagOf(patch, fp) {
  return diagnose({
    aiBase: dir,
    dshHome: dir,
    patches: [patch],
    resolveFiles: () => ({ carrier: fp }),
    appliesHere: () => true,
  });
}

test("字符串形态的 file 必须进诊断（以前 29 条被误塞进「无文件字段」）", () => {
  const fp = fixture("c1.txt", "target sentence still here\n");
  const r = diagOf({ id: 910, name: "STRING_FILE", file: "carrier", replacements: [{ pattern: "target sentence still here", replace: "x" }] }, fp);
  assert.equal(r.no_carrier.length, 0, "不得落进无文件字段");
  assert.equal(r.clean.length, 1);
});

test("校验型：官方原文 marker 在 → clean/verified；不在 → 真漂移", () => {
  const present = fixture("c2.txt", "official wording stays\n");
  const patch = { id: 911, name: "VERIFY_OFFICIAL", file: ["carrier"], replacements: [], markers: ["official wording stays"] };
  const ok = diagOf(patch, present);
  assert.equal(ok.clean.length, 1);
  assert.equal(ok.verify_only.length, 1);
  assert.equal(ok.drifted.length, 0);

  const absent = fixture("c3.txt", "upstream rewrote this sentence\n");
  const bad = diagOf(patch, absent);
  assert.equal(bad.drifted.length, 1, "官方句子改了口径必须报漂移");
  assert.equal(bad.clean.length, 0);
});

test("待配套：带编号自标记缺失 → verify_pending，不算目标消失/漂移", () => {
  const raw = fixture("c4.txt", "no marker yet\n");
  const patch = { id: 912, name: "COMPANION", file: ["carrier"], replacements: [], markers: ["[dsh-purge-87] hang needle uses LF"] };
  const r = diagOf(patch, raw);
  assert.equal(r.verify_pending.length, 1);
  assert.equal(r.dead_target.length, 0);
  assert.equal(r.drifted.length, 0);

  const applied = fixture("c5.txt", "// [dsh-purge-87] hang needle uses LF\n");
  const r2 = diagOf(patch, applied);
  assert.equal(r2.clean.length, 1);
  assert.equal(r2.verify_pending.length, 0);
});

test("占位型：不带编号的自标记缺失 → noop（clean 内单列），不报漂移", () => {
  const raw = fixture("c6.txt", "placeholder patch, nothing written\n");
  const patch = { id: 913, name: "PLACEHOLDER", file: ["carrier"], replacements: [], markers: ["[dsh-purge] escalation never rejected"] };
  const r = diagOf(patch, raw);
  assert.equal(r.noop.length, 1);
  assert.equal(r.drifted.length, 0);
  assert.equal(r.dead_target.length, 0);
});

test("softSettle：迁移型补丁 pattern 不在 = 目标态已满足，不报漂移", () => {
  const fp = fixture("c7.txt", "timeoutMs: 60000\n");
  const patch = {
    id: 914, name: "MIGRATION", file: ["carrier"], softSettle: true,
    replacements: [{ pattern: "timeoutMs: 6000000 // [dsh-purge]", replace: "$160000" }],
  };
  const r = diagOf(patch, fp);
  assert.equal(r.satisfied.length, 1);
  assert.equal(r.drifted.length, 0);
});

test("#88 净树无 marker → pending（待配套），不报 drifted", () => {
  const p88 = ALL_PATCHES.find((p) => p.name === "HUNG_PROMPT_STRICT_NEEDLE");
  assert.ok(p88, "#88 必须存在");
  assert.equal(filePatchOutcome("plain source without marker\n", p88), "pending");
  assert.equal(filePatchOutcome("// [dsh-purge-87] hang needle uses LF\n", p88), "applied");
});

test("softSettle 带 markers：markers 也命中才算目标态满足（只有 #24 这种原生默认才算）", () => {
  const patch = {
    id: 915, name: "SOFT_WITH_MARKERS", file: ["carrier"], softSettle: true,
    markers: ["fetch: true"],
    replacements: [{ pattern: "    fetch: false\n", replace: "    fetch: true\n" }],
  };
  const native = fixture("c8.txt", "  config:\n    fetch: true\n");
  const ok = diagOf(patch, native);
  assert.equal(ok.satisfied.length, 1, "原生已是 fetch: true → 默认态满足");
  assert.equal(ok.drifted.length, 0);

  const rewritten = fixture("c9.txt", "  config:\n    fetch_disabled_v2: yes\n");
  const bad = diagOf(patch, rewritten);
  assert.equal(bad.satisfied.length, 0, "markers 不命中时不得判满足");
});

test("多候选载体：只有一个键解析失败，不把整条补丁判成载体缺失", () => {
  const fp = fixture("c10.txt", "target text present\n");
  const patch = {
    id: 916, name: "MULTI_KEY", optional: false,
    file: ["carrier", "ghost-key"],
    replacements: [{ pattern: "target text present", replace: "x" }],
  };
  const r = diagnose({
    aiBase: dir, dshHome: dir, patches: [patch],
    resolveFiles: () => ({ carrier: fp }),
    appliesHere: () => true,
  });
  assert.equal(r.carrier_missing.length, 0, "能探到 carrier 就不算缺失");
  assert.equal(r.clean.length, 1);
  assert.deepEqual(r.clean[0].unresolvedKeys, ["ghost-key"]);
});

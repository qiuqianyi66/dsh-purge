/**
 * F6 原生试点门禁。
 *
 * 牙齿在哪：
 *   - 开关只影响 apply，revert 清单必须仍是全量（否则摘不掉历史补丁）
 *   - native/cordis.patch.yml 的每个值都必须等于补丁定义算出来的值，
 *     改补丁不重跑生成器就 FAIL
 *   - #63 的 section 必须逐字等于「官方基线 + 三处替换」，漏一处就 FAIL
 *   - #9 的剔除依赖官方「never 在派发前判定」这一事实；上游哪天改了，
 *     最后一条会 FAIL，提醒重新评估，而不是继续闷着打补丁
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PATCHES, NATIVE_PILOT_IDS, nativePilotsEnabled, splitNativePilots } from "../lib/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const YML = path.join(ROOT, "native", "cordis.patch.yml");
const AI_BASE = "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai";

const patchOf = (id) => ALL_PATCHES.find((p) => p.id === id);

test("开关默认关，且只认字符串 1", () => {
  assert.equal(nativePilotsEnabled({}), false);
  assert.equal(nativePilotsEnabled({ DSH_PURGE_NATIVE_PILOTS: "1" }), true);
  for (const v of ["", "0", "true", "yes", "2"]) {
    assert.equal(nativePilotsEnabled({ DSH_PURGE_NATIVE_PILOTS: v }), false, `${v} 不该开启`);
  }
});

test("开关关时 apply 列表原样返回", () => {
  const r = splitNativePilots(ALL_PATCHES, false);
  assert.equal(r.apply, ALL_PATCHES);
  assert.deepEqual(r.native, []);
});

test("开关开时只跳过 #22/#63，#9 仍走补丁", () => {
  const r = splitNativePilots(ALL_PATCHES, true);
  const ids = r.apply.map((p) => p.id);
  assert.deepEqual(r.native.map((p) => p.id).sort((a, b) => a - b), [22, 63]);
  assert.ok(!ids.includes(22) && !ids.includes(63));
  assert.ok(ids.includes(9), "#9 实测不等价，必须继续打补丁");
  assert.equal(r.apply.length + r.native.length, ALL_PATCHES.length);
});

test("revert 清单不受开关影响：ALL_PATCHES 仍含全部试点", () => {
  assert.equal(ALL_PATCHES.length, 82);
  for (const id of [...NATIVE_PILOT_IDS, 9]) {
    assert.ok(ALL_PATCHES.some((p) => p.id === id), `#${id} 不能从全量清单里消失`);
  }
});

test("#22 原生 config 值逐个等于补丁替换体算出的值", () => {
  const yml = fs.readFileSync(YML, "utf8");
  const p = patchOf(22);
  for (const [constName, key] of [
    ["READ_LIMIT", "readLimit"],
    ["READ_MAX_LINE_LENGTH", "readMaxLineLength"],
    ["READ_MAX_BYTES", "readMaxBytes"],
  ]) {
    const r = p.replacements.find((x) => x.replace.includes(`const ${constName} =`));
    assert.ok(r, `#22 缺 ${constName} 替换体`);
    const expr = new RegExp(`const ${constName} = ([0-9eE.*+\\- ]+);`).exec(r.replace)[1].trim();
    const want = Function(`"use strict";return (${expr});`)();
    const got = new RegExp(`^\\s{4}${key}: (\\d+)$`, "m").exec(yml);
    assert.ok(got, `native yml 缺 ${key}`);
    assert.equal(Number(got[1]), want, `${key} 与补丁目标不等价`);
  }
  assert.match(yml, /^\s{4}applyPatch: false$/m, "patch 替换整行 config，applyPatch 不能漏");
});

test("#63 原生 section 逐字等于官方基线套完三处替换", (t) => {
  const bak = path.join(AI_BASE, "dsh-base", "cordis.patch.yml.dshpurge.bak");
  if (!fs.existsSync(bak)) return t.skip("宿主基线不在本机，跳过");
  const lines = fs.readFileSync(bak, "utf8").split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === "- id: plan-mode");
  assert.ok(at >= 0, "基线里没有 plan-mode 行");
  const keyAt = lines.findIndex((l, i) => i > at && l.trim() === "section: |");
  assert.ok(keyAt > at);
  const keyIndent = lines[keyAt].search(/\S/);
  const body = [];
  for (let i = keyAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) {
      body.push("");
      continue;
    }
    if (l.search(/\S/) <= keyIndent) break;
    body.push(l);
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  const strip = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  let want = body.map((l) => (l.trim() ? l.slice(strip) : "")).join("\n");
  const p = patchOf(63);
  for (const r of p.replacements) {
    assert.ok(want.includes(r.pattern), "基线里找不到 #63 的 pattern，上游文案已变");
    want = want.split(r.pattern).join(r.replace);
  }
  const yml = fs.readFileSync(YML, "utf8");
  const got = yml.split("    section: |\n")[1]?.replace(/\n$/, "") ?? "";
  const gotText = got
    .split("\n")
    .map((l) => (l.trim() ? l.slice(6) : ""))
    .join("\n");
  assert.equal(gotText, want);
});

test("#9 剔除理由仍成立：官方 never 判定在 waterfall 派发之前", (t) => {
  const src = path.join(AI_BASE, "dsh-user-approval", "src", "index.ts");
  if (!fs.existsSync(src)) return t.skip("宿主源码不在本机，跳过");
  const text = fs.readFileSync(src, "utf8");
  const neverAt = text.indexOf("if (this.effectivePolicy(session) === 'never') return 'rejected'");
  const dispatchAt = text.indexOf("'approval/request'");
  assert.ok(neverAt >= 0, "官方 never 短路判定已改写，需重新评估 #9 能否原生化");
  assert.ok(dispatchAt > neverAt, "派发已挪到 never 判定之前，#9 可能可原生化了，重新评估");
});

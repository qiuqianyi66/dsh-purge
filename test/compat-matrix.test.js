import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPAT_CURRENT,
  COMPAT_MATRIX,
  currentCompatEntry,
  validateCompatMatrix,
} from "../lib/compat-matrix.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("矩阵内部一致：恰好一条 supported，字段合法", () => {
  const r = validateCompatMatrix();
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("package.json dshTarget 与矩阵当前行 dsh 一致", () => {
  assert.equal(pkg.dshTarget, COMPAT_CURRENT.dsh);
  assert.equal(currentCompatEntry().dsh, COMPAT_CURRENT.dsh);
});

test("package.json version 与矩阵当前行 plugin 一致", () => {
  assert.equal(pkg.version, COMPAT_CURRENT.plugin);
});

test("README 适配表由矩阵生成且未漂移", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const re = /<!-- compat:table:start -->([\s\S]*?)<!-- compat:table:end -->/;
  const m = readme.match(re);
  assert.ok(m, "README 缺少 compat:table 标记区间");
  const block = m[1].trim();
  for (const e of COMPAT_MATRIX) {
    assert.ok(block.includes(`**${e.dsh}**`), `README 缺宿主行 ${e.dsh}`);
    assert.ok(
      block.includes(e.plugin === "unknown" ? "unknown" : `**${e.plugin}**`),
      `README 缺插件版本 ${e.plugin}`,
    );
  }
});

test("过时/非目标条目标 unknown，不保留旧可运行承诺", () => {
  const unsupported = COMPAT_MATRIX.find((e) => e.status === "unsupported");
  assert.equal(unsupported.plugin, "unknown");
});

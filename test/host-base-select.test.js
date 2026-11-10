// N2 回归：宿主定位不得把归档残留当成在用宿主（本机实测 CLI 曾报 3/82）。
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { looksLikeArchivedBase } from "../lib/core.js";

test("归档 / 回收站 / 备份路径判为残留", () => {
  for (const p of [
    "C:\\Users\\x\\.dsh\\_archived-dsh-browser-20261027\\node_modules\\.pnpm\\a\\node_modules\\@deepseek-ai",
    "/home/x/.dsh/_archive-old/node_modules/@deepseek-ai",
    "/tmp/dsh-archived-2026/node_modules/@deepseek-ai",
    "/data/.trash/dsh/node_modules/@deepseek-ai",
    "/mnt/backup/@deepseek-ai",
  ]) {
    assert.equal(looksLikeArchivedBase(p), true, p);
  }
});

test("活宿主路径不判残留", () => {
  for (const p of [
    "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai",
    path.join("C:", "Users", "x", ".dsh", "profiles", "desktop", "node_modules", "@deepseek-ai"),
    "/usr/lib/deepseek-harness/node_modules/@deepseek-ai",
  ]) {
    assert.equal(looksLikeArchivedBase(p), false, p);
  }
});

test("空值不判残留（缺宿主时不谎报）", () => {
  assert.equal(looksLikeArchivedBase(""), false);
  assert.equal(looksLikeArchivedBase(null), false);
});

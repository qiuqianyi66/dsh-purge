import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "isolated-cycle.mjs");

function run(args) {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], { stdio: "pipe", encoding: "utf8" });
    return { code: 0 };
  } catch (e) {
    return { code: e.status ?? 1, stderr: String(e.stderr || "") };
  }
}

test("隔离树不存在时退出码 2，并给出铺树命令", () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dsh-cycle-")), "host-none");
  const r = run(["--stage", missing]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /audit-next\.mjs --version/);
});

test("树里有 .dshpurge.bak 残留时拒绝运行（退出码 2）", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-cycle-"));
  const aiBase = path.join(root, "resources", "app", "dsh", "node_modules", "@deepseek-ai", "dsh-base", "lib");
  fs.mkdirSync(aiBase, { recursive: true });
  fs.writeFileSync(path.join(aiBase, "index.js.dshpurge.bak"), "old\n", "utf8");
  const r = run(["--stage", root]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /残留/);
});

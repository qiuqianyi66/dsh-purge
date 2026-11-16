import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitFileBatch } from "../lib/transaction.js";
import { applyReplacementsToText } from "../lib/core.js";
import { hostCompat } from "../lib/core.js";

test("事务：一条补丁的多个文件一起提交", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-tx-"));
  const a = path.join(dir, "a.js");
  const b = path.join(dir, "b.js");
  fs.writeFileSync(a, "A0\n");
  fs.writeFileSync(b, "B0\n");
  const tx = await commitFileBatch([
    { fp: a, base: "A0\n", next: "A1\n" },
    { fp: b, base: "B0\n", next: "B1\n" },
  ]);
  assert.equal(tx.ok, true);
  assert.equal(tx.written, 2);
  assert.equal(fs.readFileSync(a, "utf8"), "A1\n");
  assert.equal(fs.readFileSync(b, "utf8"), "B1\n");
});

test("事务：提交前文件被外部改过就整批放弃（指纹校验）", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-tx-"));
  const a = path.join(dir, "a.js");
  const b = path.join(dir, "b.js");
  fs.writeFileSync(a, "A0\n");
  fs.writeFileSync(b, "B0\n");
  fs.writeFileSync(a, "A-live-edit\n");
  const tx = await commitFileBatch([
    { fp: a, base: "A0\n", next: "A1\n" },
    { fp: b, base: "B0\n", next: "B1\n" },
  ]);
  assert.equal(tx.ok, false);
  assert.equal(tx.reason, "mutation_detected");
  assert.equal(fs.readFileSync(a, "utf8"), "A-live-edit\n");
  assert.equal(fs.readFileSync(b, "utf8"), "B0\n");
});

test("事务：第二个文件写失败 → 第一个已写的回滚", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-tx-"));
  const a = path.join(dir, "a.js");
  const b = path.join(dir, "b.js");
  fs.writeFileSync(a, "A0\n");
  fs.writeFileSync(b, "B0\n");
  let failOnce = true;
  const tx = await commitFileBatch(
    [
      { fp: a, base: "A0\n", next: "A1\n" },
      { fp: b, base: "B0\n", next: "B1\n" },
    ],
    {
      write: async (fp, buf) => {
        if (fp === b && failOnce) {
          failOnce = false;
          const e = new Error("busy");
          e.code = "EBUSY";
          throw e;
        }
        fs.writeFileSync(fp, buf);
      },
    }
  );
  assert.equal(tx.ok, false);
  assert.equal(tx.reason, "write_error");
  assert.equal(tx.rolled_back, 1);
  assert.equal(fs.readFileSync(a, "utf8"), "A0\n", "已写的文件必须回到原文");
  assert.equal(fs.readFileSync(b, "utf8"), "B0\n");
});

test("候选锚点：旧原文不在、新原在时按候选命中写入", () => {
  const patch = {
    id: 88,
    name: "T",
    replacements: [{ pattern: ["OLD_ANCHOR", "NEW_ANCHOR"], replace: "NEW_LINE" }],
  };
  const r = applyReplacementsToText("const x = NEW_ANCHOR;\n", patch);
  assert.equal(r.changed, true);
  assert.ok(r.text.includes("NEW_LINE"));
});

test("候选锚点：两个版本同时出现视为歧义，整条拒写", () => {
  const patch = {
    id: 88,
    name: "T",
    replacements: [{ pattern: ["OLD_ANCHOR", "NEW_ANCHOR"], replace: "NEW_LINE" }],
  };
  const r = applyReplacementsToText("OLD_ANCHOR\nNEW_ANCHOR\n", patch);
  assert.equal(r.changed, false);
  assert.equal(r.hitMismatch?.actual, 2);
  assert.equal(r.hitMismatch?.ambiguous, true);
});

test("多版本声明：dshTargets 命中其一即视为适配", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-host-"));
  const aiBase = path.join(dir, "host", "node_modules", "@deepseek-ai");
  fs.mkdirSync(aiBase, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "host", "package.json"),
    JSON.stringify({ name: "deepseek-harness-host", version: "0.2.2-rc.3" }),
    "utf8"
  );
  const ok = hostCompat(aiBase, ["0.2.2-rc.2", "0.2.2-rc.3"]);
  assert.equal(ok.known, true);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.targets, ["0.2.2-rc.2", "0.2.2-rc.3"]);
  const bad = hostCompat(aiBase, ["0.2.1-rc.1"]);
  assert.equal(bad.known, true);
  assert.equal(bad.ok, false);
});

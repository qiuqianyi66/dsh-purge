// N4 回归：C4 还原链（.dshpurge.bak）此前零测试覆盖。
// 全部在临时 DSH_HOME / 临时 aiBase 上跑，不触碰真机安装（DSH_HOME 指向 tmp）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-restore-"));
process.env.DSH_HOME = path.join(root, "home");
process.env.DSH_SURFACE = "web";

const core = await import("../lib/core.js");

let seq = 0;
function makeBase() {
  seq += 1;
  const aiBase = path.join(root, `base-${seq}`);
  fs.mkdirSync(path.join(aiBase, "dsh-tool-bash", "lib"), { recursive: true });
  return { aiBase, fp: path.join(aiBase, "dsh-tool-bash", "lib", "index.js") };
}

const ORIGINAL = "original host text\nBefore any delete or move, verify it.\n";
const PATCHED = "original host text\nProceed with operator-requested paths.\n";

test("原文缺失、bak 在 → 从 bak 拷回，且保留 bak", () => {
  const { aiBase, fp } = makeBase();
  fs.writeFileSync(`${fp}.dshpurge.bak`, ORIGINAL, "utf8");
  const restored = core.restoreMissingOriginalsFromBak(aiBase);
  assert.deepEqual(restored, [fp]);
  assert.equal(fs.readFileSync(fp, "utf8"), ORIGINAL);
  assert.equal(fs.existsSync(`${fp}.dshpurge.bak`), true);
});

test("原文被写成 0 字节、bak 在 → 拷回", () => {
  const { aiBase, fp } = makeBase();
  fs.writeFileSync(fp, "", "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, ORIGINAL, "utf8");
  assert.deepEqual(core.restoreMissingOriginalsFromBak(aiBase), [fp]);
  assert.equal(fs.readFileSync(fp, "utf8"), ORIGINAL);
});

test("原文完好 → 不动、不返回", () => {
  const { aiBase, fp } = makeBase();
  fs.writeFileSync(fp, PATCHED, "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, ORIGINAL, "utf8");
  assert.deepEqual(core.restoreMissingOriginalsFromBak(aiBase), []);
  assert.equal(fs.readFileSync(fp, "utf8"), PATCHED);
});

test("原文缺失且无 bak → 不凭空新建文件", () => {
  const { aiBase, fp } = makeBase();
  assert.deepEqual(core.restoreMissingOriginalsFromBak(aiBase), []);
  assert.equal(fs.existsSync(fp), false);
});

test("revertAll：已打补丁的载体回到 bak 字节，且删掉 bak", async () => {
  const { aiBase, fp } = makeBase();
  fs.writeFileSync(fp, PATCHED, "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, ORIGINAL, "utf8");
  const report = await core.revertAll(aiBase);
  assert.deepEqual(report.reverted, [fp]);
  assert.deepEqual(report.errors, []);
  assert.equal(fs.readFileSync(fp, "utf8"), ORIGINAL);
  assert.equal(fs.existsSync(`${fp}.dshpurge.bak`), false);
});

test("revertAll 幂等：二次调用不重写、不报错，内容不变", async () => {
  const { aiBase, fp } = makeBase();
  fs.writeFileSync(fp, PATCHED, "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, ORIGINAL, "utf8");
  await core.revertAll(aiBase);
  const before = fs.statSync(fp).mtimeMs;
  const bytes = fs.readFileSync(fp, "utf8");
  const second = await core.revertAll(aiBase);
  assert.deepEqual(second.reverted, []);
  assert.equal(second.errors.length, 0);
  assert.equal(fs.readFileSync(fp, "utf8"), bytes);
  assert.equal(fs.statSync(fp).mtimeMs, before);
});

test("revertAll：没有 bak 时绝不删除目标文件（#41）", async () => {
  const { aiBase, fp } = makeBase();
  fs.writeFileSync(fp, PATCHED, "utf8");
  const report = await core.revertAll(aiBase);
  assert.deepEqual(report.reverted, []);
  assert.equal(fs.existsSync(fp), true);
  assert.equal(fs.readFileSync(fp, "utf8"), PATCHED);
});

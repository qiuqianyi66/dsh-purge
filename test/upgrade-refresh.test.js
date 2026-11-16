// 宿主升级自愈：把「过期 bak」刷成新版基线时，不能把「我们打过但没写字面 marker 的文件」当官方新版。
// #1/#22/#33/#48 这类补丁只改文案，一旦误刷，刚重建好的基线又变回已打态（baseline_lost 复发）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-refresh-"));
process.env.DSH_HOME = path.join(root, "home");
process.env.DSH_SURFACE = "web";

const core = await import("../lib/core.js");

const PATCHED = "Proceed with operator-requested paths. An unset variable expands to an empty string.\n";
const OFFICIAL_NEW = "Before any delete or move, verify that the resolved path is the intended one. Extra sentence from upstream.\n";

function makeBase(tag) {
  const aiBase = path.join(root, tag);
  fs.mkdirSync(path.join(aiBase, "dsh-tool-bash", "lib"), { recursive: true });
  return { aiBase, fp: path.join(aiBase, "dsh-tool-bash", "lib", "index.js") };
}

test("已打态但无 dsh-purge 字面量 → 不许刷新 bak", () => {
  const { aiBase, fp } = makeBase("a");
  fs.writeFileSync(fp, PATCHED, "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, "official baseline bytes\n", "utf8");
  const refreshed = core.refreshStaleBaksForUpgrade(aiBase);
  assert.deepEqual(refreshed, [], "不能把打过补丁的正文当官方新版");
  assert.equal(fs.readFileSync(`${fp}.dshpurge.bak`, "utf8"), "official baseline bytes\n");
});

test("官方新版（原 pattern 还在、无 marker）→ bak 刷成新版", () => {
  const { aiBase, fp } = makeBase("b");
  fs.writeFileSync(fp, OFFICIAL_NEW, "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, "very old rc.2 bytes\n", "utf8");
  const refreshed = core.refreshStaleBaksForUpgrade(aiBase);
  assert.equal(refreshed.length, 1);
  assert.equal(fs.readFileSync(`${fp}.dshpurge.bak`, "utf8"), OFFICIAL_NEW);
});

test("刷新发生在 apply 流程里，且不会被同一次 apply 再覆盖回旧基线", async () => {
  const { aiBase, fp } = makeBase("c");
  fs.writeFileSync(fp, OFFICIAL_NEW, "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, "very old rc.2 bytes\n", "utf8");
  await core.applyPatches(aiBase);
  assert.equal(fs.readFileSync(`${fp}.dshpurge.bak`, "utf8"), OFFICIAL_NEW, "基线必须是新版");
  const report = await core.revertAll(aiBase);
  assert.deepEqual(report.baselineLost, [], "新版基线是可还原的");
  assert.equal(fs.readFileSync(fp, "utf8"), OFFICIAL_NEW, "还原回到官方新版而不是 rc.2");
});

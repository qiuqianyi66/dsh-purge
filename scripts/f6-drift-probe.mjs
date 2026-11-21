/**
 * F6 复现脚本：开关开时隔离门禁 G4 报 drifted 2 的根因取证。
 *
 * 结论（本脚本会打印证据）：#7/#8 其实 apply 成功，是 diagnose 把它们误判成 drifted。
 * 机制：`drift.markersPresent()` 只读 `patch.markers`（数组），而 #7/#8/#21 只定义了
 * `marker`（单数）→ 它们的 markers_ok 恒为 false；判「已打」于是落到
 * `row.marked > 0`（文件里有没有 "dsh-purge" 字样）。base yml 里唯一写入
 * `[dsh-purge]` 字面量的是 #63。一旦 #63 被跳过，#7/#8 就失去了这份「借来的证据」。
 *
 * 用法（前置：audit-next --version 0.2.2-rc.3 --refresh 铺干净树）：
 *   node scripts/f6-drift-probe.mjs on     开关开，复现 drifted 2
 *   node scripts/f6-drift-probe.mjs off    开关关，对照 drifted 0
 * 只动隔离树，跑完原样 revert。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";
import * as drift from "../lib/drift.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = path.resolve(ROOT, "..", ".tmp", "host-0.2.2-rc.3");
const aiBase = path.join(STAGE, "resources", "app", "dsh", "node_modules", "@deepseek-ai");
const YML = path.join(aiBase, "dsh-base", "cordis.patch.yml");
const ON = (process.argv[2] || "on") === "on";
process.env.DSH_PURGE_NATIVE_PILOTS = ON ? "1" : "";

const markerCount = () => (fs.readFileSync(YML, "utf8").match(/dsh-purge/g) || []).length;
console.log(`switch=${ON ? "on" : "off"}  apply 前 base yml 里 "dsh-purge" 出现 ${markerCount()} 次`);

await core.backupAll(aiBase);
const report = await core.applyPatches(aiBase, core.ALL_PATCHES, {});
const sum = core.summarizeApplyReport(report);
console.log(`apply: applied=${sum.applied} already=${sum.already} failed=${sum.failed.length}`);
for (const id of [7, 8, 22, 63]) {
  const r = report.find((x) => x.patch_id === id);
  console.log(`  #${id} status=${r?.status}${r?.native ? " (native)" : ""} applied=${r?.applied} drifted=${r?.drifted ?? 0}`);
}
console.log(`apply 后 base yml 里 "dsh-purge" 出现 ${markerCount()} 次`);
const lines = fs.readFileSync(YML, "utf8").split(/\r?\n/);
lines.forEach((l, i) => {
  if (/DSH_PERMISSION_MODE/.test(l)) console.log(`  实际内容 ${i + 1}: ${l.trim()}`);
});

const d = drift.diagnose({
  aiBase, dshHome: STAGE, patches: core.ALL_PATCHES,
  resolveFiles: (b, h) => core.targetFiles(b, h),
  appliesHere: (p) => core.patchAppliesHere(p),
});
console.log(`diagnose: clean=${d.clean.length} drifted=${d.drifted.length} partial=${d.partial.length} missing=${d.carrier_missing.length}`);
for (const x of d.drifted) {
  for (const c of x.carriers || []) {
    if (c.verdict !== "drifted") continue;
    console.log(`  DRIFT #${x.id} ${x.name} · ${c.key} markers_ok=${c.markers_ok} marked=${c.marked}`);
  }
}
const rev = await core.revertAll(aiBase);
console.log(`revert errors=${(rev.errors || []).length}`);

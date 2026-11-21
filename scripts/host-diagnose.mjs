/**
 * 真宿主诊断（只读）：显式指定 aiBase，绕开 enumeratePatchAiBases 的排序歧义。
 *
 * 背景：本机同时存在 D 盘桌面宿主与一个 2026-09 的 npx 缓存（0.1.5-rc.3），
 * CLI 的自动排序会把旧 npx 缓存排在前面，于是 --status 报的是那个早就没人用的目标。
 *
 * 用法：
 *   node scripts/host-diagnose.mjs
 *   node scripts/host-diagnose.mjs --ai-base "<path>\@deepseek-ai"
 */
import fs from "node:fs";
import path from "node:path";
import * as core from "../lib/core.js";
import * as drift from "../lib/drift.js";

const argv = process.argv.slice(2);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const aiBase = val("--ai-base", "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai");

if (!fs.existsSync(aiBase)) {
  console.error(`aiBase 不存在：${aiBase}`);
  process.exit(2);
}
const basePkg = path.join(aiBase, "dsh-base", "package.json");
const hostVersion = fs.existsSync(basePkg) ? JSON.parse(fs.readFileSync(basePkg, "utf8")).version : "?";
const bakCount = fs
  .readdirSync(aiBase, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .reduce((n, d) => {
    const sub = path.join(aiBase, d.name);
    try {
      return n + fs.readdirSync(sub, { recursive: true }).filter((f) => String(f).endsWith(".dshpurge.bak")).length;
    } catch {
      return n;
    }
  }, 0);

const d = drift.diagnose({
  aiBase,
  dshHome: "C:\\Users\\yanha\\.dsh",
  patches: core.ALL_PATCHES,
  resolveFiles: (b, h) => core.targetFiles(b, h),
  appliesHere: (p) => core.patchAppliesHere(p),
});

console.log(`真宿主 ${aiBase}`);
console.log(`  宿主版本 ${hostVersion} ｜ 原始基线 .dshpurge.bak ${bakCount} 个`);
console.log(`  clean ${d.clean.length} ｜ drifted ${d.drifted.length} ｜ partial ${d.partial.length} ｜ carrier_missing ${d.carrier_missing.length} ｜ retired ${(d.retired || []).length}`);
if (d.drifted.length) {
  console.log("\n需重对齐：");
  for (const x of d.drifted) {
    console.log(`  #${x.id} ${x.name}`);
    for (const c of x.carriers || []) {
      if (c.verdict !== "drifted") continue;
      console.log(`     ${c.key} markers=${c.markers_ok} marked=${c.marked}`);
      for (const h of c.hits || []) console.log(`        「${String(h.head).slice(0, 72)}」 hits=${h.hits} expect=${h.expect}`);
    }
  }
}
if (d.partial.length) {
  console.log("\n部分命中：");
  for (const x of d.partial) console.log(`  #${x.id} ${x.name}`);
}
if (d.carrier_missing.length) {
  console.log("\n载体缺失：");
  for (const x of d.carrier_missing) console.log(`  #${x.id} ${x.name} · ${x.key}`);
}

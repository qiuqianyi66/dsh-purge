/**
 * 诊断口径对齐评估：统计「只有单数 marker、没有 markers 数组」的补丁，
 * 并逐个判断该 marker 是否可能由官方原文自带（自带则会引入新的假绿）。
 *
 * 用法：node scripts/marker-audit.mjs [--ai-base <首个载体>]
 */
import fs from "node:fs";
import path from "node:path";
import { ALL_PATCHES } from "../lib/core.js";

const AI_BASE =
  process.argv.includes("--ai-base")
    ? process.argv[process.argv.indexOf("--ai-base") + 1]
    : "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai";

const rows = [];
for (const p of ALL_PATCHES) {
  const hasArr = Array.isArray(p.markers) && p.markers.length > 0;
  if (hasArr || !p.marker) continue;
  rows.push(p);
}

console.log(`只有单数 marker 的补丁：${rows.length} 条\n`);
for (const p of rows) {
  console.log(`#${p.id} ${p.name}`);
  console.log(`  marker: ${JSON.stringify(p.marker)}`);
  const files = Array.isArray(p.file) ? p.file : [p.file];
  console.log(`  载体键: ${files.join(", ")}  strict=${p.markersStrict === true}  any=${p.markersAny === true}`);
  // 若替换体首行就是 marker，说明这是「补丁写入后才存在」的强证据；否则弱。
  const replaces = [];
  for (const r of p.replacements || []) replaces.push(r.replace);
  if (typeof p.replace === "string") replaces.push(p.replace);
  const markerIsWritten = replaces.some((t) => String(t).includes(p.marker));
  console.log(`  marker 由补丁写入: ${markerIsWritten ? "是（强）" : "否（弱，需人工看官方是否自带）"}`);
  console.log("");
}

// 第二层：这些 marker 在「未打补丁的官方基线」里是否已经存在。
// 有 .dshpurge.bak 就用它当基线，没有就跳过并如实标注。
const weak = rows.filter((p) => {
  const replaces = [];
  for (const r of p.replacements || []) replaces.push(r.replace);
  if (typeof p.replace === "string") replaces.push(p.replace);
  return !replaces.some((t) => String(t).includes(p.marker));
});
if (weak.length) {
  console.log(`\n弱证据补丁 ${weak.length} 条，检查官方基线里是否已含该 marker：`);
  for (const p of weak) {
    const keys = Array.isArray(p.file) ? p.file : [p.file];
    let verdict = "基线不可得";
    let where = "";
    for (const k of keys) {
      // 只对能直推包名的键做检查；base 这类键走 dsh-base。
      const dir = k === "base" ? "dsh-base" : k.startsWith("dsh-") ? k : "";
      if (!dir) continue;
      for (const cand of ["lib/index.js", "cordis.patch.yml", "lib/bootstrap.js"]) {
        const f = path.join(AI_BASE, dir, cand);
        const bak = `${f}.dshpurge.bak`;
        if (!fs.existsSync(f) && !fs.existsSync(bak)) continue;
        const text = fs.readFileSync(fs.existsSync(bak) ? bak : f, "utf8");
        if (text.includes(p.marker)) {
          verdict = "基线已含该 marker → 兼容单数会引入假绿";
          where = `${dir}/${cand}`;
          break;
        }
        verdict = "基线不含 → 兼容单数是安全的";
        where = `${dir}/${cand}`;
      }
      if (verdict.includes("引入假绿")) break;
    }
    console.log(`  #${p.id} ${p.name}: ${verdict}${where ? `（${where}）` : ""}`);
  }
}

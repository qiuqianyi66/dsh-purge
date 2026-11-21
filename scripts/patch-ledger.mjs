// F1 补丁台账抽取（只读）
// 用法：node scripts/patch-ledger.mjs
// 只读 lib/core.js：按「数组声明 → 顶层对象块 → 4 空格缩进字面量字段」静态解析，
// 不执行 apply、不 import 宿主模块、不改任何文件（除本脚本产物）。
// 产物：docs/plans/patch-mechanism-map-20261118.csv / .json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CORE = path.join(ROOT, "lib", "core.js");
const ARRAYS = ["PATCHES", "CODE_PATCHES", "ENGINE_PATCHES", "NEW_TOOL_PATCHES"];

const lines = fs.readFileSync(CORE, "utf8").split(/\r?\n/);

// 找数组声明行，返回 [startLineIdx, endLineIdx)（0 基）
function arrayRange(name) {
  const declIdx = lines.findIndex((l) => new RegExp(`^const ${name} = \\[`).test(l));
  if (declIdx < 0) throw new Error(`找不到数组声明 ${name}`);
  const endIdx = lines.findIndex((l, i) => i > declIdx && /^\];/.test(l));
  if (endIdx < 0) throw new Error(`${name} 没有闭合`);
  return [declIdx, endIdx];
}

// 顶层补丁块：以 `  {` 开头、`  },` 或 `  }` 结尾
function patchBlocks(startIdx, endIdx) {
  const blocks = [];
  let open = -1;
  for (let i = startIdx; i <= endIdx; i++) {
    const l = lines[i];
    if (open < 0 && /^\s{2}\{\s*$/.test(l)) { open = i; continue; }
    if (open >= 0 && /^\s{2}\},?\s*$/.test(l)) {
      blocks.push({ from: open, to: i });
      open = -1;
    }
  }
  if (open >= 0) throw new Error("存在未闭合的补丁块");
  return blocks;
}

// 顶层字段只出现在 4 空格缩进行；同一行常用逗号并列多个字段
function metaTextOf(block) {
  return block.filter((l) => /^\s{4}[^\s]/.test(l)).map((l) => l.slice(4)).join("\n");
}

function strField(meta, key) {
  const re = new RegExp(`(?:^|\\n|, )${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const m = re.exec(meta);
  if (!m) return "";
  return m[1].replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", '\\': '\\' }[c] ?? c));
}

function numField(meta, key) {
  const re = new RegExp(`(?:^|\\n|, )${key}:\\s*(\\d+)`);
  const m = re.exec(meta);
  return m ? Number(m[1]) : null;
}

function rawField(meta, key) {
  const re = new RegExp(`(?:^|\\n|, )${key}:\\s*(\\[[^\\]]*\\]|"[^"]*")`);
  const m = re.exec(meta);
  return m ? m[1] : null;
}

function stringArray(raw) {
  if (raw == null) return null;
  const m = /^\[(.*)\]$/s.exec(raw.trim());
  if (!m) return null;
  const items = [];
  const re = /["']((?:[^"'\\]|\\.)*)["']/g;
  let hit;
  while ((hit = re.exec(m[1])) !== null) items.push(hit[1]);
  return items;
}

const rows = [];
const anomalies = [];

for (const arrName of ARRAYS) {
  const [s, e] = arrayRange(arrName);
  for (const b of patchBlocks(s, e)) {
    const block = lines.slice(b.from + 1, b.to);
    const meta = metaTextOf(block);
    const id = numField(meta, "id");
    const name = strField(meta, "name");
    const layer = strField(meta, "layer");
    const layerEn = strField(meta, "layer_en");
    const desc = strField(meta, "desc");
    const fileRaw = rawField(meta, "file");
    const fileArr = stringArray(fileRaw);
    const carriers = fileArr ?? (fileRaw ? [fileRaw.replace(/^"|"$/g, "")] : []);
    const relArr = stringArray(rawField(meta, "rel")) ?? [];
    const flags = {
      optional: /(?:^|\n|, )optional:\s*true/.test(meta),
      skipIfMarked: /(?:^|\n|, )skipIfMarked:\s*true/.test(meta),
      markersStrict: /(?:^|\n|, )markersStrict:\s*true/.test(meta),
      markersAny: /(?:^|\n|, )markersAny:\s*true/.test(meta),
    };
    const body = block.join("\n");
    const patternHits = (body.match(/\bpattern:/g) ?? []).length;
    const firstPattern = (() => {
      const idx = body.search(/\bpattern:/);
      if (idx < 0) return "";
      const tail = body.slice(idx);
      const lit = tail.match(/["']((?:[^"'\\]|\\.){0,120})/);
      return lit ? lit[1].replace(/\s+/g, " ").trim() : "";
    })();

    rows.push({
      array: arrName,
      id: Number.isFinite(id) ? id : null,
      name, layer, layer_en: layerEn,
      carriers, rel: relArr ? relArr.join("/") : "",
      ...flags,
      patternHits, patternFirst: firstPattern,
      desc,
      sourceLine: b.from + 1, // 1 基，指向 `  {` 行
    });
  }
}

for (const r of rows) {
  if (r.id === null) anomalies.push({ where: `${r.array}:${r.sourceLine}`, what: "缺 id" });
  if (!r.name) anomalies.push({ where: `${r.array}:${r.sourceLine}`, what: "缺 name" });
  if (!r.layer) anomalies.push({ where: `${r.array}:${r.sourceLine}`, what: "缺 layer" });
  if (!r.carriers.length) anomalies.push({ where: `${r.array}:${r.sourceLine}`, what: "缺 file/carrier" });
}

const carriers = [...new Set(rows.flatMap((r) => r.carriers))].sort();
const byLayer = {};
for (const r of rows) byLayer[r.layer || "(空)"] = (byLayer[r.layer || "(空)"] ?? 0) + 1;
const byArray = Object.fromEntries(ARRAYS.map((a) => [a, rows.filter((r) => r.array === a).length]));
const dupIds = rows.filter((r) => r.id !== null && rows.filter((x) => x.id === r.id).length > 1).map((r) => r.id);

const summary = {
  generatedAt: new Date().toISOString(),
  source: path.relative(ROOT, CORE).replace(/\\/g, "/"),
  sourceBytes: fs.statSync(CORE).size,
  sourceLines: lines.length,
  byArray,
  patchCount: rows.length,
  carrierCount: carriers.length,
  layerBreakdown: byLayer,
  duplicateIds: [...new Set(dupIds)],
  anomalyCount: anomalies.length,
  anomalies,
  note: "patternHits 为块内 pattern: 出现次数（只读启发式，用于判断是否有替换体，不作为精确替换条数）",
};

const outDir = path.join(ROOT, "docs", "plans");
fs.mkdirSync(outDir, { recursive: true });
const csvPath = path.join(outDir, "patch-mechanism-map-20261118.csv");
const jsonPath = path.join(outDir, "patch-mechanism-map-20261118.json");

const head = "id,name,array,source_line,carriers,rel,optional,skipIfMarked,markersStrict,markersAny,pattern_hits,pattern_first,desc";
const esc = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [head].concat(rows.map((r) => [
  r.id, r.name, r.array, r.sourceLine, r.carriers.join("|"), r.rel,
  r.optional, r.skipIfMarked, r.markersStrict, r.markersAny,
  r.patternHits, r.patternFirst, r.desc,
].map(esc).join(","))).join("\r\n");

fs.writeFileSync(csvPath, "\ufeff" + csv, "utf8");
fs.writeFileSync(jsonPath, JSON.stringify({ summary, carriers, patches: rows }, null, 2), "utf8");

console.log(JSON.stringify(summary, null, 2));
console.log(`\nCSV  ${path.relative(ROOT, csvPath).replace(/\\/g, "/")}`);
console.log(`JSON ${path.relative(ROOT, jsonPath).replace(/\\/g, "/")}`);

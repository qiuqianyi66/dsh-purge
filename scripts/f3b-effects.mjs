// F3b 俯视：把 unknown 补丁压成「目标文件 + 替换体摘要」，用于快速分类（只读）
// 用法：node scripts/f3b-effects.mjs → docs/plans/patch-effects-unknown-20261119.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lines = fs.readFileSync(path.join(ROOT, "lib", "core.js"), "utf8").split(/\r?\n/);
const ARRAYS = ["PATCHES", "CODE_PATCHES", "ENGINE_PATCHES", "NEW_TOOL_PATCHES"];
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "plans", "patch-mechanism-map-20261118.json"), "utf8"));
const unknown = new Set(ledger.patches.filter((p) => p.status !== "verified").map((p) => p.id));

const unescape = (s) => s.replace(/\\(.)/g, (_, c) => ({ n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "\\": "\\" }[c] ?? c));
const squash = (s, n = 160) => s.replace(/\s+/g, " ").trim().slice(0, n);

// 从 `key:` 起，收集后续连续字符串字面量（允许 + 拼接与换行）
function stringsAfter(body, key) {
  const out = [];
  const re = new RegExp(`${key}:\\s*`, "g");
  let m;
  while ((m = re.exec(body)) !== null) {
    let i = m.index + m[0].length;
    let buf = "";
    // 允许 [ 开头（数组）
    if (body[i] === "[") i++;
    while (i < body.length) {
      while (i < body.length && /[\s+,[\]]/.test(body[i])) i++;
      const q = body[i];
      if (q !== '"' && q !== "'") break;
      let j = i + 1, lit = "";
      while (j < body.length) {
        if (body[j] === "\\") { lit += body[j] + body[j + 1]; j += 2; continue; }
        if (body[j] === q) break;
        lit += body[j]; j++;
      }
      buf += (buf ? "\n" : "") + unescape(lit);
      i = j + 1;
    }
    if (buf) out.push(buf);
  }
  return out;
}

function arrayRange(name) {
  const s = lines.findIndex((l) => new RegExp(`^const ${name} = \\[`).test(l));
  const e = lines.findIndex((l, i) => i > s && /^\];/.test(l));
  return [s, e];
}

const res = [];
for (const arr of ARRAYS) {
  const [s, e] = arrayRange(arr);
  let open = -1;
  for (let i = s; i <= e; i++) {
    if (open < 0 && /^\s{2}\{\s*$/.test(lines[i])) { open = i; continue; }
    if (open >= 0 && /^\s{2}\},?\s*$/.test(lines[i])) {
      const body = lines.slice(open, i + 1).join("\n");
      const id = Number((body.match(/\bid:\s*(\d+)/) ?? [])[1]);
      if (unknown.has(id)) {
        const pats = stringsAfter(body, "patterns").concat(stringsAfter(body, "pattern"));
        const reps = stringsAfter(body, "replace");
        res.push({ id, arr, pats: pats.map((p) => squash(p, 90)), reps: reps.map((r) => squash(r, 130)) });
      }
      open = -1;
    }
  }
}

const out = res.map((r) => {
  const p = r.pats.slice(0, 2).join(" || ");
  const q = r.reps.slice(0, 2).join(" || ");
  return `#${r.id}\tIN: ${p}\tOUT: ${q}`;
}).join("\n");

fs.writeFileSync(path.join(ROOT, "docs", "plans", "patch-effects-unknown-20261119.txt"), out + "\n", "utf8");
console.log(`写出 ${res.length} 条 / ${out.length} 字节`);

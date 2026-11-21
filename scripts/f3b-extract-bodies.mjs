// F3b 取证：把 63 条 unknown 的补丁块原文导出，供逐条判定（只读 lib/core.js）
// 用法：node scripts/f3b-extract-bodies.mjs → docs/plans/patch-bodies-unknown-20261119.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lines = fs.readFileSync(path.join(ROOT, "lib", "core.js"), "utf8").split(/\r?\n/);
const ARRAYS = ["PATCHES", "CODE_PATCHES", "ENGINE_PATCHES", "NEW_TOOL_PATCHES"];

const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "plans", "patch-mechanism-map-20261118.json"), "utf8"));
const unknown = new Set(ledger.patches.filter((p) => p.status !== "verified").map((p) => p.id));

function arrayRange(name) {
  const s = lines.findIndex((l) => new RegExp(`^const ${name} = \\[`).test(l));
  const e = lines.findIndex((l, i) => i > s && /^\];/.test(l));
  if (s < 0 || e < 0) throw new Error(`数组 ${name} 定位失败`);
  return [s, e];
}

const out = [];
for (const arr of ARRAYS) {
  const [s, e] = arrayRange(arr);
  let open = -1;
  for (let i = s; i <= e; i++) {
    if (open < 0 && /^\s{2}\{\s*$/.test(lines[i])) { open = i; continue; }
    if (open >= 0 && /^\s{2}\},?\s*$/.test(lines[i])) {
      const body = lines.slice(open, i + 1);
      const idm = body.slice(0, 4).join("\n").match(/\bid:\s*(\d+)/);
      const id = idm ? Number(idm[1]) : null;
      if (id !== null && unknown.has(id)) {
        out.push(`===== #${id} [${arr}] line ${open + 1} =====\n${body.join("\n")}\n`);
      }
      open = -1;
    }
  }
}

fs.writeFileSync(path.join(ROOT, "docs", "plans", "patch-bodies-unknown-20261119.txt"), out.join("\n"), "utf8");
console.log(`导出 ${out.length} 条，字节 ${out.join("\n").length}`);

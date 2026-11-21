#!/usr/bin/env node
/**
 * F6 原生等价物生成器：把 #22 / #63 的补丁目标翻译成宿主原生组合配置。
 *
 * 为什么不手写 yml：手写会把「补丁改成什么」抄第二遍，补丁一改就静默不等价。
 * 本脚本以 `lib/core.js` 的补丁定义为唯一事实源，以宿主 `.dshpurge.bak`
 * 基线为官方原文，机械生成 `native/cordis.patch.yml`。补丁改了重跑即可。
 *
 * 用法：
 *   node scripts/f6-native-gen.mjs                 生成（写 native/cordis.patch.yml）
 *   node scripts/f6-native-gen.mjs --check         只校验，不写；有差异退出码 1
 *   node scripts/f6-native-gen.mjs --ai-base <p>   指定宿主 @deepseek-ai 目录
 * 退出码：0 一致/已生成；1 --check 有差异或基线缺失；2 参数错
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PATCHES } from "../lib/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const CHECK = argv.includes("--check");
const AI_BASE = val(
  "--ai-base",
  "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai"
);
const OUT = path.join(ROOT, "native", "cordis.patch.yml");

const patchOf = (id) => {
  const p = ALL_PATCHES.find((x) => x.id === id);
  if (!p) throw new Error(`补丁 #${id} 不在 ALL_PATCHES 里`);
  return p;
};

/** 只接受纯数字字面量（含 2e4 / 50 * 1024 这类），别的一律拒绝，不 eval 任意代码。 */
function numericFrom(replace, name) {
  const m = new RegExp(`const ${name} = ([0-9eE.*+\\- ]+);`).exec(replace);
  if (!m) throw new Error(`替换体里找不到 ${name} 的赋值`);
  const expr = m[1].trim();
  if (!/^[0-9eE.*+\- ]+$/.test(expr)) throw new Error(`${name} 的值不是纯数字表达式：${expr}`);
  // eslint-disable-next-line no-new-func -- 上一行已把字符集限死为数字与算术符号
  const n = Function(`"use strict";return (${expr});`)();
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} 算出来不是正数：${n}`);
  return n;
}

/** 读官方基线：优先 .dshpurge.bak（未打补丁原文），没有才退回现文件。 */
function baseline(file) {
  const bak = `${file}.dshpurge.bak`;
  if (fs.existsSync(bak)) return { text: fs.readFileSync(bak, "utf8"), source: bak };
  if (fs.existsSync(file)) return { text: fs.readFileSync(file, "utf8"), source: file };
  throw new Error(`基线缺失：${file}`);
}

/** 从 base 组合里切出某行 `section: |` 的块标量正文（按缩进边界，不用正则猜）。 */
function blockScalar(text, rowId, key) {
  const lines = text.split(/\r?\n/);
  const rowAt = lines.findIndex((l) => /^\s*-\s*id:\s*([^\s#]+)\s*$/.test(l) && l.trim() === `- id: ${rowId}`);
  if (rowAt < 0) throw new Error(`base 组合里没有 ${rowId} 行`);
  const rowIndent = lines[rowAt].search(/\S/);
  let keyAt = -1;
  let keyIndent = -1;
  for (let i = rowAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = l.search(/\S/);
    if (ind <= rowIndent) break;
    if (l.trim() === `${key}: |`) {
      keyAt = i;
      keyIndent = ind;
      break;
    }
  }
  if (keyAt < 0) throw new Error(`${rowId} 行没有 ${key}: | 块`);
  const body = [];
  for (let i = keyAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) {
      body.push("");
      continue;
    }
    if (l.search(/\S/) <= keyIndent) break;
    body.push(l);
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  const strip = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  return body.map((l) => (l.trim() ? l.slice(strip) : "")).join("\n");
}

/** 逐条套补丁替换体；任一条在基线里找不到就报错，绝不静默跳过。 */
function applyReplacements(text, patch) {
  let out = text;
  const hits = [];
  for (const r of patch.replacements || []) {
    if (!out.includes(r.pattern)) throw new Error(`#${patch.id} 的 pattern 在基线里不命中：${r.pattern.slice(0, 60)}…`);
    out = out.split(r.pattern).join(r.replace);
    hits.push(r.pattern.length);
  }
  return { out, hits: hits.length };
}

function indentBlock(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l.trim() ? pad + l : ""))
    .join("\n");
}

function build() {
  const p22 = patchOf(22);
  const caps = {};
  for (const [constName, configKey] of [
    ["READ_LIMIT", "readLimit"],
    ["READ_MAX_LINE_LENGTH", "readMaxLineLength"],
    ["READ_MAX_BYTES", "readMaxBytes"],
  ]) {
    const r = (p22.replacements || []).find((x) => x.replace.includes(`const ${constName} =`));
    if (!r) throw new Error(`#22 没有 ${constName} 的替换体`);
    caps[configKey] = numericFrom(r.replace, constName);
  }

  const base = baseline(path.join(AI_BASE, "dsh-base", "cordis.patch.yml"));
  const officialSection = blockScalar(base.text, "plan-mode", "section");
  const p63 = patchOf(63);
  const { out: nativeSection, hits } = applyReplacements(officialSection, p63);

  const L = [];
  L.push("# F6 原生等价物（由 scripts/f6-native-gen.mjs 生成，禁止手改）");
  L.push(`# 事实源：lib/core.js 补丁 #22 / #63；官方原文：${path.basename(base.source)}`);
  L.push("# 默认不生效：本文件不被 package.json 的 dsh.bundle.patch 引用，");
  L.push("# 只有显式合并进隔离 profile 且 DSH_PURGE_NATIVE_PILOTS=1 时才承担语义。");
  L.push("");
  L.push("# #22 READ_CAPS_RAISED → tool-fs Config（官方 src/index.ts 的 zod 默认值就是被改的常量）");
  L.push("# 注意：patch 替换整行 config，不是合并，所以 applyPatch 必须一并带上。");
  L.push("- id: tool-fs");
  L.push("  config:");
  L.push("    applyPatch: false");
  for (const [k, v] of Object.entries(caps)) L.push(`    ${k}: ${v}`);
  L.push("");
  L.push(`# #63 OFFICIAL_PLAN_MODE_NEUTRAL → plan-mode Config.section（${hits} 处替换全部命中）`);
  L.push("- id: plan-mode");
  L.push("  config:");
  L.push("    section: |");
  L.push(indentBlock(nativeSection, 6));
  L.push("");
  return { text: L.join("\n"), caps, hits, baselineSource: base.source };
}

function main() {
  let built;
  try {
    built = build();
  } catch (e) {
    console.error(`生成失败：${String((e && e.message) || e)}`);
    return 1;
  }
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (CHECK) {
    const same = existing === built.text;
    console.log(same ? "native/cordis.patch.yml 与补丁定义一致" : "native/cordis.patch.yml 与补丁定义不一致，需重跑生成");
    console.log(`  #22 caps ${JSON.stringify(built.caps)}`);
    console.log(`  #63 替换命中 ${built.hits} 处`);
    return same ? 0 : 1;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, built.text, "utf8");
  console.log(`已生成 ${OUT}`);
  console.log(`  #22 caps ${JSON.stringify(built.caps)}`);
  console.log(`  #63 替换命中 ${built.hits} 处，基线 ${built.baselineSource}`);
  return 0;
}

process.exit(main());

#!/usr/bin/env node
/**
 * 上游源码级差分：比较两棵隔离树里 @deepseek-ai/* 的 src/（缺 src 时回落 lib/）。
 *
 * 为什么要有这个：契约审计（audit-next）只回答「我们的 pattern 还认不认得」，
 * 但「上游到底改了什么语义」只有读源码才知道。版本升级时先跑这个，
 * 才知道该重对齐哪几条、哪些是新增能力可以转原生（E2/E3 的输入端）。
 *
 * 用法：
 *   node scripts/upstream-src-diff.mjs                       # rc.3 → rc.5
 *   node scripts/upstream-src-diff.mjs --from 0.2.2-rc.3 --to 0.2.2-rc.5
 *   node scripts/upstream-src-diff.mjs --json out.json       # 落盘
 *   node scripts/upstream-src-diff.mjs --pkg dsh-tool-fs     # 只比一个包
 *
 * 退出码：0 成功；2 隔离树缺失。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(name);

const FROM = arg("--from", "0.2.2-rc.3");
const TO = arg("--to", "0.2.2-rc.5");
const ONLY_PKG = arg("--pkg", "");
const STAGE_ROOT = path.join(ROOT, "..", ".tmp");

function aiBase(version) {
  const p = path.join(STAGE_ROOT, `host-${version}`, "resources", "app", "dsh", "node_modules", "@deepseek-ai");
  return fs.existsSync(p) ? p : null;
}

function walk(dir, base = dir, acc = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of ents) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, acc);
    else if (/\.(ts|tsx|js|mjs|yml|yaml|json|md)$/.test(e.name)) acc.push(path.relative(base, abs).replace(/\\/g, "/"));
  }
  return acc;
}

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/** 取一个包参与比较的文件集：src/ + lib/，外加包根顶层的 yml/yaml/json（组合配置就在这儿）。 */
function filesOf(aiRoot, pkg) {
  const dir = path.join(aiRoot, pkg);
  const set = {};
  for (const root of ["src", "lib"]) {
    const abs = path.join(dir, root);
    if (!fs.existsSync(abs)) continue;
    for (const rel of walk(abs)) set[`${root}/${rel}`] = sha(path.join(abs, rel.replace(/\//g, path.sep)));
  }
  // 包根顶层：cordis.patch.yml 之类不在 src 里，漏了会误判「无变化」。
  // package.json 单独比（version/deps 每个包都会变，混进来会淹掉真实差异）。
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !/\.(yml|yaml|md)$/.test(e.name)) continue;
    set[`./${e.name}`] = sha(path.join(dir, e.name));
  }
  return set;
}

/** package.json 的「结构指纹」：丢掉 version，只留 exports / deps 的键与路径，用来发现破坏性变更。 */
function pkgMeta(aiRoot, pkg) {
  const p = path.join(aiRoot, pkg, "package.json");
  if (!fs.existsSync(p)) return null;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
  return JSON.stringify({
    exports: j.exports ? Object.keys(j.exports).sort() : null,
    main: j.main || "",
    types: j.types || "",
    deps: j.dependencies ? Object.keys(j.dependencies).sort() : null,
    peer: j.peerDependencies ? Object.keys(j.peerDependencies).sort() : null,
    dsh: j.dsh || null,
  });
}

const fromBase = aiBase(FROM);
const toBase = aiBase(TO);
if (!fromBase || !toBase) {
  console.error(`隔离树缺失：${!fromBase ? FROM : ""} ${!toBase ? TO : ""}`.trim());
  process.exit(2);
}

const pkgs = fs
  .readdirSync(fromBase, { withFileTypes: true })
  .filter((e) => e.isDirectory() && (!ONLY_PKG || e.name === ONLY_PKG))
  .map((e) => e.name)
  .sort();

const result = { from: FROM, to: TO, generatedAt: new Date().toISOString(), packages: [] };
let changedPkgs = 0;

for (const pkg of pkgs) {
  const a = filesOf(fromBase, pkg);
  const b = filesOf(toBase, pkg);
  const added = Object.keys(b).filter((f) => !(f in a));
  const removed = Object.keys(a).filter((f) => !(f in b));
  const modified = Object.keys(b).filter((f) => f in a && a[f] !== b[f]);
  const metaChanged = pkgMeta(fromBase, pkg) !== pkgMeta(toBase, pkg);
  if (!added.length && !removed.length && !modified.length && !metaChanged) continue;
  changedPkgs += 1;
  result.packages.push({ pkg, added, removed, modified, metaChanged });
  // 控制台只报摘要，全文进 JSON
  console.log(`\n## ${pkg}${metaChanged ? "（package.json 结构变化）" : ""}`);
  console.log(`   改 ${modified.length} / 增 ${added.length} / 删 ${removed.length}`);
  for (const f of modified.slice(0, 6)) console.log(`   ~ ${f}`);
  if (modified.length > 6) console.log(`   … 另有 ${modified.length - 6} 个改动文件`);
  for (const f of added.slice(0, 4)) console.log(`   + ${f}`);
  for (const f of removed.slice(0, 4)) console.log(`   - ${f}`);
}

console.log(`\n共 ${pkgs.length} 个包，${changedPkgs} 个有变化（${FROM} → ${TO}）`);
const out = arg("--json", "");
if (out) {
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`已写 ${out}`);
}
if (flag("--fail-on-change") && changedPkgs > 0) process.exit(1);

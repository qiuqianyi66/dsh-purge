#!/usr/bin/env node
/**
 * 隔离树全链路门禁：backupAll → apply → status/diagnose → revert → 逐字节比对。
 *
 * 为什么需要：`--diagnose` 与单测都只看单个文件/单条补丁；「对隔离树做 revert 却摘掉
 * 真实宿主补丁」这类跨树副作用（1.2.2 修复的事故）只有端到端跑一遍才能暴露。
 * 本脚本把那次人工验证固化成可重复的预发布门禁：
 *
 *   node scripts/isolated-cycle.mjs --version 0.2.2-rc.3
 *
 * 前置：先用 audit-next 铺一份干净官方包树（约 1 GB，不进 CI）：
 *
 *   node scripts/audit-next.mjs --version 0.2.2-rc.3 --refresh
 *
 * 判据（任一失败即退出码 1，只打印不修复）：
 *   G1 隔离树存在且无残留（无 .dshpurge.bak / .dshpurge.tx-*）
 *   G2 所有解析出的载体路径都在隔离树内（跨树副作用门禁）
 *   G3 apply：failed = 0，且干净树上至少改写 1 个文件
 *   G4 apply 后 diagnose：drifted / partial / carrier_missing 全 0
 *   G5 改写过的 .js 全部 node --check 通过
 *   G6 revert：errors = 0，revert 后与快照逐文件 sha256 比对 mismatch = 0
 *
 * 退出码：0 全过；1 判据失败；2 前置不满足（树缺失/不干净）。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as core from "../lib/core.js";
import * as drift from "../lib/drift.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const VERSION = val("--version", "0.2.2-rc.3");
const STAGE = path.resolve(val("--stage", path.join(ROOT, "..", ".tmp", `host-${VERSION}`)));
const aiBase = path.join(STAGE, "resources", "app", "dsh", "node_modules", "@deepseek-ai");

const results = [];
const gate = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};

// ---- G1 前置：树存在且干净 ------------------------------------------------
if (!fs.existsSync(aiBase)) {
  console.error(`[G1] 隔离树不存在：${aiBase}`);
  console.error(`先铺树：node scripts/audit-next.mjs --version ${VERSION} --refresh`);
  process.exit(2);
}
const stale = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".dshpurge.bak") || e.name.includes(".dshpurge.tx-")) stale.push(p);
  }
};
walk(aiBase);
if (stale.length > 0) {
  console.error(`[G1] 隔离树有残留（${stale.length} 个 bak/tx 文件），不是干净树， refusing to run。`);
  console.error(`重铺：node scripts/audit-next.mjs --version ${VERSION} --refresh`);
  process.exit(2);
}
gate("G1", true, `干净树 ${STAGE}`);

// ---- 运行环境：DSH_HOME 指向隔离树，避免读写真实 profile -------------------
process.env.DSH_HOME = STAGE;
process.env.DSH_SURFACE = "desktop";

// ---- G2 跨树副作用门禁 ----------------------------------------------------
const files = core.targetFiles(aiBase, STAGE);
const resolved = [];
for (const [key, v] of Object.entries(files)) {
  for (const p of [].concat(v)) if (p) resolved.push([key, p]);
}
const outside = resolved.filter(([, p]) => !path.normalize(p).toLowerCase().startsWith(path.normalize(STAGE).toLowerCase()));
gate("G2", outside.length === 0, outside.length === 0
  ? `载体 ${resolved.length} 条全部落在隔离树内`
  : `越界载体：${outside.map(([k, p]) => `${k} -> ${p}`).join("; ")}`);

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const snap = () => Object.fromEntries(resolved.filter(([, p]) => fs.existsSync(p)).map(([, p]) => [p, sha(p)]));
const before = snap();

// ---- G3/G4/G5 apply → diagnose → 语法 ------------------------------------
await core.backupAll(aiBase);
const report = await core.applyPatches(aiBase, core.ALL_PATCHES, {});
const sum = core.summarizeApplyReport(report);
const after = snap();
const changed = Object.keys(before).filter((p) => before[p] !== after[p]);
gate("G3", sum.failed.length === 0 && changed.length > 0,
  `applied ${sum.applied} / already ${sum.already} / failed ${sum.failed.length} / 改写 ${changed.length} 个文件`);

const diag = drift.diagnose({
  aiBase, dshHome: STAGE, patches: core.ALL_PATCHES,
  resolveFiles: (b, h) => core.targetFiles(b, h),
  appliesHere: (p) => core.patchAppliesHere(p),
});
gate("G4", diag.drifted.length === 0 && diag.partial.length === 0 && diag.carrier_missing.length === 0,
  `命中 ${diag.clean.length} / drifted ${diag.drifted.length} / partial ${diag.partial.length} / carrier_missing ${diag.carrier_missing.length}` +
    (diag.carrier_missing.length ? `（${diag.carrier_missing.map((e) => `#${e.id}`).join(",")}）` : ""));

const jsBad = [];
for (const fp of changed.filter((p) => p.endsWith(".js"))) {
  try { execFileSync(process.execPath, ["--check", fp], { stdio: "pipe" }); }
  catch { jsBad.push(fp); }
}
gate("G5", jsBad.length === 0, jsBad.length === 0 ? `改写 .js ${changed.filter((p) => p.endsWith(".js")).length} 个语法全过` : `语法失败：${jsBad.join("; ")}`);

// ---- G6 revert → 逐字节比对 ------------------------------------------------
const reverted = await core.revertAll(aiBase, {});
const mismatch = Object.keys(before).filter((p) => {
  const now = fs.existsSync(p) ? sha(p) : null;
  return now !== before[p];
});
gate("G6", reverted.errors.length === 0 && mismatch.length === 0,
  `reverted ${reverted.reverted.length} / errors ${reverted.errors.length} / mismatch ${mismatch.length}${mismatch.length ? "：" + mismatch.join("; ") : ""}`);

// ---- 收尾：revert 后残差只提示不判死（终态=官方默认的 marker 属已知语义） ----
const st = await core.patchStatus(aiBase, core.ALL_PATCHES);
const residual = {};
for (const [id, v] of Object.entries(st)) if (v !== "pending" && v !== "na") residual[`#${id}`] = v;
console.log(`INFO  revert 后非 pending 残差（已知语义，不判死）：${JSON.stringify(residual)}`);

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0
  ? `OK  ${results.length}/${results.length} 判据全过（${VERSION} 隔离树）`
  : `NG  ${failed.length}/${results.length} 判据失败：${failed.map((r) => r.id).join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);

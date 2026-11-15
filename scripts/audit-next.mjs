#!/usr/bin/env node
/**
 * F22 新版本离体审计（next-version audit）——升级宿主之前，先问「补丁还认不认得新原文」。
 *
 * 为什么需要：`--diagnose` 只能看**已装**那一版宿主的漂移；等真升级完才发现失配，
 * 代价是插件在用户机器上静默失效。本脚本把官方 npm 包按目标版本拉到隔离目录，
 * 用插件自己的匹配引擎（targetFiles / filePatchOutcome）逐条试补丁，
 * 在升级之前就给出「哪几条要重对齐」。
 *
 * 边界：
 *   - 只读。唯一写操作是往 `--stage` 目录里铺一份官方包树（可反复复用）。
 *   - 只审计包内载体。presets / profiles / app.asar / 客户端 bundle 这类不在 npm 树里的
 *     载体在隔离树中不存在，报 `no_carrier`，**不代表上游删了它**，需在真机上另验。
 *
 * 用法：
 *   node scripts/audit-next.mjs --version 0.2.2-rc.3 [--refresh] [--json <file>]
 * 选项：
 *   --version <v>   目标官方版本，默认读上游最新 release
 *   --stage <dir>   隔离树根，默认 ../.tmp/host-<version>
 *   --refresh       删掉隔离树重铺
 *   --json <file>   把结论落盘
 * 退出码：0 全部认得 / 1 有补丁需重对齐 / 2 铺树或探测失败
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ALL_PATCHES,
  targetFiles,
  filePatchOutcome,
} from "../lib/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const val = (f, d = "") => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const has = (f) => argv.includes(f);

// 退出码门禁口径（学 dsh-plugin-health 的 --fail-on）：
//   drift（默认）= 有需重对齐就失败；any = 有未审计也失败；none = 总成功。
const FAIL_ON = (val("--fail-on", "drift") || "drift").toLowerCase();

const VERSION = val("--version", "0.2.2-rc.3");
const STAGE = path.resolve(val("--stage", path.join(ROOT, "..", ".tmp", `host-${VERSION}`)));
// aiBase 是 resources/app：真机布局 `<app>/dsh/node_modules/@deepseek-ai/...`，
// nestedPkg 的第一段就是 aiBase/dsh/node_modules。
const AI_BASE = path.join(STAGE, "resources", "app");
const RUNTIME_DIR = path.join(AI_BASE, "dsh");
const HOME = path.join(STAGE, "home");
const JSON_OUT = val("--json", "");

/** 宿主 package.json 里列了全部 dsh 包 —— 用它当「该装哪些包」的权威名单。 */
function hostDepNames(hostRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(hostRoot, "resources", "app", "dsh", "package.json"), "utf8"));
  return Object.keys(pkg.dependencies || {}).filter((n) => n.startsWith("@deepseek-ai/dsh"));
}

function hostRoot() {
  return val("--host", "D:\\DeepSeek Harness");
}

function stageReady() {
  const marker = path.join(RUNTIME_DIR, "node_modules");
  return fs.existsSync(marker) && fs.existsSync(path.join(RUNTIME_DIR, "package.json"));
}

/** 只装补丁真正会碰到的包，避免为了审计把 400MB 全下载一遍。 */
function neededPackages() {
  const names = hostDepNames(hostRoot());
  const core = fs.readFileSync(path.join(ROOT, "lib", "core.js"), "utf8");
  const start = core.indexOf("export function targetFiles(");
  const end = core.indexOf("function asLf(");
  const body = core.slice(start, end);
  const refs = new Set([...body.matchAll(/"(dsh-[a-z0-9-]+)"/g)].map((m) => `@deepseek-ai/${m[1]}`));
  return names.filter((n) => refs.has(n));
}

function buildStage() {
  if (has("--refresh") && fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const deps = {};
  for (const name of neededPackages()) deps[name] = VERSION;
  fs.writeFileSync(
    path.join(RUNTIME_DIR, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh-desktop-runtime", version: VERSION, private: true, dependencies: deps }, null, 2)
  );
  // 宿主壳版本文件也放一份：readHostVersion 认的是 resources/app/package.json。
  fs.writeFileSync(
    path.join(AI_BASE, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh-desktop", version: VERSION, private: true }, null, 2)
  );

  const specs = Object.keys(deps).map((n) => `${n}@${VERSION}`);
  let missing = new Set();
  for (let i = 0; i < 4; i += 1) {
    const live = specs.filter((s) => !missing.has(s.split("/")[1].replace(/@.*/, "")));
    if (!live.length) break;
    try {
      // Windows 上 npm 是 .cmd，execFileSync 直接调会 ENOENT；统一走 shell。
      execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error", ...live], {
        cwd: RUNTIME_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        shell: true,
      });
      break;
    } catch (e) {
      const out = `${e.stdout || ""}${e.stderr || ""}`;
      const name = /404 Not Found - GET .*%2f([a-z0-9-]+)/i.exec(out)?.[1];
      if (!name || missing.has(name)) throw new Error(`铺树失败：${out.slice(0, 400)}`);
      missing.add(name);
      console.log(`  跳过上游已无此包的 ${name}`);
    }
  }
  return { missing: [...missing] };
}

function pathsOf(files, key) {
  const v = files[key];
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).filter((p) => p && fs.existsSync(p));
}

function insideStage(fp) {
  return path.resolve(fp).toLowerCase().startsWith(STAGE.toLowerCase());
}

function head(s) {
  return String(s).replace(/\s+/g, " ").slice(0, 72);
}

function audit() {
  const files = targetFiles(AI_BASE, HOME);
  const rows = [];
  const carriers = new Set();
  for (const p of ALL_PATCHES) {
    if (p.retired) continue;
    const keys = Array.isArray(p.file) ? p.file : [p.file];
    const reps = Array.isArray(p.replacements) ? p.replacements : (p.patterns ?? []).map((pat) => ({ pattern: pat, replace: p.replace }));
    const detail = [];
    const inStage = [];
    let noCarrier = 0;
    let drifted = 0;
    for (const key of keys) {
      const paths = pathsOf(files, key);
      if (!paths.length) {
        noCarrier += 1;
        detail.push(`${key}:none`);
        continue;
      }
      for (const fp of paths) {
        if (!insideStage(fp)) {
          detail.push(`${key}:out-of-stage`);
          continue;
        }
        carriers.add(key);
        const text = fs.readFileSync(fp, "utf8");
        const outcome = filePatchOutcome(text, p, fp);
        detail.push(`${key}:${outcome}`);
        inStage.push(text);
        if (outcome === "drifted") drifted += 1;
      }
    }
    // 每条 replacement 在新原文里还认不认得：老版本遗留的 pattern 本来就不该命中，
    // 但「一条都不命中」才是补丁整体报废，所以两个数都要报。
    let matched = 0;
    for (const rep of reps) {
      const pat = rep?.pattern;
      if (typeof pat !== "string" || pat === "") {
        matched += 0; // 正则形态不走这里，交给 filePatchOutcome 判
        continue;
      }
      const needle = pat.replace(/\r\n/g, "\n");
      if (inStage.some((t) => t.replace(/\r\n/g, "\n").includes(needle))) matched += 1;
    }
    // 没有任何 replacement 的是「只验 marker」的校验型补丁（如 #88 验 #87 的落点），
    // 新原文里没有 marker 是常态，不是漂移。
    const verdict =
      reps.length === 0
        ? "verify"
        : noCarrier === keys.length
          ? "no-carrier"
          : matched > 0
            ? "ok"
            : drifted > 0
              ? "drift"
              : "unknown";
    rows.push({ id: p.id, name: p.name, verdict, detail, optional: Boolean(p.optional), matched, total: reps.length, outOfStage: detail.filter((d) => d.endsWith("out-of-stage")).length });
  }
  return { files, rows, carriers: [...carriers] };
}

/** 漂移的补丁给出第一条不命中的 pattern 原文，方便直接对着官方新文本改。 */
function missedPatterns(patchId) {
  const p = ALL_PATCHES.find((x) => x.id === patchId);
  if (!p) return [];
  const reps = Array.isArray(p.replacements) ? p.replacements : (p.patterns ?? []).map((pat) => ({ pattern: pat, replace: p.replace }));
  return reps
    .map(({ pattern }) => (pattern instanceof RegExp ? String(pattern) : pattern))
    .filter((s) => typeof s === "string" && s.length > 0)
    .map((s) => head(s));
}

function main() {
  console.log(`新版本离体审计 / next-version audit`);
  console.log(`  目标版本  ${VERSION}`);
  console.log(`  隔离树    ${STAGE}`);
  if (!stageReady() || has("--refresh")) {
    const r = buildStage();
    if (r.missing.length) console.log(`  上游无包  ${r.missing.join(" ")}`);
  }
  const { rows, carriers } = audit();
  const bad = rows.filter((r) => r.verdict === "drift");
  const skipped = rows.filter((r) => r.verdict === "no-carrier");
  const verifyOnly = rows.filter((r) => r.verdict === "verify");
  const partial = rows.filter((r) => r.verdict === "ok" && r.matched < r.total);

  console.log("");
  console.log(`  载体      ${carriers.length} 个键在隔离树中落地 ｜ 补丁 ${rows.length} 条（不含退役）`);
  console.log(`  认得      ${rows.filter((r) => r.verdict === "ok").length} 条`);
  console.log(`  校验型    ${verifyOnly.length} 条（只验 marker，无 replacement，不算漂移）`);
  console.log(`  需重对齐  ${bad.length} 条${bad.length ? "（" + bad.map((r) => "#" + r.id).join(" ") + "）" : ""}`);
  console.log(`  未审计    ${skipped.length} 条（载体不在 npm 包内，需真机验）`);
  if (partial.length) {
    console.log("");
    console.log(`部分命中 ${partial.length} 条（含为旧版本保留的 pattern，属预期）：`);
    for (const r of partial) console.log(`  #${r.id} ${r.name}  ${r.matched}/${r.total}`);
  }
  if (bad.length) {
    console.log("");
    console.log("需重对齐：");
    for (const r of bad) {
      console.log(`  #${r.id} ${r.name}  ${r.detail.join(" ")}${r.optional ? "  (optional)" : ""}`);
      for (const s of missedPatterns(r.id)) console.log(`     pattern「${s}」`);
    }
  }
  if (JSON_OUT) {
    fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true });
    fs.writeFileSync(
      path.resolve(JSON_OUT),
      JSON.stringify({ checkedAt: new Date().toISOString(), version: VERSION, stage: STAGE, rows, missed: Object.fromEntries(bad.map((r) => [r.id, missedPatterns(r.id)])), skipped: skipped.map((r) => r.id) }, null, 2)
    );
    console.log(`\n报告：${path.resolve(JSON_OUT)}`);
  }
  if (!["drift", "any", "none"].includes(FAIL_ON)) {
    console.log(`  ！--fail-on=${FAIL_ON} 不认识，按 drift 处理`);
  }
  const exitCode =
    FAIL_ON === "none" ? 0 : FAIL_ON === "any" ? (bad.length || skipped.length ? 1 : 0) : bad.length ? 1 : 0;
  return exitCode;
}
try {
  process.exit(main());
} catch (e) {
  console.error(String((e && e.stack) || e));
  process.exit(2);
}

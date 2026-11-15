#!/usr/bin/env node
/**
 * F21 上游同步巡检（upstream sync）——让本插件跟着宿主 DSH 的版本走。
 *
 * 为什么需要：补丁全靠字面量匹配宿主源码，宿主一发版就可能整段失配。
 * 现有零件各管一段（`--diagnose` 查漂移、`--preupdate` 查升级风险、
 * compat-matrix 声明目标），但没人回答「上游发了没、我落后没、该动哪几条」。
 * 本脚本只做编排与判定，不改产品逻辑：
 *   1) 上游最新 tag（GitHub releases）↔ 本机宿主版本 ↔ 矩阵声明目标，三方对齐
 *   2) 跑 `--diagnose --json` 拿漂移事实，跑 `--preupdate --json` 拿升级风险
 *   3) 全绿才允许机械推进 target；不绿就出「重对齐任务单」
 *
 * 边界：默认只读。`--bump` 是唯一写操作，且必须同时满足「漂移为零 + 显式 --yes」，
 * 写完立刻跑矩阵脚本与单测自证，任何一步红就回滚。
 *
 * 用法：
 *   node scripts/upstream-sync.mjs                体检（只读）
 *   node scripts/upstream-sync.mjs --report       落盘报告（json + md）
 *   node scripts/upstream-sync.mjs --plan         打印重对齐任务单
 *   node scripts/upstream-sync.mjs --bump --yes   全绿时推进 compat-matrix / dshTarget
 * 选项：
 *   --offline          跳过 GitHub 探测（只比本机与矩阵）
 *   --dsh-home <path>  指定 DSH_HOME
 *   --out <dir>        报告目录，默认 <repo>/../upstream-reports
 * 退出码：0 无需动作 / 1 有动作待办 / 2 探测或回滚失败
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { COMPAT_CURRENT } from "../lib/compat-matrix.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "dsh-purge.js");
const UPSTREAM_REPO = "deepseek-ai/deepseek-harness";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = "") => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const opts = {
  report: has("--report"),
  plan: has("--plan"),
  bump: has("--bump"),
  yes: has("--yes"),
  offline: has("--offline"),
  dshHome: val("--dsh-home", process.env.DSH_HOME || path.join(os.homedir(), ".dsh")),
  out: val("--out", path.join(ROOT, "..", "upstream-reports")),
};

/** GitHub 的 tag 形如 dsh-v0.2.2-rc.3；去掉前缀后与 package.json version 可比。 */
function normalizeTag(tag) {
  return String(tag || "").replace(/^dsh[-_]?/i, "").replace(/^v/i, "").trim();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** 跑 CLI 并解析 JSON；stderr 丢弃，避免 undici 警告混进 stdout。 */
function runCli(mode) {
  const out = execFileSync(process.execPath, [BIN, mode, "--json"], {
    env: { ...process.env, DSH_HOME: opts.dshHome },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const s = String(out || "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error(`${mode} 没有输出 JSON`);
  return JSON.parse(s.slice(start));
}

async function fetchUpstream() {
  if (opts.offline) return { skipped: true };
  try {
    const res = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/releases?per_page=10`, {
      headers: { "user-agent": "dsh-purge-upstream-sync", accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: `GitHub API ${res.status}` };
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return { error: "releases 为空" };
    const sorted = list
      .filter((r) => r && !r.draft && r.tag_name)
      .sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
    if (!sorted.length) return { error: "没有非草稿 release" };
    const top = sorted[0];
    return {
      tag: top.tag_name,
      version: normalizeTag(top.tag_name),
      publishedAt: top.published_at || "",
      prerelease: Boolean(top.prerelease),
      url: top.html_url || "",
    };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

/** 从 diagnose 的 aiBase 反推安装根：`<root>/resources/app/...` 之前即为根。 */
function installRootFromAiBase(aiBase) {
  const m = String(aiBase || "").search(/[\\/]resources[\\/]/i);
  if (m < 0) return "";
  return String(aiBase).slice(0, m);
}

function readHostPackage(root) {
  if (!root) return null;
  const file = path.join(root, "resources", "app", "package.json");
  const pkg = readJson(file);
  if (!pkg) return null;
  return { file, name: pkg.name || "", version: pkg.version || "" };
}

/** 干净桶里也可能藏着漂移载体：逐载体扫 verdict，不能只看 patch 级数组。 */
function collectCarrierDrift(report) {
  const seen = new Map();
  for (const bucket of ["clean", "applied_by_marker"]) {
    for (const p of report?.[bucket] || []) {
      for (const c of p.carriers || []) {
        if (!c || c.verdict !== "drifted") continue;
        // 同一条补丁会同时出现在 clean 与 applied_by_marker 两个桶里，按 id+载体键去重。
        const k = `${p.id}:${c.key}:${c.fp || ""}`;
        if (seen.has(k)) continue;
        seen.set(k, {
          id: p.id,
          name: p.name,
          key: c.key,
          fp: c.fp || "",
          verdict: c.verdict,
          markers_ok: Boolean(c.markers_ok),
          hits: (c.hits || []).map((h) => ({ head: h.head, hits: h.hits, expect: h.expect })),
        });
      }
    }
  }
  return [...seen.values()];
}

function collectMarkerOnly(report) {
  const ids = [];
  for (const bucket of ["clean", "applied_by_marker"]) {
    for (const p of report?.[bucket] || []) {
      if ((p.carriers || []).some((c) => c && c.verdict === "marked_only")) ids.push(p.id);
    }
  }
  return [...new Set(ids)];
}

function buildTasks(state) {
  const tasks = [];
  const { host, matrix, upstream, report, driftCarriers } = state;

  if (!report) {
    tasks.push({ code: "PROBE_FAILED", level: "high", text: "诊断跑不通，先修好宿主定位再谈同步" });
    return tasks;
  }
  if (driftCarriers.length) {
    tasks.push({
      code: "REALIGN_PATCHES",
      level: "high",
      text: `${driftCarriers.length} 个载体判定 drifted，pattern 已不命中，需按官方新原文重对齐（见 --plan）`,
      ids: [...new Set(driftCarriers.map((d) => d.id))],
    });
  }
  for (const [bucket, label] of [["drifted", "改了原文"], ["dead_target", "目标已消失"], ["carrier_missing", "载体缺失"]]) {
    const n = (report[bucket] || []).length;
    if (n) tasks.push({ code: bucket.toUpperCase(), level: "high", text: `${n} 条${label}，需处理` });
  }
  const green = !driftCarriers.length && !["drifted", "dead_target", "carrier_missing"].every((b) => (report[b] || []).length === 0);
  state.green = green;

  if (matrix.current !== host.version) {
    tasks.push({
      code: "MATRIX_LAG",
      level: green ? "medium" : "high",
      text: `宿主 ${host.version}，矩阵仍声明 ${matrix.current}${green ? "（漂移为零，可 --bump 推进）" : "（漂移未清，先重对齐再推进）"}`,
    });
  }
  if (upstream.version && upstream.version !== host.version) {
    tasks.push({
      code: "UPSTREAM_AHEAD",
      level: "medium",
      text: `上游最新 ${upstream.version}（${upstream.publishedAt.slice(0, 10)}），本机 ${host.version}；升级前先 --revert 并跑 --preupdate`,
    });
  }
  if (!tasks.length) {
    tasks.push({ code: "IN_SYNC", level: "clear", text: "宿主、矩阵、上游三者一致，漂移为零" });
  }
  return tasks;
}

function bumpTargets(from, to) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const backupDir = path.join(opts.out, "backups", stamp);
  const files = {
    matrix: path.join(ROOT, "lib", "compat-matrix.js"),
    pkg: path.join(ROOT, "package.json"),
    readme: path.join(ROOT, "README.md"),
  };
  fs.mkdirSync(backupDir, { recursive: true });
  for (const [k, f] of Object.entries(files)) {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, path.basename(f)));
  }

  const restore = () => {
    for (const f of Object.values(files)) {
      const b = path.join(backupDir, path.basename(f));
      if (fs.existsSync(b)) fs.copyFileSync(b, f);
    }
  };

  try {
    const matrixSrc = fs.readFileSync(files.matrix, "utf8");
    const matrixNext = matrixSrc.replace(
      /(export const COMPAT_CURRENT = \{\s*\n\s*dsh:\s*)"([^"]*)"/,
      (all, head) => `${head}"${to}"`
    );
    if (matrixNext === matrixSrc) throw new Error(`compat-matrix.js 没找到 dsh: "${from}"，未改动`);
    fs.writeFileSync(files.matrix, matrixNext);

    const pkgSrc = fs.readFileSync(files.pkg, "utf8");
    const pkgNext = pkgSrc.replace(/("dshTarget"\s*:\s*)"([^"]*)"/, (all, head) => `${head}"${to}"`);
    if (pkgNext === pkgSrc) throw new Error(`package.json 没找到 dshTarget: "${from}"，未改动`);
    fs.writeFileSync(files.pkg, pkgNext);

    const run = (args) =>
      execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    run([path.join(ROOT, "scripts", "gen-compat-readme.mjs")]);
    run([path.join(ROOT, "scripts", "gen-compat-readme.mjs"), "--check"]);
    run(["--test", path.join(ROOT, "test", "compat-matrix.test.js")]);
    return { ok: true, backupDir };
  } catch (e) {
    restore();
    return { ok: false, backupDir, error: String((e && e.message) || e) };
  }
}

function render(state, tasks) {
  const L = [];
  const { host, matrix, upstream, report, preupdate, driftCarriers, markerOnly } = state;
  L.push("上游同步巡检 / upstream sync（" + (opts.bump ? "含写入" : "只读") + "）");
  L.push(`  宿主      ${host.version || "?"}   ${host.root || ""}`);
  L.push(`  矩阵      ${matrix.current} → 插件 ${matrix.plugin}   dshTarget=${matrix.dshTarget}`);
  L.push(
    upstream.skipped
      ? "  上游      跳过探测（--offline）"
      : upstream.error
        ? `  上游      探测失败：${upstream.error}`
        : `  上游      ${upstream.version}（${upstream.tag}，${upstream.publishedAt.slice(0, 10)}${upstream.prerelease ? "，预发布" : ""}）`
  );
  if (report) {
    L.push(
      `  诊断      载体 ${report.carriers_total} ｜ 补丁 ${report.patches_total} ｜ 漂移 ${(report.drifted || []).length}` +
        ` ｜ 消失 ${(report.dead_target || []).length} ｜ 缺失 ${(report.carrier_missing || []).length}` +
        ` ｜ 退役 ${(report.retired || []).length}`
    );
    const patchCount = new Set(driftCarriers.map((d) => d.id)).size;
    L.push(
      `  载体级     真漂移 ${driftCarriers.length} 个载体 / ${patchCount} 条补丁` +
        `${driftCarriers.length ? "（" + [...new Set(driftCarriers.map((d) => "#" + d.id))].join(" ") + "）" : ""}` +
        ` ｜ 仅 marker ${markerOnly.length} 条`
    );
  }
  if (preupdate) L.push(`  升级风险   ${preupdate.level}（${(preupdate.risks || []).map((r) => r.code).join(" ") || "无"}）`);
  L.push("");
  L.push("结论：");
  for (const t of tasks) L.push(`  [${t.level}] ${t.code}  ${t.text}`);
  if (opts.plan && driftCarriers.length) {
    L.push("");
    L.push("重对齐任务单：");
    for (const d of driftCarriers) {
      L.push(`  #${d.id} ${d.name} · ${d.key}  (markers_ok=${d.markers_ok})`);
      L.push(`     ${d.fp}`);
      for (const h of d.hits) L.push(`     pattern「${h.head}」命中 ${h.hits}${h.expect != null ? `（期望 ${h.expect}）` : ""}`);
    }
  }
  return L.join("\n");
}

async function main() {
  let diagnose;
  let preupdate;
  let probeError = "";
  try {
    diagnose = runCli("--diagnose");
  } catch (e) {
    probeError = String((e && e.message) || e);
  }
  if (diagnose) {
    try {
      preupdate = runCli("--preupdate");
    } catch {
      preupdate = null;
    }
  }

  const report = diagnose?.reports?.[0] || null;
  const hostRoot = installRootFromAiBase(report?.aiBase || "");
  const hostPkg = readHostPackage(hostRoot) || { version: "", name: "", file: "" };
  const pkgLocal = readJson(path.join(ROOT, "package.json")) || {};

  const state = {
    host: { version: hostPkg.version, name: hostPkg.name, root: hostRoot, pkgFile: hostPkg.file },
    matrix: { current: COMPAT_CURRENT.dsh, plugin: COMPAT_CURRENT.plugin, dshTarget: pkgLocal.dshTarget || "" },
    upstream: await fetchUpstream(),
    report,
    preupdate,
    driftCarriers: report ? collectCarrierDrift(report) : [],
    markerOnly: report ? collectMarkerOnly(report) : [],
    green: false,
  };

  const tasks = buildTasks(state);
  const text = render(state, tasks);
  console.log(text);

  if (probeError) console.log(`\n诊断失败：${probeError}`);

  if (opts.bump) {
    if (!state.green) {
      console.log("\n拒绝写入：漂移未清零，先按任务单重对齐再 --bump。");
    } else if (!opts.yes) {
      console.log("\n未写入：--bump 需要同时带 --yes。");
    } else if (state.matrix.current === state.host.version) {
      console.log(`\n未写入：矩阵已是 ${state.host.version}。`);
    } else {
      const r = bumpTargets(state.matrix.current, state.host.version);
      if (r.ok) {
        console.log(`\n已推进 ${state.matrix.current} → ${state.host.version}；备份 ${r.backupDir}`);
        console.log("提醒：矩阵里旧版本那一行已随 supported 行一并改掉，需人工补一条 legacy 行。");
      } else {
        console.log(`\n推进失败并已回滚：${r.error}`);
        console.log(`备份仍在 ${r.backupDir}`);
      }
    }
  }

  if (opts.report) {
    fs.mkdirSync(opts.out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    // 只留摘要：诊断原始报告动辄 500KB，报告要能被人读完，不该塞进全量载体明细。
    const reportSummary = report
      ? {
          aiBase: report.aiBase,
          carriers_total: report.carriers_total,
          patches_total: report.patches_total,
          counts: {
            drifted: (report.drifted || []).length,
            dead_target: (report.dead_target || []).length,
            carrier_missing: (report.carrier_missing || []).length,
            retired: (report.retired || []).length,
            no_carrier: (report.no_carrier || []).length,
            clean: (report.clean || []).length,
            optional_missing: (report.optional_missing || []).length,
            skipped_surface: (report.skipped_surface || []).length,
            applied_by_marker: (report.applied_by_marker || []).length,
          },
        }
      : null;
    const payload = {
      checkedAt: new Date().toISOString(),
      probeError,
      green: state.green,
      host: state.host,
      matrix: state.matrix,
      upstream: state.upstream,
      report_summary: reportSummary,
      drift_carriers: state.driftCarriers,
      marker_only: state.markerOnly,
      preupdate: preupdate ? { level: preupdate.level, codes: (preupdate.risks || []).map((r) => r.code) } : null,
      tasks,
    };
    const jsonPath = path.join(opts.out, `upstream-sync-${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
    fs.writeFileSync(path.join(opts.out, "latest.json"), JSON.stringify(payload, null, 2), "utf8");
    fs.writeFileSync(jsonPath.replace(/\.json$/, ".md"), `# 上游同步巡检 ${payload.checkedAt}\n\n\`\`\`\n${text}\n\`\`\`\n`, "utf8");
    console.log(`\n报告：${jsonPath}`);
  }

  const bad = probeError || (state.upstream.error && !opts.offline);
  if (bad && !tasks.some((t) => t.level === "high")) return 2;
  return tasks.some((t) => t.level !== "clear") ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String((e && e.stack) || e));
    process.exit(2);
  });

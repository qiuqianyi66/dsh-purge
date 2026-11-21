#!/usr/bin/env node
/**
 * E1 上游雷达：在升级宿主之前，先算出「上游这次变更会打坏哪几条补丁」。
 *
 * 与 upstream-sync.mjs 的分工（不重复造轮子）：
 *   upstream-sync  = 向后看：本机已装的宿主上，pattern 还命不命中（drift）
 *   upstream-radar = 向前看：上游已发布但本机还没装的变更，会命中哪些补丁
 *
 * 信号源不是 issues/PR（官方公开仓 issues 关闭、PR 接口 404），而是官方自己写的
 * `docs/upgrade-guide/<版本>/<变更名>/guide.md`。rc.1 起随包发布，所以离线也能跑。
 *
 * 用法：
 *   node scripts/upstream-radar.mjs                  只读本机随包 guides
 *   node scripts/upstream-radar.mjs --remote         额外拉 master 上本机没有的版本
 *   node scripts/upstream-radar.mjs --report         落盘 upstream-reports/radar-*.json
 *   node scripts/upstream-radar.mjs --ai-base <p>    指定宿主 @deepseek-ai
 * 选项：--max-fetch N（远端 guide 正文抓取上限，默认 20，超限如实标注截断）
 * 退出码：0 无命中 / 1 有补丁被上游变更命中 / 2 探测失败
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PATCHES, targetFiles } from "../lib/core.js";
import { compareDshVersion } from "../lib/compat-matrix.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const AI_BASE = val("--ai-base", "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai");
const REMOTE = has("--remote");
const REPORT = has("--report");
const MAX_FETCH = Number(val("--max-fetch", "40"));
const ALL_VERSIONS = has("--all");
const OUT_DIR = val("--out", path.join(ROOT, "upstream-reports"));
const REPO = "deepseek-ai/deepseek-harness";
const API = `https://api.github.com/repos/${REPO}/contents`;

/** 载体 key → 包名。用 targetFiles 的真实解析结果，不另立一张手工映射表。 */
function carrierPackages(aiBase) {
  const files = targetFiles(aiBase);
  const map = new Map();
  for (const [key, p] of Object.entries(files)) {
    if (!p) continue;
    const m = /@deepseek-ai[\\/]([^\\/]+)/.exec(String(p));
    if (m) map.set(key, m[1]);
  }
  return map;
}

/** 包名 → 补丁 id 列表。 */
function packagePatches(aiBase) {
  const carriers = carrierPackages(aiBase);
  const byPkg = new Map();
  for (const p of ALL_PATCHES) {
    const keys = Array.isArray(p.file) ? p.file : [p.file];
    for (const k of keys) {
      const pkg = carriers.get(k);
      if (!pkg) continue;
      if (!byPkg.has(pkg)) byPkg.set(pkg, new Set());
      byPkg.get(pkg).add(p.id);
    }
  }
  return byPkg;
}

function frontmatterDescription(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return "";
  const d = /^\s*description:\s*(.+)$/m.exec(m[1]);
  if (!d) return "";
  return d[1].trim().replace(/^["']|["']$/g, "");
}

/** 只抓官方包名与 ctx.<service> 两类硬 token，不做模糊关键词匹配。 */
function tokens(text) {
  const pkgs = new Set();
  for (const m of text.matchAll(/@deepseek-ai\/(dsh-[a-z0-9-]+)/g)) pkgs.add(m[1]);
  // 指南正文常写裸包名（不带 scope），例如 `dsh-sandbox-policy`
  for (const m of text.matchAll(/\b(dsh-[a-z0-9]+(?:-[a-z0-9]+)+)\b/g)) pkgs.add(m[1]);
  const services = new Set();
  for (const m of text.matchAll(/\bctx\.([a-zA-Z][a-zA-Z0-9]*)/g)) services.add(m[1]);
  return { pkgs: [...pkgs], services: [...services] };
}

function localGuides(aiBase) {
  const root = path.join(aiBase, "dsh", "docs", "upgrade-guide");
  if (!fs.existsSync(root)) return { root, versions: [], missing: true };
  const versions = [];
  for (const v of fs.readdirSync(root, { withFileTypes: true })) {
    if (!v.isDirectory()) continue;
    const vdir = path.join(root, v.name);
    const changes = [];
    for (const c of fs.readdirSync(vdir, { withFileTypes: true })) {
      if (!c.isDirectory()) continue;
      const g = path.join(vdir, c.name, "guide.md");
      if (!fs.existsSync(g)) continue;
      const text = fs.readFileSync(g, "utf8");
      changes.push({ name: c.name, description: frontmatterDescription(text), ...tokens(text), source: g });
    }
    versions.push({ version: v.name, changes });
  }
  return { root, versions, missing: false };
}

async function ghJson(url) {
  // 未授权只有 60 次/小时，实测抓到第 24 条就 403。有 token 就用，没有就如实报错不静默。
  const headers = { "user-agent": "dsh-purge-upstream-radar", accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${url}`);
  return res.json();
}

async function remoteGap(localVersionNames, relevant) {
  const listed = await ghJson(`${API}/docs/upgrade-guide?ref=master`);
  const remoteVersions = listed.filter((x) => x.type === "dir").map((x) => x.name);
  const gap = remoteVersions.filter((v) => !localVersionNames.includes(v) && relevant(v));
  const out = { remoteVersions, gap, versions: [], fetched: 0, truncated: false, errors: [] };
  for (const v of gap) {
    let changes;
    try {
      changes = (await ghJson(`${API}/docs/upgrade-guide/${v}?ref=master`)).filter((x) => x.type === "dir");
    } catch (e) {
      out.errors.push(`${v}: ${String(e.message || e)}`);
      continue;
    }
    const got = [];
    for (const c of changes) {
      if (out.fetched >= MAX_FETCH) {
        out.truncated = true;
        break;
      }
      try {
        const body = await ghJson(`${API}/docs/upgrade-guide/${v}/${c.name}/guide.md?ref=master`);
        const text = Buffer.from(body.content || "", "base64").toString("utf8");
        out.fetched++;
        got.push({ name: c.name, description: frontmatterDescription(text), ...tokens(text), source: `master:${v}/${c.name}` });
      } catch (e) {
        out.errors.push(`${v}/${c.name}: ${String(e.message || e)}`);
      }
    }
    out.versions.push({ version: v, changes: got });
  }
  return out;
}

function impact(versions, byPkg) {
  const rows = [];
  const hitIds = new Set();
  for (const v of versions) {
    for (const c of v.changes) {
      const ids = new Set();
      const matchedPkgs = [];
      for (const pkg of c.pkgs) {
        if (byPkg.has(pkg)) {
          matchedPkgs.push(pkg);
          for (const id of byPkg.get(pkg)) ids.add(id);
        }
      }
      for (const id of ids) hitIds.add(id);
      rows.push({
        version: v.version,
        change: c.name,
        description: c.description,
        matchedPackages: matchedPkgs,
        patchIds: [...ids].sort((a, b) => a - b),
        unmatchedServices: c.services,
        source: c.source,
      });
    }
  }
  return { rows, hitIds: [...hitIds].sort((a, b) => a - b) };
}

async function main() {
  if (!fs.existsSync(AI_BASE)) {
    console.error(`宿主目录不存在：${AI_BASE}`);
    return 2;
  }
  const byPkg = packagePatches(AI_BASE);
  const local = localGuides(AI_BASE);
  if (local.missing) console.log(`本机没有随包 upgrade-guide（${local.root}），只能靠 --remote`);

  // guide 目录 vX 的语义是「从 vX 往上升」。所以对本机有风险的只有 >= 本机版本的那些；
  // 更老的版本是已经吸收过的历史，默认不报，避免把 143 条历史噪声当成待办。
  const hostPkg = JSON.parse(fs.readFileSync(path.join(AI_BASE, "dsh-base", "package.json"), "utf8"));
  const hostVersion = String(hostPkg.version || "");
  const norm = (v) => String(v).replace(/^v/i, "");
  const relevant = (v) => ALL_VERSIONS || !hostVersion || compareDshVersion(norm(v), hostVersion) >= 0;
  const localVersions = local.versions.filter((v) => relevant(v.version));
  const skippedHistory = local.versions.length - localVersions.length;

  let remote = null;
  let probeError = "";
  if (REMOTE) {
    try {
      remote = await remoteGap(local.versions.map((v) => v.version), relevant);
    } catch (e) {
      probeError = String((e && e.message) || e);
    }
  }

  const allVersions = [...localVersions, ...(remote?.versions || []).filter((v) => relevant(v.version))];
  const { rows, hitIds } = impact(allVersions, byPkg);
  const hitRows = rows.filter((r) => r.patchIds.length);

  console.log("E1 上游雷达（向前看：升级前会打坏哪几条）");
  console.log(`  本机宿主      ${hostVersion || "?"}`);
  console.log(
    `  相关 guides   ${allVersions.length} 个版本 / ${allVersions.reduce((n, v) => n + v.changes.length, 0)} 条变更` +
      `（已滤掉 ${skippedHistory} 个历史版本${ALL_VERSIONS ? "，--all 生效" : "，--all 可看全量"}）`
  );
  if (REMOTE) {
    console.log(
      probeError
        ? `  远端探测      失败：${probeError}`
        : `  远端领先      ${remote.gap.length} 个版本本机没有（${remote.gap.join(" ") || "无"}），抓正文 ${remote.fetched} 条${remote.truncated ? "（已截断，--max-fetch 提高上限）" : ""}`
    );
    if (remote?.errors.length) console.log(`  远端错误      ${remote.errors.length} 条，详见报告`);
  }
  console.log(`  载体映射      ${byPkg.size} 个包被补丁覆盖`);
  console.log(`  命中          ${hitRows.length} 条变更命中 ${hitIds.length} 条补丁`);
  console.log("");
  for (const r of hitRows) {
    console.log(`  [${r.version}] ${r.change}`);
    console.log(`     补丁 ${r.patchIds.map((i) => "#" + i).join(" ")}  ← ${r.matchedPackages.join(" ")}`);
    if (r.description) console.log(`     ${r.description}`);
  }
  if (!hitRows.length) console.log("  没有变更的官方包名落在补丁载体上。");
  const serviceOnly = rows.filter((r) => !r.patchIds.length && r.unmatchedServices.length);
  if (serviceOnly.length) {
    console.log("");
    console.log(`  待人工判读    ${serviceOnly.length} 条变更只提到 ctx.<service>，包名映射覆盖不到（不猜）：`);
    for (const r of serviceOnly.slice(0, 10)) console.log(`     [${r.version}] ${r.change} → ctx.${r.unmatchedServices.join(" ctx.")}`);
  }

  if (REPORT) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const payload = {
      checkedAt: new Date().toISOString(),
      aiBase: AI_BASE,
      local: { root: local.root, versions: local.versions.map((v) => ({ version: v.version, changes: v.changes.length })) },
      remote: remote ? { gap: remote.gap, fetched: remote.fetched, truncated: remote.truncated, errors: remote.errors } : null,
      probeError,
      hitPatchIds: hitIds,
      rows,
    };
    const f = path.join(OUT_DIR, `radar-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify(payload, null, 2), "utf8");
    fs.writeFileSync(path.join(OUT_DIR, "radar-latest.json"), JSON.stringify(payload, null, 2), "utf8");
    console.log(`\n报告：${f}`);
  }
  if (probeError) return 2;
  return hitIds.length ? 1 : 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(String((e && e.stack) || e));
    process.exit(2);
  });

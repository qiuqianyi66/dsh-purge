// lib/drift.js — 补丁漂移诊断（纯只读：不写任何文件、不改 analysis 状态）
//
// 为什么单独一层：官方每改一次文案、每搬一次包，补丁就静默失配。
// 以前只能靠人肉 diff 才发现（rc.3 的 #32/#53 就是这么挖出来的：提示词
// 搬到 dsh-harness-dev-context、Canonical 改成 Advertised），这里把它变成
// 机器可复现的三件事：
//   1) 这台机器上有几个宿主 base，哪个是当前真正在用的，哪些是残留
//   2) 每条补丁的每个载体：文件在不在、pattern 还命中几次、是否已打标
//   3) 命不中时，官方到底改了什么（file vs .dshpurge.bak 的行级差异）
//
// 判据全部照抄打补丁引擎（applyReplacementsToText）：LF 归一、大小写敏感、
// 全量计数。诊断结论若和引擎不一致，那诊断本身就没意义。

import fs from "node:fs";
import path from "node:path";

const asLf = (s) => String(s == null ? "" : s).replace(/\r\n/g, "\n");

/** 与引擎同口径：大小写敏感、LF 归一、全量计数。 */
export function countHits(text, needle) {
  if (typeof needle !== "string" || needle === "") return 0;
  const hay = asLf(text);
  const n = asLf(needle);
  let i = 0;
  let c = 0;
  while ((i = hay.indexOf(n, i)) !== -1) {
    c++;
    i += n.length;
  }
  return c;
}

function readIf(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function listCount(dir) {
  try {
    return fs.readdirSync(dir).length;
  } catch {
    return -1;
  }
}

/**
 * 行级差异窗口：去掉公共前缀/公共后缀，中间那段就是官方改掉的部分。
 * 补丁场景几乎总是「中间整段被替换」，公共前后缀法比 LCS 更准也更快。
 */
export function diffWindow(beforeText, afterText, maxLines = 14) {
  const b = asLf(beforeText).split("\n");
  const a = asLf(afterText).split("\n");
  let head = 0;
  while (head < b.length && head < a.length && b[head] === a[head]) head++;
  let tailB = b.length - 1;
  let tailA = a.length - 1;
  while (tailB >= head && tailA >= head && b[tailB] === a[tailA]) {
    tailB--;
    tailA--;
  }
  const removed = b.slice(head, tailB + 1);
  const added = a.slice(head, tailA + 1);
  return {
    startLine: head + 1,
    removed: removed.slice(0, maxLines),
    added: added.slice(0, maxLines),
    removedCount: removed.length,
    addedCount: added.length,
    truncated: removed.length > maxLines || added.length > maxLines,
  };
}

/**
 * 单个载体的体检：存在性 + 每个 pattern 的命中数 + 官方改了什么。
 * fp 是目标文件；同目录的 *.dshpurge.bak 是 purge 自己留的「官方基线」。
 */
export function probeCarrier(fp, patch, options = {}) {
  const maxDiff = options.maxDiffLines ?? 14;
  const exists = fs.existsSync(fp);
  const bakPath = `${fp}.dshpurge.bak`;
  const bakExists = fs.existsSync(bakPath);
  const row = {
    fp,
    exists,
    bakExists,
    marked: 0,
    hits: [],
    diff: null,
    verdict: "unknown",
  };
  if (!exists) {
    row.verdict = "carrier_missing";
    return row;
  }
  const text = readIf(fp);
  row.marked = countHits(text, "dsh-purge");
  const reps = Array.isArray(patch?.replacements) ? patch.replacements : [];
  for (const rep of reps) {
    const pat = rep?.pattern;
    if (typeof pat !== "string" || pat === "") continue;
    row.hits.push({
      head: pat.slice(0, 72).replace(/\n/g, "\\n"),
      hits: countHits(text, pat),
      expect: typeof rep.expect === "number" ? rep.expect : null,
    });
  }
  if (bakExists) {
    const bak = readIf(bakPath);
    if (bak != null && bak !== text) row.diff = diffWindow(bak, text, maxDiff);
  }
  const anyHit = row.hits.some((h) => h.hits > 0);
  row.verdict = anyHit ? "matchable" : row.marked > 0 ? "marked_only" : "drifted";
  return row;
}

/**
 * 多条宿主 base 的排序：谁才是正在用的那份。
 * 判据写成可解释的加分项，出问题时能一眼看出为什么这么排，而不是黑箱。
 */
export function rankBases(bases) {
  const rows = bases.map((b) => {
    const aiBase = typeof b === "string" ? b : b?.aiBase || b?.path || "";
    const norm = String(aiBase).replace(/\\/g, "/").toLowerCase();
    const archived = /_(archive|archived)|archived[-_]|\.trash|\/backup\//.test(norm);
    const pnpm = norm.includes("/.pnpm/");
    const hasCore =
      fs.existsSync(path.join(aiBase, "dsh-web-app", "lib", "index.js")) ||
      fs.existsSync(path.join(aiBase, "dsh-agent-instructions", "lib", "index.js"));
    const hasCtx = fs.existsSync(path.join(aiBase, "dsh-harness-dev-context", "lib", "index.js"));
    const pkgs = listCount(aiBase);
    let score = 0;
    if (!archived && !pnpm) score += 100;
    if (hasCore) score += 50;
    if (hasCtx) score += 20;
    score += Math.min(Math.max(pkgs, 0), 300) / 10;
    const why = [];
    if (archived) why.push("路径像归档残留");
    if (pnpm) why.push("pnpm 缓存路径");
    if (!hasCore) why.push("缺 dsh-web-app / dsh-agent-instructions");
    if (!hasCtx) why.push("缺 harness-dev-context（rc.3 新载体）");
    return { aiBase, pkgs, hasCore, hasCtx, archived, pnpm, score, why };
  });
  rows.sort((x, y) => y.score - x.score);
  return rows.map((r, i) => ({ ...r, live: i === 0 }));
}

/**
 * 整机诊断：对给定 base 跑一遍全部补丁，产出可读结论。
 * 只读，不落盘，不碰 patch_status 缓存。
 */
/**
 * targetFiles 的值有两种形态：单候选字符串，或多候选数组（firstExisting 的候选列表）。
 * 必须逐个试存在性，否则会把「多候选」误判成「文件缺失」——第一版诊断就栽在这。
 */
export function resolveCarrierPath(raw) {
  const cands = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const c of cands) {
    if (typeof c !== "string" || c === "") continue;
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* 权限/坏路径：继续试下一个候选 */
    }
  }
  return null;
}

export function diagnose({ aiBase, dshHome, patches, resolveFiles, appliesHere, maxDiffLines = 14 }) {
  const files = resolveFiles(aiBase, dshHome);
  const out = {
    aiBase,
    carriers_total: Object.keys(files).length,
    patches_total: patches.length,
    skipped_surface: [],
    no_carrier: [],
    clean: [],
    drifted: [],
    dead_target: [],
    carrier_missing: [],
    optional_missing: [],
  };
  for (const patch of patches) {
    // 表面不适用（na）的补丁不参与漂移判定：它们本来就不改这台机器上的文件，
    // 拿它们算「漂移」会造出一堆假告警，这是 v1 诊断的第一版错口径。
    if (typeof appliesHere === "function" && !appliesHere(patch)) {
      out.skipped_surface.push({ id: patch.id, name: patch.name });
      continue;
    }
    const keys = Array.isArray(patch.file) ? patch.file : [];
    if (!keys.length) {
      out.no_carrier.push({ id: patch.id, name: patch.name, optional: Boolean(patch.optional) });
      continue;
    }
    let patchedAny = false;
    let missingAny = false;
    const carriers = [];
    for (const key of keys) {
      const fp = resolveCarrierPath(files[key]);
      if (!fp) {
        carriers.push({ key, verdict: "carrier_unresolved", fp: null });
        missingAny = true;
        continue;
      }
      const row = probeCarrier(fp, patch, { maxDiffLines });
      carriers.push({ key, ...row });
      if (row.verdict === "matchable" || row.verdict === "marked_only") patchedAny = true;
      if (row.verdict === "carrier_missing") missingAny = true;
    }
    const entry = {
      id: patch.id,
      name: patch.name,
      optional: Boolean(patch.optional),
      carriers,
    };
    if (patchedAny) {
      out.clean.push(entry);
      continue;
    }
    // 「改了」和「没了」要分开：官方搬/改原文时，备份与本体必有差异，diff 拿得到线索；
    // 如果本体从未被改过（diff 全空、补丁标记 0）又一条 pattern 都命中不了，
    // 那说明这段原文在这个版本里根本不存在 —— 补丁是报废的，不是待修的。
    // 两者处置完全不同：前者该重定位 pattern，后者该退役或重写语义。
    const allZero = carriers.every((c) => (c.hits || []).every((h) => h.hits === 0));
    const untouched = carriers.every((c) => !c.diff && !c.marked);
    if (!missingAny && allZero && untouched) {
      out.dead_target = out.dead_target || [];
      out.dead_target.push(entry);
      continue;
    }
    if (missingAny && patch.optional) out.optional_missing.push(entry);
    else if (missingAny) out.carrier_missing.push(entry);
    else out.drifted.push(entry);
  }
  return out;
}

/** 把诊断结果渲染成人看的文本（CLI 用）。 */
export function renderDiagnose(report, { maxPatches = 40 } = {}) {
  const L = [];
  L.push("补丁漂移诊断 / drift diagnosis（只读，未改动任何文件）");
  L.push(`宿主 base：${report.aiBase}`);
  L.push(
    `载体 ${report.carriers_total} 个 ｜ 补丁 ${report.patches_total} 条 → ` +
      `可命中 ${report.clean.length} ｜ 改过原文 ${report.drifted.length} ｜ ` +
      `目标已消失 ${report.dead_target.length} ｜ ` +
      `载体缺失 ${report.carrier_missing.length} ｜ 可选缺失 ${report.optional_missing.length} ｜ ` +
      `本表面不适用 ${report.skipped_surface.length} ｜ 无文件字段 ${report.no_carrier.length}`
  );
  L.push("");
  if (!report.drifted.length) {
    L.push("✓ 没有「改了原文」的漂移。");
  } else {
    L.push(`✗ 漂移 ${report.drifted.length} 条（官方改了原文或搬了载体）：`);
    for (const p of report.drifted.slice(0, maxPatches)) {
      L.push("");
      L.push(`  #${p.id} ${p.name}`);
      for (const c of p.carriers) {
        if (c.verdict === "carrier_unresolved") {
          L.push(`     · ${c.key}: 该 carrier 在本机无对应文件`);
          continue;
        }
        if (!c.exists) {
          L.push(`     · ${c.key}: 文件不存在 ${c.fp}`);
          continue;
        }
        const hitSum = c.hits.reduce((a, h) => a + h.hits, 0);
        L.push(`     · ${c.key}: 命中 ${hitSum}/${c.hits.length} 个 pattern ｜ 补丁标记 ${c.marked}`);
        // 只列「该命中却没命中」的那几条，够定位就行；全列会把终端刷爆。
        const misses = c.hits.filter((h) => h.hits === 0);
        for (const h of misses.slice(0, 3)) {
          L.push(`         ✗ 未命中${h.expect != null ? `（期望 ${h.expect}）` : ""}  ${h.head}`);
        }
        if (misses.length > 3) L.push(`         …另有 ${misses.length - 3} 个 pattern 也未命中`);
        if (c.diff) {
          L.push(`         ⌁ 官方改在 ${path.basename(c.fp)} 第 ${c.diff.startLine} 行起 ` +
            `（旧 ${c.diff.removedCount} 行 → 新 ${c.diff.addedCount} 行）`);
          for (const line of c.diff.removed.slice(0, 6)) L.push(`           - ${line.slice(0, 150)}`);
          for (const line of c.diff.added.slice(0, 6)) L.push(`           + ${line.slice(0, 150)}`);
          if (c.diff.truncated) L.push("           …（已截断）");
        }
      }
    }
    if (report.drifted.length > maxPatches) L.push(`\n  …还有 ${report.drifted.length - maxPatches} 条未列出`);
  }
  if (report.dead_target.length) {
    L.push("");
    L.push(`⊘ 目标已消失 ${report.dead_target.length} 条（本体未被改过 + pattern 一条都命中不了）：`);
    L.push("  这不是待修漂移。官方把这段原文整段重写或删掉了，补丁在此版本报废；");
    L.push("  要保留同等效果，只能按新文本重写这条补丁，而不是改几个字去追旧 pattern。");
    for (const p of report.dead_target.slice(0, maxPatches)) {
      L.push(`  #${p.id} ${p.name} → ${p.carriers.map((c) => c.key).join(", ")}`);
    }
  }
  if (report.carrier_missing.length) {
    L.push("");
    L.push(`⚠ 载体缺失 ${report.carrier_missing.length} 条（非可选补丁，文件/包找不到）：`);
    for (const p of report.carrier_missing.slice(0, maxPatches)) {
      L.push(`  #${p.id} ${p.name} → ${p.carriers.filter((c) => !c.exists || c.verdict === "carrier_unresolved").map((c) => c.key).join(", ")}`);
    }
  }
  if (report.optional_missing.length) {
    L.push("");
    L.push(`· 可选补丁无载体 ${report.optional_missing.length} 条（正常跳过，不算故障）：`);
    L.push("  " + report.optional_missing.map((p) => `#${p.id}`).join(" "));
  }
  return L.join("\n");
}

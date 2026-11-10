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
import { buildSelfcheckAdvice, renderAdviceLines, advicePayload } from "./selfcheck-advice.js";

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
 * 行级差异窗口：定位补丁锚点在宿主文件里的实际改动位置。
 *
 * 为什么不能只用「公共前后缀」：它会把中间所有内容当成一段替换。宿主里两处相隔
 * 282 行的改动会被并成一个窗口，报出 removed 283 / added 283（本机 bash 载体就是
 * 如此，真实差异只有 2 行），看着像官方重写了整段。这里改走 patience diff：
 * 用「两侧都只出现一次的行」当锚点分治，两处相隔很远的改动就落成两个独立窗口。
 */
export function diffWindow(beforeText, afterText, maxLines = 14, maxHunks = 3) {
  const b = asLf(beforeText).split("\n");
  const a = asLf(afterText).split("\n");
  const raw = [];
  collectHunks(b, a, 0, b.length, 0, a.length, raw);

  const hunks = raw.slice(0, maxHunks).map((h) => {
    const removed = b.slice(h.bLo, h.bHi);
    const added = a.slice(h.aLo, h.aHi);
    return {
      startLine: h.bLo + 1,
      removed: removed.slice(0, maxLines),
      added: added.slice(0, maxLines),
      removedCount: removed.length,
      addedCount: added.length,
    };
  });
  const first = hunks[0] ?? { startLine: 0, removed: [], added: [], removedCount: 0, addedCount: 0 };
  return {
    startLine: first.startLine,
    removed: first.removed,
    added: first.added,
    removedCount: raw.reduce((n, h) => n + (h.bHi - h.bLo), 0),
    addedCount: raw.reduce((n, h) => n + (h.aHi - h.aLo), 0),
    hunks,
    hunksTotal: raw.length,
    truncated: raw.length > maxHunks || hunks.some((h) => h.removedCount > maxLines || h.addedCount > maxLines),
  };
}

/** 递归分治：先裁公共前后缀，再用唯一行锚点把中间区域切开。 */
function collectHunks(b, a, bLo, bHi, aLo, aHi, out, depth = 0) {
  while (bLo < bHi && aLo < aHi && b[bLo] === a[aLo]) {
    bLo++;
    aLo++;
  }
  while (bHi > bLo && aHi > aLo && b[bHi - 1] === a[aHi - 1]) {
    bHi--;
    aHi--;
  }
  if (bLo === bHi && aLo === aHi) return;
  // 深度兜底：锚点异常时退化成一段，宁可粗也不能栈溢出。
  const anchors = depth > 12 ? [] : findAnchors(b, a, bLo, bHi, aLo, aHi);
  if (!anchors.length) {
    out.push({ bLo, bHi, aLo, aHi });
    return;
  }
  let pb = bLo;
  let pa = aLo;
  for (const [ab, aa] of anchors) {
    collectHunks(b, a, pb, ab, pa, aa, out, depth + 1);
    pb = ab + 1;
    pa = aa + 1;
  }
  collectHunks(b, a, pb, bHi, pa, aHi, out, depth + 1);
}

/** patience 锚点：两侧各只出现一次的行，再取最长递增子序列保证顺序一致。 */
function findAnchors(b, a, bLo, bHi, aLo, aHi) {
  const countB = new Map();
  for (let i = bLo; i < bHi; i++) {
    const cur = countB.get(b[i]);
    if (cur) cur.count++;
    else countB.set(b[i], { count: 1, idx: i });
  }
  const countA = new Map();
  for (let i = aLo; i < aHi; i++) {
    const cur = countA.get(a[i]);
    if (cur) cur.count++;
    else countA.set(a[i], { count: 1, idx: i });
  }
  const cand = [];
  for (const [line, e] of countB) {
    if (e.count !== 1) continue;
    const ea = countA.get(line);
    if (!ea || ea.count !== 1) continue;
    cand.push([e.idx, ea.idx]);
  }
  cand.sort((x, y) => x[0] - y[0]);

  const tails = [];
  const prev = new Array(cand.length).fill(-1);
  for (let i = 0; i < cand.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cand[tails[mid]][1] < cand[i][1]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    if (lo === tails.length) tails.push(i);
    else tails[lo] = i;
  }
  const anchors = [];
  let i = tails.length ? tails[tails.length - 1] : -1;
  while (i >= 0) {
    anchors.push(cand[i]);
    i = prev[i];
  }
  return anchors.reverse();
}

/**
 * 补丁自己的 markers 是否已在文本里（与打补丁引擎 isMarked 同口径）。
 * 为什么必须有这一步：pattern 命中数只在「还没打」时有意义。补丁已经生效时
 * 原文被替换掉，pattern 必然 0 命中；此时若只看 pattern 就把「已生效」误报成
 * 漂移（#33/#48 就是这么被误判的，宿主里替换后文案明明都在）。
 */
export function markersPresent(text, patch) {
  const markers = Array.isArray(patch?.markers)
    ? patch.markers.filter((m) => typeof m === "string" && m !== "")
    : [];
  if (!markers.length) return false;
  const hay = asLf(text);
  const any = patch?.markersAny === true;
  return any ? markers.some((m) => hay.includes(asLf(m))) : markers.every((m) => hay.includes(asLf(m)));
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
    markers_ok: false,
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
  row.markers_ok = markersPresent(text, patch);
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
  // 判序：还有 pattern 能命中 → 还可打（matchable）；pattern 全没了但有「purge 动过
  // 这个文件」的证据（bak 与本体有差异，或本体带 [dsh-purge] 自体标记）且 markers 在
  // → 已经打过（applied_by_marker），不是漂移；只有 dsh-purge 字样 → 打标型；
  // 三者皆无才是真漂移（官方改了文案或搬了载体）。
  // 为什么要这个证据位：markers 里有 `fetch: true`、`personaPrefix: ""` 这类宿主本来
  // 就有的文本，只看 markers 会把从没打过的载体谎报成已生效。
  const appliedEvidence = Boolean(row.diff) || row.marked > 0;
  row.verdict = anyHit
    ? "matchable"
    : row.markers_ok && appliedEvidence
      ? "applied_by_marker"
      : row.marked > 0
        ? "marked_only"
        : "drifted";
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
    applied_by_marker: [],
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
    let matchableAny = false;
    let markerAny = false;
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
      if (row.verdict === "matchable") {
        patchedAny = true;
        matchableAny = true;
      }
      if (row.verdict === "marked_only" || row.verdict === "applied_by_marker") patchedAny = true;
      if (row.verdict === "applied_by_marker") markerAny = true;
      if (row.verdict === "carrier_missing") missingAny = true;
    }
    const entry = {
      id: patch.id,
      name: patch.name,
      optional: Boolean(patch.optional),
      carriers,
    };
    if (patchedAny) {
      // clean 沿用旧口径（这条补丁在这台机上不用再处理）；只把「仅靠 markers 确认」
      // 的条目单独留一份 ID，便于核对判定依据，不改变 clean 计数。
      out.clean.push(entry);
      if (!matchableAny && markerAny) out.applied_by_marker.push(entry);
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
  const appliedByMarker = report.applied_by_marker || [];
  L.push(
    `载体 ${report.carriers_total} 个 ｜ 补丁 ${report.patches_total} 条 → ` +
      `可命中 ${report.clean.length}（其中仅 markers 确认 ${appliedByMarker.length}） ｜ ` +
      `改过原文 ${report.drifted.length} ｜ ` +
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
        L.push(`     · ${c.key}: 命中 ${hitSum}/${c.hits.length} 个 pattern ｜ 补丁标记 ${c.marked} ｜ markers ${c.markers_ok ? "在" : "无"}`);
        // 只列「该命中却没命中」的那几条，够定位就行；全列会把终端刷爆。
        const misses = c.hits.filter((h) => h.hits === 0);
        for (const h of misses.slice(0, 3)) {
          L.push(`         ✗ 未命中${h.expect != null ? `（期望 ${h.expect}）` : ""}  ${h.head}`);
        }
        if (misses.length > 3) L.push(`         …另有 ${misses.length - 3} 个 pattern 也未命中`);
        if (c.diff) {
          const hs = Array.isArray(c.diff.hunks) ? c.diff.hunks : [];
          const base = path.basename(c.fp);
          if (hs.length > 1) {
            L.push(`         ⌁ 官方改在 ${base} 共 ${c.diff.hunksTotal} 处：` +
              hs.map((h) => `第 ${h.startLine} 行（旧 ${h.removedCount} → 新 ${h.addedCount}）`).join("、") +
              (c.diff.hunksTotal > hs.length ? " …" : ""));
          } else if (hs.length === 1) {
            L.push(`         ⌁ 官方改在 ${base} 第 ${hs[0].startLine} 行起 ` +
              `（旧 ${hs[0].removedCount} 行 → 新 ${hs[0].addedCount} 行）`);
          }
          const first = hs[0] ?? { removed: c.diff.removed, added: c.diff.added };
          for (const line of first.removed.slice(0, 6)) L.push(`           - ${line.slice(0, 150)}`);
          for (const line of first.added.slice(0, 6)) L.push(`           + ${line.slice(0, 150)}`);
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
  // F16：诊断不只回显状态，末尾按处置优先级给出下一步（只建议，不自动执行）。
  L.push(...renderAdviceLines(buildSelfcheckAdvice(report)));
  return L.join("\n");
}

/** 诊断 JSON 里的建议字段：面板直接取结构，不自己拼命令。 */
export function adviceForReport(report) {
  return advicePayload(report);
}

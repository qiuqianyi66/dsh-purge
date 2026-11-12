// F16/F21 面板侧数据整形：把多份诊断报告整理成面板可直接渲染的结构。
//
// 约束：纯函数、无 IO、不做任何动作决策；不可逆建议仍由 selfcheck-advice 标记，
// 前端只负责展示与把「安全动作」做成按钮，不在这里发明新动作。
import { advicePayload } from "./selfcheck-advice.js";

/** 从一条补丁条目的 carriers 里抽出带 diff 的逐处差异（F21 逐处展开用）。 */
export function extractDiffRows(entry) {
  const rows = [];
  for (const carrier of entry?.carriers || []) {
    const diff = carrier.diff;
    if (!diff || !Array.isArray(diff.hunks) || !diff.hunks.length) continue;
    rows.push({
      id: entry.id,
      name: entry.name,
      key: carrier.key,
      fp: carrier.fp,
      startLine: diff.startLine,
      hunksTotal: diff.hunksTotal,
      truncated: Boolean(diff.truncated),
      hunks: diff.hunks.map((h) => ({
        startLine: h.startLine,
        removed: h.removed,
        added: h.added,
        removedCount: h.removedCount,
        addedCount: h.addedCount,
      })),
    });
  }
  return rows;
}

const CATEGORIES = [
  "drifted",
  "dead_target",
  "carrier_missing",
  "optional_missing",
  "applied_by_marker",
  "clean",
];

/**
 * F15：把诊断按语义归并成五桶，面板与 CLI 读同一份口径。
 * - needs_action：真要动手的（漂移 / 目标消失 / 载体缺失），不进「已清洗」分母
 * - retired：上游换面后退役的补丁，已退出分母
 * - optional：本机没装对应组件（可选补丁 + 本表面不适用），属正常跳过
 * - no_carrier：没有载体字段的补丁，按状态标记计数（与 CLI 分母的口径来源）
 * - clean：载体原文/标记已确认
 * denominator = clean + no_carrier，与 `--status` 的「补丁 N/M」同源，便于对账。
 */
export function buildPatchGroups(report) {
  const ids = (key) => (report?.[key] || []).map((e) => e.id);
  const count = (keys) => keys.reduce((n, k) => n + (Array.isArray(report?.[k]) ? report[k].length : 0), 0);
  const needsBy = {
    drifted: count(["drifted"]),
    dead_target: count(["dead_target"]),
    carrier_missing: count(["carrier_missing"]),
  };
  const clean = count(["clean"]);
  const noCarrier = count(["no_carrier"]);
  return {
    needs_action: { count: needsBy.drifted + needsBy.dead_target + needsBy.carrier_missing, by: needsBy },
    retired: { count: count(["retired"]), ids: ids("retired") },
    optional: { count: count(["optional_missing", "skipped_surface"]), ids: ids("optional_missing") },
    no_carrier: { count: noCarrier },
    clean: { count: clean },
    denominator: clean + noCarrier,
  };
}

/**
 * 把 diagnose 报告列表翻译成面板负载：
 * - advice：每份报告的结构化建议（含 irreversible 标记）
 * - diff_rows：所有带 hunks 的逐处差异，按补丁 id 排序
 * - patch_groups：F15 五桶归并（需处理 / 已退役 / 可选 / 无载体字段 / 已清洗）
 * - 计数：问题条目总数与需要动作的条目数
 */
export function buildPanelSelfcheck(reports = []) {
  const groups = [];
  const allDiffRows = [];
  let actionNeeded = 0;
  for (const report of reports) {
    const advice = advicePayload(report);
    const diffRows = [];
    for (const cat of CATEGORIES) {
      for (const entry of report?.[cat] || []) {
        diffRows.push(...extractDiffRows(entry));
      }
    }
    diffRows.sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));
    allDiffRows.push(...diffRows);
    actionNeeded += advice.advice_items
      .filter((i) => i.needsAction)
      .reduce((n, i) => n + i.count, 0);
    groups.push({
      aiBase: report.aiBase || "",
      carriers_total: report.carriers_total || 0,
      advice_items: advice.advice_items,
      advice_summary: advice.advice_summary,
      patch_groups: buildPatchGroups(report),
      diff_rows: diffRows,
    });
  }
  allDiffRows.sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));
  return {
    groups,
    diff_rows: allDiffRows,
    action_needed: actionNeeded,
    total_reports: reports.length,
  };
}

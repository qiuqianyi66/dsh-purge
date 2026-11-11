// F16：自检建议化。每条问题都要带「下一步能做什么」，而不是只回显状态。
//
// 约束：这里只给建议与命令文案，不自动执行任何动作；涉及不可逆步骤的条目
// 显式标 irreversible，由用户自己确认后再敲命令。
//
// needsAction 决定这条进不进「需要处理」计数：只要建议文案本身要求用户动手
// （重写/退役、重应用、装载体、刷新备份）就是 true；只是「想确认可以顺手跑一次」
// 或「本机正常跳过」的，一律 false，别把汇总数字吹大。
import path from "node:path";

export const ADVICE_CATALOG = Object.freeze({
  drifted: {
    zh: "宿主改过这些位置的原文：先看诊断给的官方新文案，能对上的在面板里重应用；对不上就先别动，改 pattern 前先备份。",
    en: "Upstream rewrote these spots: re-apply what still lines up; if it does not, stop and back up before touching the pattern.",
    commands: ["dsh-purge --diagnose", "dsh-purge --apply"],
    irreversible: false,
    needsAction: true,
  },
  dead_target: {
    zh: "这些补丁在当前离线版本里已经没目标了：不要按“漂移”去追旧 pattern，只能按新文案重写这条补丁或标成退役。",
    en: "These patches have no target left in this host build: do not chase the old pattern; rewrite the patch for the new text or retire it.",
    commands: [],
    irreversible: true,
    needsAction: true,
  },
  carrier_missing: {
    zh: "非可选补丁找不到载体：先确认对应包/预设是否装了；没装就先装，不打算装的把它标成 optional。",
    en: "A required carrier is missing: confirm the package/preset is installed, or mark the patch optional if you never intend to install it.",
    commands: ["dsh-purge --status"],
    irreversible: false,
    needsAction: true,
  },
  optional_missing: {
    zh: "这些是可选补丁、本机没有对应组件，属于正常跳过，不用处理。",
    en: "Optional patches whose components are absent on this machine; skipping is expected, nothing to do.",
    commands: [],
    irreversible: false,
    needsAction: false,
  },
  stale_backup: {
    zh: "备份是旧宿主留下的：先重新 apply 刷新备份，再考虑还原；急着还原只能显式加 --force。",
    en: "The backup belongs to an older host build: re-apply to refresh it first; reverting anyway requires an explicit --force.",
    commands: ["dsh-purge --apply"],
    irreversible: true,
    needsAction: true,
  },
  applied_by_marker: {
    zh: "这些只靠宿主原生文本的 markers 判定“已生效”，没有 bak 差异证据；想确认就跑一次 apply 让备份补上。",
    en: "These are only marked applied via markers present in host text, with no backup diff as evidence; run apply once to get real backup evidence.",
    commands: ["dsh-purge --apply"],
    irreversible: false,
    needsAction: false,
  },
  clean: {
    zh: "无需动作。",
    en: "Nothing to do.",
    commands: [],
    irreversible: false,
    needsAction: false,
  },
});

const ORDER = ["drifted", "dead_target", "carrier_missing", "stale_backup", "applied_by_marker", "optional_missing"];

function idsOf(list = [], max = 6) {
  const ids = list.map((p) => p && p.id).filter((x) => x !== undefined && x !== null);
  return ids.slice(0, max);
}

/**
 * 把一份诊断报告翻译成建议清单（按处置优先级排序）。
 * @param {object} report probeReport 的结果（含 drifted / dead_target / carrier_missing / optional_missing / applied_by_marker）
 */
export function buildSelfcheckAdvice(report = {}) {
  const items = [];
  for (const code of ORDER) {
    const list = code === "applied_by_marker" ? report.applied_by_marker || [] : report[code] || [];
    if (!list.length) continue;
    const advice = ADVICE_CATALOG[code];
    items.push({
      code,
      count: list.length,
      ids: idsOf(list),
      zh: advice.zh,
      en: advice.en,
      commands: [...advice.commands],
      irreversible: advice.irreversible,
      needsAction: advice.needsAction,
    });
  }
  const blocked = items.filter((i) => i.needsAction);
  const summary = blocked.length
    ? { zh: `有 ${blocked.reduce((a, b) => a + b.count, 0)} 条需要处理（${blocked.map((i) => `${i.code} × ${i.count}`).join("、")}），其余可忽略。`, en: `${blocked.reduce((a, b) => a + b.count, 0)} item(s) need action (${blocked.map((i) => `${i.code} × ${i.count}`).join(", ")}); the rest can be ignored.` }
    : { zh: "没有需要处理的问题。", en: "Nothing needs action." };
  return { items, summary, aiBase: report.aiBase ? path.normalize(report.aiBase) : "" };
}

/** CLI 用：把建议清单渲染成带命令的双语行。 */
export function renderAdviceLines(advice) {
  const items = (advice && advice.items) || [];
  if (!items.length) return [];
  const L = ["", "下一步 / Next steps（只给建议，未自动执行）:"];
  for (const it of items) {
    const tag = it.irreversible ? "（不可逆，需你确认 / irreversible）" : "";
    L.push(`  · ${it.code} × ${it.count}${it.ids.length ? `（#${it.ids.join("/")}${it.count > it.ids.length ? " …" : ""}）` : ""}${tag}`);
    L.push(`    ${it.zh}`);
    L.push(`    ${it.en}`);
    for (const cmd of it.commands) L.push(`    $ ${cmd}`);
  }
  L.push(`  合计 / Summary：${advice.summary.zh} / ${advice.summary.en}`);
  return L;
}

/** 面板用：只取结构化数据，不给前端拼命令。 */
export function advicePayload(report = {}) {
  const advice = buildSelfcheckAdvice(report);
  return {
    advice_items: advice.items,
    advice_summary: advice.summary,
  };
}

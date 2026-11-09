/**
 * F8 预设排除（excludePresets）。
 *
 * 语义：名单内的预设不注入 Purge 提示词，但面板、命令、工具、补丁链保持不变。
 * 排除只作用于提示词注入层，不动 C1 补丁命中与幂等。
 *
 * 匹配：预设 id / 名称归一化（小写、去首尾空白、去掉目录前缀与 preset- 前缀）后，
 * 与名单逐项比对；名单项同样归一化。支持通配 `*` 结尾（如 `sdk-*`）。
 */
import fs from "node:fs";
import path from "node:path";

const SETTINGS_FILE = "exclude-presets.json";

/** 归一化单个预设标识：去目录前缀、去 preset- 前缀、小写。 */
export function normalizePresetId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const last = raw.split("/").pop() || raw;
  return last.replace(/^preset-/, "").trim();
}

/** 名单项归一化：保留尾部 `*` 通配。 */
function normalizeRule(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const wildcard = raw.endsWith("*");
  const base = wildcard ? raw.slice(0, -1) : raw;
  const last = base.split("/").pop() || base;
  const norm = last.replace(/^preset-/, "").trim();
  return wildcard ? `${norm}*` : norm;
}

/** 单个预设是否命中排除规则。 */
export function presetMatchesRule(presetId, rule) {
  const id = normalizePresetId(presetId);
  const r = normalizeRule(rule);
  if (!id || !r) return false;
  if (r.endsWith("*")) return id.startsWith(r.slice(0, -1));
  return id === r;
}

/** 预设是否在排除名单内。 */
export function isPresetExcluded(presetId, list) {
  const rules = Array.isArray(list) ? list : [];
  return rules.some((rule) => presetMatchesRule(presetId, rule));
}

export function excludePresetsSettingsPath(dshHome) {
  return path.join(dshHome, "dsh-purge", SETTINGS_FILE);
}

function readFileList(dshHome) {
  try {
    const fp = excludePresetsSettingsPath(dshHome);
    if (!fs.existsSync(fp)) return [];
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
    const raw = Array.isArray(parsed?.excludePresets) ? parsed.excludePresets : [];
    return raw.filter((item) => typeof item === "string" && item.trim());
  } catch {
    return [];
  }
}

/**
 * 读取排除名单。文件优先，配置值（宿主 config）作为补充合并去重。
 * @returns {{ excludePresets: string[] }}
 */
export function loadExcludePresets(dshHome, configValue) {
  const file = readFileList(dshHome);
  const cfg = Array.isArray(configValue) ? configValue.filter((v) => typeof v === "string" && v.trim()) : [];
  const merged = [...file, ...cfg];
  const seen = new Set();
  const out = [];
  for (const item of merged) {
    const norm = normalizeRule(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(item.trim());
    }
  }
  return { excludePresets: out };
}

function atomicWriteFileSync(fp, content, encoding = "utf8") {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, content, encoding);
    try { fs.fsyncSync(fd); } catch { /* FS 不支持 fsync 时忽略 */ }
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, fp);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/** 写回名单（整体替换文件里的 excludePresets）。 */
export function saveExcludePresets(dshHome, patch) {
  const fp = excludePresetsSettingsPath(dshHome);
  const list = Array.isArray(patch?.excludePresets)
    ? patch.excludePresets.filter((v) => typeof v === "string" && v.trim())
    : [];
  const normalized = list.map((v) => v.trim());
  atomicWriteFileSync(fp, `${JSON.stringify({ excludePresets: normalized }, null, 2)}\n`);
  return { ok: true, excludePresets: normalized, path: fp };
}

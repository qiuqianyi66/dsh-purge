// N5 备份新鲜度守卫：宿主升级后旁边的 .dshpurge.bak 是旧版原文，
// 直接还原等于用旧代码覆盖新宿主。这里记录打补丁时的宿主版本，还原前比对。
import fs from "node:fs";
import path from "node:path";

export function bakStampPath(dshHome) {
  return path.join(String(dshHome || ""), "dsh-purge", "bak-host.json");
}

export function readBakStamp(dshHome) {
  try {
    const raw = JSON.parse(fs.readFileSync(bakStampPath(dshHome), "utf8"));
    return {
      hostVersion: String(raw.host_version || ""),
      pluginVersion: String(raw.plugin_version || ""),
      aiBase: String(raw.ai_base || ""),
      at: String(raw.at || ""),
    };
  } catch {
    return null;
  }
}

export function writeBakStamp({ dshHome, hostVersion, aiBase = "", pluginVersion = "", at = new Date().toISOString() }) {
  try {
    const fp = bakStampPath(dshHome);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(
      fp,
      JSON.stringify({ host_version: String(hostVersion || ""), plugin_version: String(pluginVersion || ""), ai_base: String(aiBase || ""), at }, null, 2) + "\n",
      "utf8",
    );
    return true;
  } catch {
    return false;
  }
}

/** 版本字符串是否算"宿主换过"。任一侧读不到就不判 stale（不谎报）。 */
export function hostStampIsStale(hostVersion, currentHost) {
  const a = String(hostVersion || "").trim();
  const b = String(currentHost || "").trim();
  if (!a || !b) return false;
  return a !== b;
}

export function staleRestoreMessage(stamp, currentHost) {
  return [
    `⚠ 宿主版本已变：打补丁时 ${stamp?.hostVersion || "?"} → 现在 ${currentHost || "?"}`,
    "  旁边的 .dshpurge.bak 是旧版原文，直接还原会把旧片段盖到新宿主上（可能起不来）。",
    "  正确做法：先 --apply 重打（用当前宿主重新生成 bak），再考虑还原；",
    "  确认要硬还原请加 --force。",
  ].join("\n");
}

/**
 * 还原前守卫。force=true 时放行；没有戳（老安装）也放行，但不谎报"安全"。
 */
export function revertGuard({ dshHome, currentHost = null, force = false } = {}) {
  const stamp = readBakStamp(dshHome);
  const cur = String(currentHost || "");
  if (force) return { blocked: false, forced: true, stamp, currentHost: cur };
  if (!stamp || !stamp.hostVersion) return { blocked: false, unknown: true, stamp, currentHost: cur };
  if (!hostStampIsStale(stamp.hostVersion, cur)) return { blocked: false, stamp, currentHost: cur };
  return { blocked: true, stamp, currentHost: cur, message: staleRestoreMessage(stamp, cur) };
}

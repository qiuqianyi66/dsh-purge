import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import * as core from "./core.js";
import * as hostctl from "./host.js";
import * as rules from "./rules.js";
import * as updater from "./update.js";
import { clearDrillGrant } from "./drill-grant.js";
import { clearOwnedSelectedDefault, removeStaleAgentPresetDir } from "./preset-default.js";
import * as restoreGuard from "./restore-guard.js";
import { removeProfileBodyInsert } from "./profile-insert.js";

export function wasApplied(state) {
  if (!state) return false;
  if (state.has_backup) return true;
  if (Number(state.patches_applied) > 0) return true;
  return [state.shim_cmd, state.shim_ps1, state.shim_bin].includes("patched");
}

export function shouldDeletePluginTree(dir, dshHome = core.findDshHome()) {
  if (!dir) return false;
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch {
    real = path.resolve(dir);
  }
  const n = real.replace(/[/\\]+/g, "/").toLowerCase();
  if (n.includes("/node_modules/dsh-purge")) return true;
  let home;
  try {
    home = fs.realpathSync(dshHome);
  } catch {
    home = path.resolve(dshHome);
  }
  const homeN = home.replace(/[/\\]+/g, "/").toLowerCase();
  return n.startsWith(`${homeN}/profiles/`);
}

function isPurgeBundleItem(item) {
  if (typeof item === "string") return item === "dsh-purge" || item.startsWith("dsh-purge@");
  const id = item && (item.id || item.name);
  return id === "dsh-purge";
}

function stripBundleList(list) {
  if (!Array.isArray(list)) return { list, changed: false };
  const next = list.filter((item) => !isPurgeBundleItem(item));
  return { list: next, changed: next.length !== list.length };
}

export function stripPluginFromPackage(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  let changed = false;
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (pkg[key] && Object.prototype.hasOwnProperty.call(pkg[key], "dsh-purge")) {
      delete pkg[key]["dsh-purge"];
      changed = true;
    }
  }
  for (const key of ["bundles", "plugins"]) {
    const top = stripBundleList(pkg[key]);
    if (top.changed) {
      pkg[key] = top.list;
      changed = true;
    }
    const nested = pkg.dsh && pkg.dsh.profile ? pkg.dsh.profile[key] : null;
    const nest = stripBundleList(nested);
    if (nest.changed) {
      pkg.dsh.profile[key] = nest.list;
      changed = true;
    }
  }
  return changed;
}

function readJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(fp, value) {
  fs.writeFileSync(fp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pkgMentionsPurge(pkg) {
  if (!pkg) return false;
  if (pkg.dependencies?.["dsh-purge"] || pkg.devDependencies?.["dsh-purge"]) return true;
  for (const key of ["bundles", "plugins"]) {
    if (Array.isArray(pkg[key]) && pkg[key].some(isPurgeBundleItem)) return true;
    const nested = pkg.dsh && pkg.dsh.profile ? pkg.dsh.profile[key] : null;
    if (Array.isArray(nested) && nested.some(isPurgeBundleItem)) return true;
  }
  return false;
}

export function listInstalledProfiles(dshHome = core.findDshHome()) {
  const root = path.join(dshHome, "profiles");
  if (!fs.existsSync(root)) return [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const dir = path.join(root, name);
    const pkgPath = path.join(dir, "package.json");
    const pkg = readJson(pkgPath);
    const nm = path.join(dir, "node_modules", "dsh-purge");
    if (!pkgMentionsPurge(pkg) && !fs.existsSync(nm)) continue;
    const spec = pkg?.dependencies?.["dsh-purge"] || pkg?.devDependencies?.["dsh-purge"] || "";
    out.push({ name, dir, spec: String(spec || ""), pkgPath, hasModule: fs.existsSync(nm) });
  }
  return out;
}

async function unlinkIfExists(fp) {
  try {
    await fsp.unlink(fp);
    return true;
  } catch (e) {
    if (e && e.code === "ENOENT") return false;
    throw e;
  }
}

async function rmIfExists(fp) {
  try {
    await fsp.rm(fp, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function removeOverride(dshHome) {
  const fp = core.findOverrideFile(dshHome);
  const ok = await unlinkIfExists(fp);
  return { path: fp, removed: ok };
}

async function resetRules(dshHome) {
  const reset = await rules.resetToOriginal(dshHome);
  const dir = rules.rulesDir(dshHome);
  const removedDir = await rmIfExists(dir);
  return { ...reset, rules_dir: dir, rules_dir_removed: removedDir };
}

/** 安装器会生成的固定产物目录名（不含用户手工改名留档的备份）。 */
const INSTALLER_ARTIFACT_DIRS = [".dsh-purge-install-backup"];
/** 安装中途被杀留下的 staging 目录：`.dsh-purge-vendor.tmp-<pid>`。 */
const VENDOR_STAGING_RE = /^\.dsh-purge-vendor\.tmp-\d+$/;

function collectCleanupDirs(profiles, dshHome) {
  const seen = new Set();
  const cleanup = [];
  const remember = (dir) => {
    if (!dir) return;
    let real;
    try {
      real = fs.realpathSync(dir);
    } catch {
      real = path.resolve(dir);
    }
    const key = real.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleanup.push(real);
  };
  // 只登记真实存在的路径：清单要能直接展示给用户，不能混进一堆不存在的目录。
  const rememberExisting = (dir) => {
    if (!dir) return;
    try {
      if (fs.existsSync(dir)) remember(dir);
    } catch {
      /* 探测失败就当没有 */
    }
  };

  for (const p of profiles) {
    const nm = path.join(p.dir, "node_modules", "dsh-purge");
    if (fs.existsSync(nm)) {
      let real;
      try {
        real = fs.realpathSync(nm);
      } catch {
        real = path.resolve(nm);
      }
      if (shouldDeletePluginTree(real, dshHome)) remember(real);
      if (path.resolve(nm).toLowerCase() !== real.toLowerCase()) remember(nm);
    }

    // H1：vendor 本体与安装器固定产物。nm 是指向 vendor 的 link 时上面已覆盖，
    // 但 nm 缺失 / 被复制成实体目录时 vendor 会漏掉（真机 3.81MB 残留就是这么来的）。
    // 只认安装器生成的精确名字，用户手工留档的 `dsh-purge-vendor.<ver>.bak-*` 不在清单内。
    const vendor = path.join(p.dir, "dsh-purge-vendor");
    rememberExisting(vendor);
    rememberExisting(`${vendor}.previous`);
    for (const name of INSTALLER_ARTIFACT_DIRS) rememberExisting(path.join(p.dir, name));
    let entries = [];
    try {
      entries = fs.readdirSync(p.dir);
    } catch {
      entries = [];
    }
    for (const name of entries) {
      if (VENDOR_STAGING_RE.test(name)) rememberExisting(path.join(p.dir, name));
    }
  }

  const dataDir = path.join(dshHome, "dsh-purge");
  rememberExisting(dataDir);

  const root = updater.pluginRoot();
  if (shouldDeletePluginTree(root, dshHome)) remember(root);

  return cleanup;
}

function unregisterProfiles(profiles) {
  const stripped = [];
  const insertRemoved = [];
  const errors = [];
  for (const p of profiles) {
    try {
      const pkg = readJson(p.pkgPath) || {};
      if (stripPluginFromPackage(pkg)) {
        writeJson(p.pkgPath, pkg);
        stripped.push(p.name);
      }
      // G1：只删 package.json 会留下 `- insert: id: dsh-purge`，下次启动 loader
      // 指向已删除的包。这里把用户层 patch 里的本体行一并摘掉。
      const insert = removeProfileBodyInsert(p.dir);
      if (insert.wrote) insertRemoved.push(p.name);
    } catch (e) {
      errors.push({ profile: p.name, error: String(e && e.message ? e.message : e) });
    }
  }
  return { stripped, insertRemoved, errors };
}

export async function uninstallPurge(options = {}) {
  const onStage = typeof options.onStage === "function" ? options.onStage : () => {};
  onStage("locate");
  // F20：允许注入 state，让卸载整链能在临时 DSH_HOME 上做集成测试，
  // 不依赖也不触碰本机真实宿主（测试传入 ai_base 为空的状态）。
  const state = options.state || (await core.gatherState());
  const applied = wasApplied(state);
  const dshHome = state.dsh_home || core.findDshHome();
  const report = {
    ok: true,
    applied,
    reverted: false,
    needRestart: true,
    patches: null,
    shim: null,
    flash: null,
    override: null,
    rules: null,
    profiles: [],
    cleanup: [],
    errors: [],
  };

  try {
    onStage("revert");
    if (state.ai_base) {
      // N5：宿主换过版本时，老 bak 是旧版原文；还原等于用旧代码盖新宿主。
      // 卸载场景不阻断卸载，但跳过还原并明确告知：补丁留在宿主上，bak 也留着。
      const guard = restoreGuard.revertGuard({
        dshHome: core.findDshHome(),
        currentHost: core.readHostVersion(state.ai_base)?.version || "",
      });
      if (guard.blocked) {
        report.stale_backup = { patched_host: guard.stamp?.hostVersion || "", current_host: guard.currentHost || "" };
        report.errors.push(`revert skipped: stale backup（宿主 ${guard.stamp?.hostVersion} → ${guard.currentHost}），请先重新应用再卸载`);
      } else {
        report.patches = await core.revertAll(state.ai_base);
        if (applied) report.reverted = true;
      }
    }
  } catch (e) {
    report.errors.push(`revert patches: ${e.message || e}`);
  }
  if (applied && (report.patches?.errors?.length || report.errors.some((e) => /^revert patches:/.test(e)))) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    return report;
  }

  try {
    onStage("shim");
    report.shim = await core.revertAllShims();
    if (state.shim_cmd === "patched" || state.shim_ps1 === "patched" || state.shim_bin === "patched") {
      report.reverted = true;
    }
  } catch (e) {
    report.errors.push(`revert shims: ${e.message || e}`);
  }

  onStage("flash");
  try {
    report.flash = core.revertCmdFlash(state.ai_base, dshHome);
  } catch (e) {
    report.errors.push(`revert flash: ${e.message || e}`);
  }

  try {
    report.override = await removeOverride(dshHome);
  } catch (e) {
    report.errors.push(`remove override: ${e.message || e}`);
  }

  try {
    report.rules = await resetRules(dshHome);
  } catch (e) {
    report.errors.push(`reset rules: ${e.message || e}`);
  }

  try {
    const preset = clearOwnedSelectedDefault({ dshHome });
    report.presetDefault = { live: preset.live, files: preset.files };
    report.stalePresetDir = removeStaleAgentPresetDir(dshHome, "redteam");
  } catch (e) {
    report.errors.push(`clear selectedDefault: ${e.message || e}`);
  }

  const profiles = listInstalledProfiles(dshHome);
  report.profiles = profiles.map((p) => p.name);
  const unreg = unregisterProfiles(profiles);
  report.stripped = unreg.stripped;
  report.insert_removed = unreg.insertRemoved;
  report.errors.push(...unreg.errors.map((x) => `${x.profile}: ${x.error}`));
  if (unreg.errors.length) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.drillGrantCleared = false;
    return report;
  }

  try {
    report.drillGrantCleared = clearDrillGrant(dshHome);
  } catch (e) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.errors.push(`clear drill grant: ${e.message || e}`);
    return report;
  }

  onStage("cleanup");
  report.cleanup = collectCleanupDirs(profiles, dshHome);
  onStage("done");
  return report;
}

export function scheduleCleanupRestart(opts = {}) {
  hostctl.scheduleCleanupRestart(opts);
}

/**
 * H1：就地删除清理清单里的目录，返回删不掉的（通常是被运行中的宿主锁住）。
 * 只给「不能杀当前进程」的场合用（DSH 会话内跑 CLI、--no-restart）：
 * 能重启的场合要交给 scheduleCleanupRestart，让 helper 先退进程再删。
 */
export function removeCleanupDirs(cleanup = []) {
  const left = [];
  for (const dir of cleanup) {
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 });
    } catch {
      /* 占用中；下面统一复核 */
    }
    try {
      if (fs.existsSync(dir)) left.push(dir);
    } catch {
      // 探测失败既不能算删成功也不能算失败，保守登记为残留让用户看见。
      left.push(dir);
    }
  }
  return left;
}

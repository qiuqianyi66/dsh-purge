/**
 * G2/G3/G5：一条命令安装（install）。
 *
 * 目标：用户把仓库拉下来后，`node bin/dsh-purge.js --install`（或双击
 * install.cmd）即可把插件装进 DSH profile 并自动加载，不需要 pnpm、不需要
 * 手工改 package.json / cordis.patch.yml、不需要自己找 profile。
 *
 * 设计取舍：
 * - 复制到 `dsh-purge-vendor` 而不是走 pnpm：首次安装最容易被 pnpm 的
 *   allowBuilds 拦截（ERR_PNPM_IGNORED_BUILDS）；离线复制没有这个环节。
 * - 每个 profile 改动前先做 `.dsh-purge-install-backup/`；写文件走原子写。
 * - 任何一步失败就回滚到安装前状态，不留下半装。
 * - 安装器只注册插件，不自动点「应用」、不改宿主包。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as core from "./core.js";
import {
  ensureProfileBundles,
  ensureProfileBodyInsert,
  ensurePnpmAllowBuild,
  writeTextAtomic,
} from "./profile-insert.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(HERE, "..");
const PURGE = "dsh-purge";
const VENDOR = "dsh-purge-vendor";

const readJson = (fp) => {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
};

const isDir = (fp) => {
  try {
    return fs.statSync(fp).isDirectory();
  } catch {
    return false;
  }
};

const readText = (fp) => {
  try {
    return fs.readFileSync(fp, "utf8");
  } catch {
    return null;
  }
};

/** 常见安装失败翻译成人话（G16）。 */
export function humanizeInstallError(error) {
  const raw = String((error && (error.message || error)) || error || "unknown");
  const rules = [
    [/ERR_PNPM_IGNORED_BUILDS/i, "pnpm 拦下了安装脚本。改用 `node bin/dsh-purge.js --install`（不经过 pnpm），或在安装命令里加 `--allow-build=dsh-purge`。"],
    [/Error writing temporary file/i, "安全软件拦住了安装器写临时文件。改用 `--install` 的离线复制路径；必要时把 DSH 目录加入信任区。"],
    [/already queued/i, "插件市场里已存在同 id 的 dsh-purge 行。先在市场/设置里卸载旧行，再重装。"],
    [/EACCES|EPERM|权限|operation not permitted/i, "权限不足。不要把插件装进 Program Files；换到用户 profile，或用管理员终端。"],
    [/fetch failed|codeload|ENOTFOUND|ETIMEDOUT/i, "下载失败。用 `codeload.github.com` 的 tar.gz，或直接用仓库内的 `--install`（离线）。"],
    [/INSERT_UNRECOGNIZED/i, "这个 profile 的 cordis.patch.yml 不是普通块序列，安装器不敢写。文件原样保留，请按提示手工合并 insert 片段。"],
    [/NO_PROFILE_MULTI/i, "这台机器有多个 profile，安装器不替你猜。用 `--profile desktop` 或 `--profile web` 指定要装的那个。"],
    [/NO_PROFILE/i, "没有找到可安装的 DSH profile。先启动一次 DSH（它会生成 profile），再重试；如果 DSH 已在运行，检查 `--profile <name>` 是否拼对。"],
    [/ENOENT/i, "路径不存在。确认 DSH_HOME 与 profile 名（`--profile desktop/web`）。"],
  ];
  for (const [re, text] of rules) if (re.test(raw)) return `${text}（原始错误：${raw}）`;
  return raw;
}

/**
 * 定位 DSH_HOME：环境变量优先；否则用 core 的自动探测；再退回 ~/.dsh。
 * 返回带 source 的原因，安装报告里会原样展示，避免「装到没在跑的那份」。
 */
export function detectDshHome(options = {}) {
  const env = options.env || process.env;
  const fromEnv = String(env.DSH_HOME || "").trim();
  if (fromEnv) return { home: path.normalize(fromEnv), source: "DSH_HOME 环境变量" };
  let auto = "";
  try {
    auto = core.findDshHome({ env });
  } catch {
    /* 探测失败退回 ~/.dsh */
  }
  const fallback = path.join(os.homedir(), ".dsh");
  const picked = [auto, fallback].filter(Boolean).find((dir) => isDir(path.join(dir, "profiles"))) || auto || fallback;
  return { home: path.normalize(picked), source: auto && picked === auto ? "自动探测（注册表 / 启动器 / 用户目录）" : "用户目录 ~/.dsh" };
}

/** 列出 profile（只认带 dsh.profile.bundles 的目录）。 */
export function listProfiles(dshHome) {
  const root = path.join(dshHome, "profiles");
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return out;
  }
  for (const name of names) {
    const dir = path.join(root, name);
    if (!isDir(dir)) continue;
    const pkg = readJson(path.join(dir, "package.json"));
    const isProfile = pkg && (Array.isArray(pkg.dsh?.profile?.bundles) || String(pkg.name || "").startsWith("dsh-profile-"));
    if (isProfile) out.push({ name, dir, pkg });
  }
  return out;
}

/** 按 package.json 的 files 白名单取实际要发布的文件（与 pack-check 同源）。 */
export function packageFileList(root = SOURCE_ROOT) {
  const pkg = readJson(path.join(root, "package.json"));
  const specs = Array.isArray(pkg?.files) ? pkg.files : [];
  const includes = specs.filter((s) => !String(s).startsWith("!")).map(String);
  const excludes = specs.filter((s) => String(s).startsWith("!")).map((s) => String(s).slice(1));
  const rels = new Set();
  const excluded = (rel) => excludes.some((ex) => rel === ex || rel.startsWith(`${ex}/`));
  const walk = (abs, relBase) => {
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      const rel = relBase.replace(/\\/g, "/");
      if (!excluded(rel)) rels.add(rel);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(abs)) {
      if (name === "node_modules" || name === ".git" || name === ".tmp") continue;
      walk(path.join(abs, name), relBase ? `${relBase}/${name}` : name);
    }
  };
  for (const spec of includes) {
    const abs = path.join(root, spec);
    if (!fs.existsSync(abs)) continue;
    walk(abs, spec);
  }
  rels.add("package.json");
  return [...rels].sort();
}

function copyPackage(sourceRoot, destDir) {
  const files = packageFileList(sourceRoot);
  fs.mkdirSync(destDir, { recursive: true });
  for (const rel of files) {
    const src = path.join(sourceRoot, rel);
    const dst = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  return files.length;
}

function linkOrCopy(vendor, nm) {
  fs.mkdirSync(path.dirname(nm), { recursive: true });
  let previous = null;
  if (fs.existsSync(nm) || isLink(nm)) {
    previous = `${nm}.dsh-purge-previous`;
    rmrf(previous);
    fs.renameSync(nm, previous);
  }
  try {
    fs.symlinkSync(vendor, nm, process.platform === "win32" ? "junction" : "dir");
    return { kind: "link", previous };
  } catch {
    // Windows 无权限建 junction 时退回实体复制：慢一点，但一定能加载。
    copyPackage(vendor, nm);
    return { kind: "copy", previous };
  }
}

function isLink(fp) {
  try {
    return fs.lstatSync(fp).isSymbolicLink();
  } catch {
    return false;
  }
}

function rmrf(fp) {
  try {
    fs.rmSync(fp, { recursive: true, force: true });
  } catch {
    /* 尽力清理 */
  }
}

function restoreText(fp, before) {
  if (before === null || before === undefined) {
    try { fs.unlinkSync(fp); } catch { /* already gone */ }
    return;
  }
  writeTextAtomic(fp, before, { backup: false });
}

function backupProfile(profileDir) {
  const dir = path.join(profileDir, ".dsh-purge-install-backup");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ["package.json", "cordis.patch.yml", "pnpm-workspace.yaml"]) {
    const src = path.join(profileDir, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(dir, name));
  }
  return dir;
}

/**
 * 装一个 profile。
 * 返回 { ok, error?, verified, actions, backup, version }。
 */
export function installProfile(options) {
  const profileDir = options.profileDir;
  const sourceRoot = options.sourceRoot || SOURCE_ROOT;
  const dryRun = Boolean(options.dryRun);
  const version = readJson(path.join(sourceRoot, "package.json"))?.version || "";
  const pkgPath = path.join(profileDir, "package.json");
  const patchPath = path.join(profileDir, "cordis.patch.yml");
  const workspacePath = path.join(profileDir, "pnpm-workspace.yaml");
  const vendor = path.join(profileDir, VENDOR);
  const nm = path.join(profileDir, "node_modules", PURGE);
  const before = { pkg: readText(pkgPath), patch: readText(patchPath), workspace: readText(workspacePath) };
  const actions = { vendor: "skip", dependency: "skip", bundles: "skip", insert: "skip", allowBuilds: "skip", link: "skip" };
  let staging = "";
  let vendorPrevious = "";
  let nmPrevious = null;
  let backupDir = "";

  try {
    if (!before.pkg) throw new Error(`NO_PROFILE: ${pkgPath}`);
    const expectedFiles = packageFileList(sourceRoot).length;
    // 幂等：已经装好且版本、文件清单一致就不碰任何文件。升级 / 缺文件时 verify 会失败，走正常安装。
    if (!dryRun) {
      const current = verifyProfile(profileDir, version, expectedFiles);
      if (current.ok) {
        return {
          ok: true,
          dryRun: false,
          changed: false,
          verified: current,
          actions: { vendor: "already", dependency: "already", bundles: "already", insert: "already", allowBuilds: "already", link: "already" },
          backup: "",
          version,
        };
      }
    }
    if (dryRun) {
      actions.vendor = `would-copy ${packageFileList(sourceRoot).length} files`;
      actions.dependency = "would-link";
      actions.bundles = "would-ensure";
      actions.insert = "would-ensure";
      actions.allowBuilds = "would-ensure";
      actions.link = "would-link";
      return { ok: true, dryRun: true, changed: false, verified: false, actions, backup: "", version };
    }

    backupDir = backupProfile(profileDir);

    // 1) 插件文件：先 staging 再换目录，失败可回退
    staging = path.join(profileDir, `.${VENDOR}.tmp-${process.pid}`);
    rmrf(staging);
    const copied = copyPackage(sourceRoot, staging);
    vendorPrevious = `${vendor}.previous`;
    rmrf(vendorPrevious);
    if (fs.existsSync(vendor)) fs.renameSync(vendor, vendorPrevious);
    fs.renameSync(staging, vendor);
    actions.vendor = `copied ${copied} files`;

    // 2) node_modules 指向 vendor；老目录留一份 previous，不直接删
    const link = linkOrCopy(vendor, nm);
    nmPrevious = link.previous;
    actions.link = link.kind;

    // 3) package.json 依赖：新装写 link；已有 URL/tarball 保留用户选择（决策 ②）
    const pkg = readJson(pkgPath);
    pkg.dependencies = pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {};
    const existing = pkg.dependencies[PURGE];
    if (!existing) {
      pkg.dependencies[PURGE] = `link:${VENDOR}`;
      actions.dependency = `added link:${VENDOR}`;
    } else {
      actions.dependency = `kept ${existing}`;
    }
    writeTextAtomic(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

    // 4) bundles + 5) 用户层 insert + 6) pnpm allowBuilds
    const bundles = ensureProfileBundles(profileDir);
    actions.bundles = bundles.wrote ? "added" : "already";
    const insert = ensureProfileBodyInsert(profileDir);
    if (!insert.ok) throw new Error(`INSERT_UNRECOGNIZED: ${patchPath}`);
    actions.insert = insert.wrote ? "added" : "already";
    const pnpm = ensurePnpmAllowBuild(profileDir);
    if (!pnpm.ok) throw new Error(`INSERT_UNRECOGNIZED: allowBuilds rewrite refused (${workspacePath})`);
    actions.allowBuilds = pnpm.wrote ? "added" : "already";

    // 7) 读回校验：4 项全过才算装好
    const verified = verifyProfile(profileDir, version, expectedFiles);
    if (!verified.ok) throw new Error(`VERIFY_FAILED: ${verified.failures.join("; ")}`);
    return { ok: true, dryRun: false, changed: true, verified, actions, backup: backupDir, version };
  } catch (error) {
    // 回滚：文本 → vendor → node_modules，顺序反过来
    try { restoreText(pkgPath, before.pkg); } catch { /* 回滚失败继续尝试其它项 */ }
    try { restoreText(patchPath, before.patch); } catch { /* 同上 */ }
    try { restoreText(workspacePath, before.workspace); } catch { /* 同上 */ }
    try { if (fs.existsSync(vendor)) rmrf(vendor); } catch { /* 同上 */ }
    try { if (vendorPrevious && fs.existsSync(vendorPrevious)) fs.renameSync(vendorPrevious, vendor); } catch { /* 同上 */ }
    try {
      if (isLink(nm) || fs.existsSync(nm)) rmrf(nm);
      if (nmPrevious && fs.existsSync(nmPrevious)) fs.renameSync(nmPrevious, nm);
    } catch { /* 同上 */ }
    try { if (staging) rmrf(staging); } catch { /* 同上 */ }
    return { ok: false, dryRun: false, changed: false, error: humanizeInstallError(error), actions, backup: backupDir, version };
  }
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(abs);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

/** 安装后校验：vendor 版本 / 文件数 / 依赖 / bundles / insert / node_modules 版本。 */
export function verifyProfile(profileDir, expectedVersion, expectedFileCount = 0) {
  const failures = [];
  const vendor = path.join(profileDir, VENDOR);
  const vendorPkg = readJson(path.join(vendor, "package.json"));
  if (!vendorPkg || vendorPkg.version !== expectedVersion) failures.push(`vendor 版本不是 ${expectedVersion}`);
  if (expectedFileCount && fs.existsSync(vendor)) {
    const actual = countFiles(vendor);
    if (actual !== expectedFileCount) failures.push(`vendor 文件数 ${actual}/${expectedFileCount}（缺文件或旧版残留）`);
  }
  const pkg = readJson(path.join(profileDir, "package.json"));
  if (!pkg?.dependencies?.[PURGE]) failures.push("package.json 缺 dsh-purge 依赖");
  if (!pkg?.dsh?.profile?.bundles?.includes(PURGE)) failures.push("dsh.profile.bundles 缺 dsh-purge");
  const patch = readText(path.join(profileDir, "cordis.patch.yml")) || "";
  if (!/^-\s*insert:\s*$/m.test(patch) || !/id:\s*dsh-purge/.test(patch)) failures.push("cordis.patch.yml 缺 insert");
  const nmPkg = readJson(path.join(profileDir, "node_modules", PURGE, "package.json"));
  if (!nmPkg || nmPkg.version !== expectedVersion) failures.push("node_modules/dsh-purge 版本不对");
  return { ok: failures.length === 0, failures, version: nmPkg?.version || "" };
}

/** G5：装完重启 DSH。DSH 内部会话里拒绝自杀，只提示手动重启。 */
export function restartDsh(options = {}) {
  if (process.env.DSH_SURFACE) {
    return { ok: false, reason: "inside-dsh", message: "当前命令跑在 DSH 会话内，不能自动重启。请手动完全退出 DSH 再打开。" };
  }
  if (process.platform !== "win32") {
    return { ok: false, reason: "manual", message: "请手动完全退出 DSH 再打开（本安装器暂只自动重启 Windows 桌面版）。" };
  }
  const ps = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$p = Get-Process 'DeepSeek Harness'
$exe = ($p | Where-Object { $_.Path } | Select-Object -First 1).Path
if (-not $exe) {
  $keys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
  $exe = Get-ItemProperty $keys | Where-Object { $_.DisplayName -like '*DeepSeek Harness*' } | ForEach-Object { $_.DisplayIcon -replace '",.*$','' -replace '"','' } | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if ($p) {
  $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }
  Start-Sleep -Seconds 6
  Get-Process 'DeepSeek Harness' | Stop-Process -Force
  Start-Sleep -Seconds 2
}
if ($exe) { Start-Process -FilePath $exe }
$exe
`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      encoding: "utf8",
      timeout: 60000,
      windowsHide: true,
    }).trim();
    const exe = out.split(/\r?\n/).filter(Boolean).pop() || "";
    if (!exe) return { ok: false, reason: "not-found", message: "没找到 DSH 桌面程序。请手动打开 DSH。" };
    // 等进程回来，超时只提示，不判失败
    const startedAt = Date.now();
    while (Date.now() - startedAt < (options.waitMs || 20000)) {
      try {
        const n = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8", timeout: 8000 }).trim();
        if (Number(n) > 0) return { ok: true, exe, processes: Number(n) };
      } catch { /* retry */ }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
    return { ok: false, reason: "not-started", message: `已执行重启，但 ${Math.round((options.waitMs || 20000) / 1000)} 秒内没等到 DSH 进程。请手动打开。` };
  } catch (error) {
    return { ok: false, reason: "restart-failed", message: `自动重启失败：${humanizeInstallError(error)}` };
  }
}

function dshDesktopRunning() {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
    return Number(out) > 0;
  } catch {
    return false;
  }
}

/** 默认只装「正在跑的那个」；拿不准就要求显式 --profile，绝不猜。 */
function chooseProfiles(all, requested) {
  if (!all.length) return { picked: [], error: "NO_PROFILE: profiles 目录为空（DSH 还没有创建 profile）" };
  if (requested?.length) {
    const picked = all.filter((p) => requested.includes(p.name));
    return { picked, error: picked.length ? "" : `NO_PROFILE: --profile ${requested.join(",")} 不存在` };
  }
  if (all.length === 1) return { picked: all, error: "" };
  if (all.some((p) => p.name === "desktop") && dshDesktopRunning()) {
    return { picked: all.filter((p) => p.name === "desktop"), error: "" };
  }
  return { picked: [], error: `NO_PROFILE_MULTI: ${all.map((p) => p.name).join(", ")}` };
}

/**
 * 一条命令安装入口。
 * options: {dshHome, profiles:[name], dryRun, restart, sourceRoot}
 */
export function installPurge(options = {}) {
  const sourceRoot = options.sourceRoot || SOURCE_ROOT;
  const version = readJson(path.join(sourceRoot, "package.json"))?.version || "";
  const detected = detectDshHome({ env: options.env });
  const dshHome = path.normalize(options.dshHome || detected.home);
  const all = listProfiles(dshHome);
  const chosen = chooseProfiles(all, options.profiles);
  if (!chosen.picked.length) {
    return {
      ok: false,
      error: humanizeInstallError(chosen.error || `NO_PROFILE: ${path.join(dshHome, "profiles")}`),
      dshHome,
      source: detected.source,
      version,
      profiles: [],
    };
  }
  const report = { ok: true, dryRun: Boolean(options.dryRun), dshHome, source: detected.source, version, profiles: [], restart: null };
  for (const p of chosen.picked) {
    const rec = installProfile({ profileDir: p.dir, sourceRoot, dryRun: options.dryRun });
    report.profiles.push({ name: p.name, dir: p.dir, ...rec });
    if (!rec.ok) report.ok = false;
  }
  const changed = report.profiles.some((p) => p.changed);
  if (report.ok && !report.dryRun && options.restart) {
    report.restart = changed
      ? restartDsh()
      : { ok: true, reason: "already", message: "已经是最新版本，本次没有改动，未重启 DSH。" };
  }
  return report;
}

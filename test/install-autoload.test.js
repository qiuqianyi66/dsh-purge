import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installPurge,
  verifyProfile,
  packageFileList,
  listProfiles,
  humanizeInstallError,
  findBootAfter,
} from "../lib/install.js";
import { selfcheckLogPath } from "../lib/selfcheck-log.js";
import {
  removeProfileBodyInsert,
  ensureProfileBodyInsert,
  INSERT_BLOCK,
} from "../lib/profile-insert.js";
import { uninstallPurge, removeCleanupDirs } from "../lib/uninstall.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-install-"));
}

function makeProfile(home, name = "desktop", patch = "# user patch\n- id: ui-chat\n  config: {}\n") {
  const dir = path.join(home, "profiles", name);
  fs.mkdirSync(dir, { recursive: true });
  const pkg = {
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
  };
  fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dir, "cordis.patch.yml"), patch, "utf8");
  return dir;
}

const read = (fp) => fs.readFileSync(fp, "utf8");
const sha = (fp) => fs.existsSync(fp) ? fs.statSync(fp).size + ":" + read(fp).length : "missing";

function install(home, extra = {}) {
  return installPurge({ dshHome: home, profiles: ["desktop"], restart: false, sourceRoot: ROOT, ...extra });
}

test("全新 profile：一条命令装好，4 项回读校验全过", () => {
  const home = makeHome();
  const dir = makeProfile(home);
  const report = install(home);
  assert.equal(report.ok, true, JSON.stringify(report));
  const p = report.profiles[0];
  assert.equal(p.ok, true);
  assert.equal(p.verified.ok, true);
  assert.equal(p.version, VERSION);

  const vendor = JSON.parse(read(path.join(dir, "dsh-purge-vendor", "package.json")));
  assert.equal(vendor.version, VERSION);
  const pkg = JSON.parse(read(path.join(dir, "package.json")));
  assert.equal(pkg.dependencies["dsh-purge"], "link:dsh-purge-vendor");
  assert.equal(pkg.dsh.profile.bundles.includes("dsh-purge"), true);
  const patch = read(path.join(dir, "cordis.patch.yml"));
  assert.match(patch, /id:\s*dsh-purge/);
  // 备份：安装前的 package.json / cordis.patch.yml 都在
  assert.equal(fs.existsSync(path.join(dir, ".dsh-purge-install-backup", "package.json")), true);
  assert.equal(fs.existsSync(path.join(dir, ".dsh-purge-install-backup", "cordis.patch.yml")), true);
  // node_modules 能读到同一版本
  const nm = JSON.parse(read(path.join(dir, "node_modules", "dsh-purge", "package.json")));
  assert.equal(nm.version, VERSION);
  fs.rmSync(home, { recursive: true, force: true });
});

test("重复安装幂等：第二次不碰任何文件", () => {
  const home = makeHome();
  const dir = makeProfile(home);
  const first = install(home);
  assert.equal(first.ok, true);
  assert.equal(first.profiles[0].changed, true);
  const files = ["package.json", "cordis.patch.yml", "dsh-purge-vendor/package.json"].map((rel) => path.join(dir, rel));
  const before = files.map((fp) => (fs.existsSync(fp) ? fs.statSync(fp).mtimeMs : 0));
  const second = install(home);
  assert.equal(second.ok, true);
  assert.equal(second.profiles[0].changed, false);
  assert.equal(second.profiles[0].actions.vendor, "already");
  const after = files.map((fp) => (fs.existsSync(fp) ? fs.statSync(fp).mtimeMs : 0));
  assert.deepEqual(after, before);
  fs.rmSync(home, { recursive: true, force: true });
});

test("vendor 缺文件：重装自动补回，不因版本相同而跳过", () => {
  const home = makeHome();
  const dir = makeProfile(home);
  assert.equal(install(home).ok, true);
  const victim = path.join(dir, "dsh-purge-vendor", "scripts", "find-dsh-node.ps1");
  assert.equal(fs.existsSync(victim), true);
  fs.rmSync(victim);
  const second = install(home);
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.match(second.profiles[0].actions.vendor, /copied/);
  assert.equal(fs.existsSync(victim), true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("--dry-run 不写盘", () => {
  const home = makeHome();
  const dir = makeProfile(home);
  const before = ["package.json", "cordis.patch.yml"].map((rel) => sha(path.join(dir, rel)));
  const report = install(home, { dryRun: true });
  assert.equal(report.ok, true);
  assert.equal(report.profiles[0].dryRun, true);
  assert.equal(fs.existsSync(path.join(dir, "dsh-purge-vendor")), false);
  const after = ["package.json", "cordis.patch.yml"].map((rel) => sha(path.join(dir, rel)));
  assert.deepEqual(after, before);
  fs.rmSync(home, { recursive: true, force: true });
});

test("未知 flow YAML：中止安装并回滚，原文件不动", () => {
  const home = makeHome();
  const dir = makeProfile(home, "desktop", "[a, b]\n");
  const beforePkg = sha(path.join(dir, "package.json"));
  const beforePatch = sha(path.join(dir, "cordis.patch.yml"));
  const report = install(home);
  assert.equal(report.ok, false);
  assert.match(report.profiles[0].error, /cordis\.patch\.yml/);
  assert.equal(sha(path.join(dir, "package.json")), beforePkg);
  assert.equal(sha(path.join(dir, "cordis.patch.yml")), beforePatch);
  assert.equal(fs.existsSync(path.join(dir, "dsh-purge-vendor")), false);
  fs.rmSync(home, { recursive: true, force: true });
});

test("已有 URL 依赖：保留用户选择，只补 vendor 与注册", () => {
  const home = makeHome();
  const dir = makeProfile(home);
  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(read(pkgPath));
  const url = "https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main";
  pkg.dependencies["dsh-purge"] = url;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  const report = install(home);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(JSON.parse(read(pkgPath)).dependencies["dsh-purge"], url);
  assert.equal(fs.existsSync(path.join(dir, "dsh-purge-vendor")), true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("卸载：package.json 与 patch 里 dsh-purge 引用归零（G1）", async () => {
  const home = makeHome();
  const dir = makeProfile(home);
  assert.equal(install(home).ok, true);
  const report = await uninstallPurge({
    state: { dsh_home: home, ai_base: "", has_backup: false, patches_applied: 0, shim_cmd: "", shim_ps1: "", shim_bin: "" },
  });
  assert.equal(report.stripped.includes("desktop"), true);
  assert.equal(report.insert_removed.includes("desktop"), true);
  const pkg = read(path.join(dir, "package.json"));
  const patch = read(path.join(dir, "cordis.patch.yml"));
  assert.equal(pkg.includes("dsh-purge"), false);
  assert.equal(patch.includes("dsh-purge"), false);
  assert.match(patch, /ui-chat/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("removeProfileBodyInsert 只删 purge 实体，保留同组其它实体", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-insert-"));
  const fp = path.join(dir, "cordis.patch.yml");
  const text = [
    "- insert:",
    "    - id: dsh-purge",
    "      name: dsh-purge",
    "    - id: other-plugin",
    "      name: other-plugin",
    "- id: ui-chat",
    "  config: {}",
    "",
  ].join("\n");
  fs.writeFileSync(fp, text, "utf8");
  const result = removeProfileBodyInsert(dir);
  assert.equal(result.ok, true);
  assert.equal(result.removed, 1);
  const next = read(fp);
  assert.equal(next.includes("dsh-purge"), false);
  assert.equal(next.includes("other-plugin"), true);
  assert.equal(next.includes("- insert:"), true);
  assert.equal(next.includes("ui-chat"), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ensure → remove → ensure 往返：patch 能恢复且幂等", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-insert-"));
  const fp = path.join(dir, "cordis.patch.yml");
  fs.writeFileSync(fp, "# c\n[]\n", "utf8");
  assert.equal(ensureProfileBodyInsert(dir).wrote, true);
  assert.equal(read(fp).includes("id: dsh-purge"), true);
  assert.equal(removeProfileBodyInsert(dir).removed, 1);
  assert.equal(read(fp).includes("dsh-purge"), false);
  assert.equal(ensureProfileBodyInsert(dir).wrote, true);
  assert.equal(read(fp).includes("id: dsh-purge"), true);
  const stable = read(fp);
  assert.equal(ensureProfileBodyInsert(dir).wrote, false);
  assert.equal(read(fp), stable);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("错误翻译覆盖常见安装拦路石", () => {
  assert.match(humanizeInstallError(new Error("ERR_PNPM_IGNORED_BUILDS")), /--install|allow-build/);
  assert.match(humanizeInstallError(new Error("Error writing temporary file")), /信任区|--install/);
  assert.match(humanizeInstallError(new Error("INSERT_UNRECOGNIZED")), /cordis\.patch\.yml/);
});

test("空 profiles 目录：报 NO_PROFILE，不误报 MULTI", () => {
  const home = makeHome();
  const report = installPurge({ dshHome: home, profiles: [], restart: false, sourceRoot: ROOT });
  assert.equal(report.ok, false);
  // H3 把文案从「没有找到可安装的 DSH profile」改成「先启动一次 DSH」：
  // 断言目标随需求变更，行为断言（ok=false / 不误报 MULTI）不变。
  assert.match(report.error, /先启动一次 DSH/);
  assert.doesNotMatch(report.error, /多个 profile/);
  assert.match(humanizeInstallError(new Error("NO_PROFILE_MULTI: desktop, web")), /多个 profile/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("profile 发现与发布清单只含白名单文件", () => {
  const home = makeHome();
  makeProfile(home, "desktop");
  makeProfile(home, "web");
  assert.deepEqual(listProfiles(home).map((p) => p.name).sort(), ["desktop", "web"]);
  const files = packageFileList(ROOT);
  assert.equal(files.includes("lib/install.js"), true);
  assert.equal(files.includes("install.cmd"), true);
  assert.equal(files.includes("docs/plans/开箱即用与人性化路线-20261121.md"), false);
  assert.equal(files.some((rel) => rel.startsWith("test/")), false);
  fs.rmSync(home, { recursive: true, force: true });
});

// ── H1：--uninstall 要真的把插件目录清干净，且只清安装器自己的产物 ──

function uninstallState(home) {
  return { state: { dsh_home: home, ai_base: "", has_backup: false, patches_applied: 0, shim_cmd: "", shim_ps1: "", shim_bin: "" } };
}

test("H1 卸载 cleanup 覆盖 vendor/previous/安装器备份/staging，执行后全部消失", async () => {
  const home = makeHome();
  const dir = makeProfile(home);
  assert.equal(install(home).ok, true);

  // 安装器会留下的三个固定产物（真机残留就是它们）
  const previous = path.join(dir, "dsh-purge-vendor.previous");
  fs.mkdirSync(previous, { recursive: true });
  fs.writeFileSync(path.join(previous, "package.json"), "{}\n", "utf8");
  const staging = path.join(dir, ".dsh-purge-vendor.tmp-4242");
  fs.mkdirSync(staging, { recursive: true });
  // 数据目录
  const dataDir = path.join(home, "dsh-purge");
  fs.mkdirSync(dataDir, { recursive: true });
  // 用户手工留档：名字不在安装器清单里，必须原地保留
  const userKeep = path.join(dir, "dsh-purge-vendor.1.2.10.bak-20261121");
  fs.mkdirSync(userKeep, { recursive: true });
  fs.writeFileSync(path.join(userKeep, "package.json"), "{}\n", "utf8");

  const report = await uninstallPurge(uninstallState(home));
  assert.equal(report.ok, true, JSON.stringify(report.errors));

  const cleanup = report.cleanup.map((p) => p.toLowerCase());
  const has = (fp) => cleanup.includes(fs.realpathSync(fp).toLowerCase());
  assert.equal(has(path.join(dir, "dsh-purge-vendor")), true, "vendor 本体必须进清单");
  assert.equal(has(previous), true, "vendor.previous 必须进清单");
  assert.equal(has(staging), true, "staging 残留必须进清单");
  assert.equal(has(path.join(dir, ".dsh-purge-install-backup")), true, "安装器备份必须进清单");
  assert.equal(has(dataDir), true, "数据目录必须进清单");
  assert.equal(has(userKeep), false, "用户手工备份不能被清");

  const left = removeCleanupDirs(report.cleanup);
  assert.deepEqual(left, [], "清理后不应有残留");
  assert.equal(fs.existsSync(path.join(dir, "dsh-purge-vendor")), false);
  assert.equal(fs.existsSync(previous), false);
  assert.equal(fs.existsSync(staging), false);
  assert.equal(fs.existsSync(path.join(dir, ".dsh-purge-install-backup")), false);
  assert.equal(fs.existsSync(dataDir), false);
  // 不误删：profile 本体文件与用户留档都还在
  assert.equal(fs.existsSync(userKeep), true);
  assert.equal(fs.existsSync(path.join(dir, "package.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "cordis.patch.yml")), true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("H1 清理清单只登记真实存在的目录，重复运行不留假路径", async () => {
  const home = makeHome();
  makeProfile(home);
  assert.equal(install(home).ok, true);
  const first = await uninstallPurge(uninstallState(home));
  removeCleanupDirs(first.cleanup);
  const second = await uninstallPurge(uninstallState(home));
  assert.equal(second.ok, true);
  for (const fp of second.cleanup) {
    assert.equal(fs.existsSync(fp), true, `已删除的路径不该再次进清单: ${fp}`);
  }
  fs.rmSync(home, { recursive: true, force: true });
});

// ── H2：装完要确认插件真的加载了，不能只看进程数 ──

function writeBootLog(home, lines) {
  const fp = selfcheckLogPath(home);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, lines.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  return fp;
}

test("H2 只认本次重启之后的 boot 记录，旧记录不算加载成功", () => {
  const home = makeHome();
  const old = { ts: "2026-01-01T00:00:00.000Z", action: "boot", plugin: "dsh-purge", outcome: "ok" };
  const fresh = { ts: new Date(Date.now() + 5000).toISOString(), action: "boot", plugin: "dsh-purge", outcome: "loaded" };
  writeBootLog(home, [old, fresh]);

  const sinceMs = Date.now();
  const hit = findBootAfter({ dshHome: home, sinceMs });
  assert.equal(hit?.outcome, "loaded", "应命中晚于 sinceMs 的那条");
  assert.equal(hit?.ts, fresh.ts);

  // 只写旧记录：返回 null，而不是把旧 boot 冒充成本次加载
  writeBootLog(home, [old]);
  assert.equal(findBootAfter({ dshHome: home, sinceMs }), null);
  fs.rmSync(home, { recursive: true, force: true });
});

test("H2 非 boot 动作与缺 dshHome 都不算确认", () => {
  const home = makeHome();
  const sinceMs = Date.now();
  const later = new Date(sinceMs + 5000).toISOString();
  writeBootLog(home, [{ ts: later, action: "diagnose", plugin: "dsh-purge" }]);
  assert.equal(findBootAfter({ dshHome: home, sinceMs }), null, "diagnose 记录不能当 boot");
  assert.equal(findBootAfter({ dshHome: "", sinceMs }), null);
  assert.equal(findBootAfter({ dshHome: path.join(home, "nope"), sinceMs }), null, "没有日志文件时返回 null 而不是抛错");
  fs.rmSync(home, { recursive: true, force: true });
});

// ── H3：拼错 profile 名要和「没启动过 DSH」分开说 ──

test("H3 --profile 拼错：报实际名字 + 可复制的重试命令，不说「先启动 DSH」", () => {
  const home = makeHome();
  makeProfile(home, "desktop");
  makeProfile(home, "web");
  const rep = installPurge({ dshHome: home, profiles: ["deskop"], restart: false, sourceRoot: ROOT });
  assert.equal(rep.ok, false);
  assert.match(rep.error, /desktop, web/, "错误里要列出实际 profile 名");
  assert.match(rep.hint, /--profile desktop/, "要给出可直接复制的重试命令");
  assert.doesNotMatch(rep.error, /先启动一次 DSH/, "名字拼错不能被说成没启动过 DSH");
  assert.equal(rep.profiles.length, 0, "不能拿别的 profile 凑数装上");
  fs.rmSync(home, { recursive: true, force: true });
});

test("H3 空 profiles：仍提示先启动 DSH，与拼错名字区分开", () => {
  const home = makeHome();
  const rep = installPurge({ dshHome: home, profiles: [], restart: false, sourceRoot: ROOT });
  assert.equal(rep.ok, false);
  assert.match(rep.error, /先启动一次 DSH/);
  assert.doesNotMatch(rep.error, /不存在/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("H3 多 profile 文案：列出实际名字，不再写死 desktop/web", () => {
  const text = humanizeInstallError(new Error("NO_PROFILE_MULTI: desktop, web, work"));
  assert.match(text, /多个 profile/);
  assert.match(text, /重试|--profile/);
  const named = humanizeInstallError(new Error("NO_PROFILE_NAMED: --profile deskop 不存在（现有：desktop, web）"));
  assert.match(named, /profile 名不存在/);
  assert.doesNotMatch(named, /先启动一次 DSH/);
});

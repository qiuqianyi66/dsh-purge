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
} from "../lib/install.js";
import {
  removeProfileBodyInsert,
  ensureProfileBodyInsert,
  INSERT_BLOCK,
} from "../lib/profile-insert.js";
import { uninstallPurge } from "../lib/uninstall.js";

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
  assert.equal(install(home).ok, true);
  const files = ["package.json", "cordis.patch.yml", "dsh-purge-vendor/package.json"].map((rel) => path.join(dir, rel));
  const before = files.map((fp) => (fs.existsSync(fp) ? fs.statSync(fp).mtimeMs : 0));
  const second = install(home);
  assert.equal(second.ok, true);
  assert.equal(second.profiles[0].actions.vendor, "already");
  const after = files.map((fp) => (fs.existsSync(fp) ? fs.statSync(fp).mtimeMs : 0));
  assert.deepEqual(after, before);
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

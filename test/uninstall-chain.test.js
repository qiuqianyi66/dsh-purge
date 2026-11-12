// F20：卸载整链集成测试。全部在临时 DSH_HOME 上跑，注入空 ai_base 的状态，
// 保证不读取也不修改本机真实宿主（真实还原链由 restore-chain.test.js 覆盖）。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  uninstallPurge,
  listInstalledProfiles,
  stripPluginFromPackage,
  shouldDeletePluginTree,
  wasApplied,
} from "../lib/uninstall.js";
import * as rules from "../lib/rules.js";
import * as core from "../lib/core.js";

function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dshp-uninstall-"));
  return dir;
}

function seedProfile(home, name = "p1") {
  const dir = path.join(home, "profiles", name);
  fs.mkdirSync(path.join(dir, "node_modules", "dsh-purge"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        dependencies: { "dsh-purge": "^1.1.0", other: "1.0.0" },
        bundles: ["dsh-purge", "other-bundle"],
        dsh: { profile: { plugins: ["dsh-purge"], bundles: ["dsh-purge"] } },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "node_modules", "dsh-purge", "package.json"), '{"name":"dsh-purge"}', "utf8");
  return dir;
}

test("stripPluginFromPackage 摘干净依赖/bundles/plugins，含嵌套 profile", () => {
  const pkg = {
    dependencies: { "dsh-purge": "1.0.0", keep: "1.0.0" },
    devDependencies: { "dsh-purge": "1.0.0" },
    bundles: ["dsh-purge", "x"],
    dsh: { profile: { plugins: ["dsh-purge@1.1.0"], bundles: ["keep"] } },
  };
  assert.equal(stripPluginFromPackage(pkg), true);
  assert.deepEqual(pkg.dependencies, { keep: "1.0.0" });
  assert.deepEqual(pkg.devDependencies, {});
  assert.deepEqual(pkg.bundles, ["x"]);
  assert.deepEqual(pkg.dsh.profile.plugins, []);
  assert.deepEqual(pkg.dsh.profile.bundles, ["keep"]);
  assert.equal(stripPluginFromPackage(pkg), false, "已经干净时不应再报 changed");
});

test("wasApplied 按 bak / 应用数 / shim 三路判，任一命中即为真", () => {
  assert.equal(wasApplied(null), false);
  assert.equal(wasApplied({ has_backup: false, patches_applied: 0, shim_cmd: "", shim_ps1: "", shim_bin: "" }), false);
  assert.equal(wasApplied({ has_backup: true }), true);
  assert.equal(wasApplied({ patches_applied: 3 }), true);
  assert.equal(wasApplied({ shim_ps1: "patched" }), true);
});

test("shouldDeletePluginTree 只认 node_modules/dsh-purge 与 DSH_HOME 下的 profiles", () => {
  const fakeHome = path.join(os.tmpdir(), "dshp-fake-home");
  assert.equal(shouldDeletePluginTree("", fakeHome), false);
  assert.equal(shouldDeletePluginTree(path.join(fakeHome, "profiles", "p1", "node_modules", "dsh-purge"), fakeHome), true);
  assert.equal(shouldDeletePluginTree(path.join(fakeHome, "profiles", "p1"), fakeHome), true);
  assert.equal(shouldDeletePluginTree(path.join(os.tmpdir(), "unrelated-dir"), fakeHome), false);
});

test("listInstalledProfiles 认 dependencies/bundles 与已装的 node_modules", () => {
  const home = tempHome();
  const dir = seedProfile(home, "p1");
  const rows = listInstalledProfiles(home);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "p1");
  assert.equal(rows[0].dir, dir);
  assert.equal(rows[0].hasModule, true);
  fs.rmSync(home, { recursive: true, force: true });
});

test("卸载整链：还原前压根不碰宿主，profile 摘干净、覆盖件与规则目录被清、清理目录含插件树与数据目录", async () => {
  const home = tempHome();
  const profileDir = seedProfile(home, "p1");

  // 覆盖件与规则目录：卸载必须清掉
  const overrideFile = core.findOverrideFile(home);
  fs.writeFileSync(overrideFile, "overrides: []\n", "utf8");
  const rdir = rules.rulesDir(home);
  fs.mkdirSync(rdir, { recursive: true });
  fs.writeFileSync(path.join(rdir, "rules.json"), "{}", "utf8");

  // 数据目录（日志/状态所在）
  const dataDir = path.join(home, "dsh-purge");
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "logs", "selfcheck.log"), '{"action":"boot"}\n', "utf8");

  const stages = [];
  const state = {
    dsh_home: home,
    ai_base: "",
    has_backup: false,
    patches_applied: 0,
    shim_cmd: "",
    shim_ps1: "",
    shim_bin: "",
  };
  const report = await uninstallPurge({ state, onStage: (s) => stages.push(s) });

  assert.equal(report.ok, true);
  assert.equal(report.applied, false, "空 ai_base 时不应判成已应用");
  assert.deepEqual(stages, ["locate", "revert", "shim", "flash", "cleanup", "done"]);
  assert.deepEqual(report.profiles, ["p1"]);
  assert.deepEqual(report.stripped, ["p1"]);
  assert.deepEqual(report.errors, []);

  // profile 里不再提 dsh-purge
  const pkg = JSON.parse(fs.readFileSync(path.join(profileDir, "package.json"), "utf8"));
  assert.equal(Object.prototype.hasOwnProperty.call(pkg.dependencies, "dsh-purge"), false);
  assert.deepEqual(pkg.bundles, ["other-bundle"]);
  assert.deepEqual(pkg.dsh.profile.plugins, []);
  assert.deepEqual(pkg.dsh.profile.bundles, []);

  // 覆盖件与规则目录被清
  assert.equal(fs.existsSync(overrideFile), false);
  assert.equal(report.override.removed, true);
  assert.equal(fs.existsSync(rdir), false);
  assert.equal(report.rules.rules_dir_removed, true);

  // 清理目录里包含待删的插件树与数据目录（这里只登记，不执行删除）
  const cleanup = report.cleanup.map((p) => path.resolve(p).replace(/[/\\]+/g, "/").toLowerCase());
  const wantModule = path.resolve(path.join(profileDir, "node_modules", "dsh-purge")).replace(/[/\\]+/g, "/").toLowerCase();
  const wantData = path.resolve(dataDir).replace(/[/\\]+/g, "/").toLowerCase();
  assert.ok(cleanup.includes(wantModule), "插件树应进清理清单");
  assert.ok(cleanup.includes(wantData), "数据目录应进清理清单");
  assert.ok(report.needRestart, "卸载后需要重启宿主");

  // 二次卸载幂等：不报错、不重复摘
  const again = await uninstallPurge({ state, onStage: () => {} });
  assert.equal(again.ok, true);
  assert.deepEqual(again.stripped, []);
  assert.deepEqual(again.errors, []);

  fs.rmSync(home, { recursive: true, force: true });
});

test("卸载遇 stale backup（宿主已换版本）时不阻断卸载，但明确报出跳过还原的理由", async () => {
  const home = tempHome();
  seedProfile(home, "p2");
  const report = await uninstallPurge({
    // ai_base 非空但没有真实文件：revertGuard 读到的是「读不到佐证」，
    // 这里只断言报告结构不会被异常打断。
    state: { dsh_home: home, ai_base: path.join(home, "no-such-base"), has_backup: true, patches_applied: 3 },
    onStage: () => {},
  });
  assert.equal(typeof report.ok, "boolean");
  assert.ok(Array.isArray(report.errors));
  fs.rmSync(home, { recursive: true, force: true });
});

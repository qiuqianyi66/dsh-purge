import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizePresetId,
  presetMatchesRule,
  isPresetExcluded,
  loadExcludePresets,
  saveExcludePresets,
  excludePresetsSettingsPath,
} from "../lib/exclude-presets.js";

function withTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-excl-"));
}

test("normalizePresetId 去目录前缀、preset- 前缀并小写", () => {
  assert.equal(normalizePresetId("preset-minimal"), "minimal");
  assert.equal(normalizePresetId("some/minimal"), "minimal");
  assert.equal(normalizePresetId("MINIMAL"), "minimal");
  assert.equal(normalizePresetId(""), "");
});

test("presetMatchesRule 精确匹配与通配后缀", () => {
  assert.equal(presetMatchesRule("minimal", "minimal"), true);
  assert.equal(presetMatchesRule("preset-minimal", "minimal"), true);
  assert.equal(presetMatchesRule("sdk-minimal", "sdk-*"), true);
  assert.equal(presetMatchesRule("sdk-app", "sdk-*"), true);
  assert.equal(presetMatchesRule("standard", "minimal"), false);
});

test("isPresetExcluded 名单命中/不命中", () => {
  assert.equal(isPresetExcluded("roleplay", ["roleplay", "minimal"]), true);
  assert.equal(isPresetExcluded("standard", ["roleplay"]), false);
  assert.equal(isPresetExcluded("minimal", []), false);
});

test("loadExcludePresets 文件与配置合并去重，归一化规则", () => {
  const home = withTempHome();
  fs.mkdirSync(path.dirname(excludePresetsSettingsPath(home)), { recursive: true });
  fs.writeFileSync(
    excludePresetsSettingsPath(home),
    JSON.stringify({ excludePresets: ["minimal", "preset-minimal"] }),
    "utf8",
  );
  const loaded = loadExcludePresets(home, ["roleplay"]);
  assert.deepEqual(loaded.excludePresets, ["minimal", "roleplay"]);
});

test("loadExcludePresets 缺文件时只取配置值", () => {
  const home = withTempHome();
  const loaded = loadExcludePresets(home, ["a", "b"]);
  assert.deepEqual(loaded.excludePresets, ["a", "b"]);
});

test("saveExcludePresets 整体替换并剔除非字符串", () => {
  const home = withTempHome();
  const saved = saveExcludePresets(home, { excludePresets: ["  minimal ", "sdk-*", 42, null] });
  assert.deepEqual(saved.excludePresets, ["minimal", "sdk-*"]);
  const reread = loadExcludePresets(home);
  assert.deepEqual(reread.excludePresets, ["minimal", "sdk-*"]);
});

test("损坏 JSON 时回退空名单，不抛", () => {
  const home = withTempHome();
  fs.mkdirSync(path.dirname(excludePresetsSettingsPath(home)), { recursive: true });
  fs.writeFileSync(excludePresetsSettingsPath(home), "{not json", "utf8");
  assert.deepEqual(loadExcludePresets(home, ["x"]).excludePresets, ["x"]);
});

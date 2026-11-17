#!/usr/bin/env node
/**
 * 打包自检（pack check）——打出来的 tgz 到底装不装得上。
 *
 * 为什么需要：`package.json` 的 `files` 是手写白名单，少写一条（比如
 * `scripts/ensure-profile-bundle.mjs` 或 `presets/redteam/`）时，本机测试全绿、
 * 用户 `npm i` 之后面板才炸；反过来，`test/`、`docs/plans/`、`.github/` 误打进包
 * 会把仓库里的草稿与用例发给用户。
 *
 * 做法：`npm pack --dry-run --json`，只读清单，不产包、不联网、不改盘。
 * 退出码：0 通过 / 1 有缺件或误带 / 2 npm 本身失败。
 *
 * 用法：node scripts/pack-check.mjs
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK_CMD = "npm pack --dry-run --json --ignore-scripts";

/** 装到用户机器上必须存在的文件；少一条就是安装期炸点。 */
const REQUIRED = [
  "package.json",
  "bin/dsh-purge.js",
  "lib/index.js",
  "lib/core.js",
  "lib/reapply.js",
  "lib/redteam/index.js",
  "lib/compat-matrix.js",
  "client.js",
  "cordis.patch.yml",
  "compat.json",
  "README.md",
  "LICENSE",
  "NOTICE",
  "scripts/ensure-profile-bundle.mjs",
  "presets/redteam/preset.yml",
];

/** 仓库内部件，绝不能进用户包。 */
const FORBIDDEN = [
  { re: /^test\//, why: "测试用例" },
  { re: /^docs\/plans\//, why: "内部规划稿" },
  { re: /^\.github\//, why: "CI 配置" },
  { re: /^node_modules\//, why: "依赖目录" },
  { re: /^\.tmp\//, why: "临时目录" },
  { re: /^upstream-reports\//, why: "离体审计报告" },
  { re: /^debug\.log$/, why: "调试日志" },
  { re: /\.dshpurge\.bak$/, why: "补丁备份" },
];

function fail(lines) {
  for (const line of lines) console.error(line);
  console.error("\n打包自检失败：修 `package.json` 的 `files` 白名单后重跑 `npm run pack:check`。");
  process.exit(1);
}

let packed;
try {
  const stdout = execSync(PACK_CMD, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  });
  packed = JSON.parse(stdout);
} catch (err) {
  console.error(`打包自检失败：npm pack 执行失败 —— ${err?.message || err}`);
  process.exit(2);
}

const entry = Array.isArray(packed) ? packed[0] : packed;
const files = (entry?.files || []).map((f) => String(f.path || "").replace(/\\/g, "/"));
if (!files.length) fail(["打包自检失败：npm pack 返回空文件清单。"]);

const problems = [];
const missing = REQUIRED.filter((p) => !files.includes(p));
if (missing.length) problems.push(`缺少必需文件 ${missing.length} 个：${missing.join("、")}`);

const smuggled = [];
for (const f of files) {
  const hit = FORBIDDEN.find((x) => x.re.test(f));
  if (hit) smuggled.push(`${f}（${hit.why}）`);
}
if (smuggled.length) problems.push(`误带内部文件 ${smuggled.length} 个：${smuggled.slice(0, 8).join("、")}${smuggled.length > 8 ? " …" : ""}`);

const totalBytes = (entry?.files || []).reduce((n, f) => n + Number(f.size || 0), 0);
const sizeText = `${(totalBytes / 1024).toFixed(1)} KB`;

if (problems.length) fail(["", ...problems.map((p) => `  ✗ ${p}`)]);

console.log(`打包自检通过：${files.length} 个文件 / ${sizeText}（必需 ${REQUIRED.length} 项齐全，内部件 0 个）`);

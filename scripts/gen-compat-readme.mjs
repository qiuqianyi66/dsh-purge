#!/usr/bin/env node
/**
 * F10 从兼容矩阵（lib/compat-matrix.js）生成 README 适配表。
 * 单一事实来源是矩阵；本脚本只负责渲染，不在 README 里手维护版本对照。
 *
 * 用法：node scripts/gen-compat-readme.mjs [--check]
 *   默认：把 README 中 <!-- compat:table:start --> ... <!-- compat:table:end --> 区间替换为最新表。
 *   --check：只校验 README 表是否与矩阵一致，不一致退出码 1（供 CI/发版门禁）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPAT_MATRIX, COMPAT_CURRENT } from "../lib/compat-matrix.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(root, "README.md");

function renderTable() {
  const rows = COMPAT_MATRIX.map((e) => {
    const dsh = `**${e.dsh}**`;
    const plugin = e.plugin === "unknown" ? "unknown" : `**${e.plugin}**`;
    const note = e.note ? `，${e.note}` : "";
    return `| ${dsh} | ${plugin}${note} |`;
  });
  return ["| dsh 版本 | 本仓库版本 |", "| --- | --- |", ...rows].join("\n");
}

function readReadme() {
  return fs.readFileSync(readmePath, "utf8");
}

const START = "<!-- compat:table:start -->";
const END = "<!-- compat:table:end -->";

function replaceBlock(markdown, table) {
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const next = `${START}\n${table}\n${END}`;
  if (!re.test(markdown)) {
    throw new Error("README 缺少 compat:table 标记区间，无法定位适配表");
  }
  return markdown.replace(re, next);
}

const table = renderTable();
const readme = readReadme();

if (process.argv.includes("--check")) {
  const re = new RegExp(`${START}([\\s\\S]*?)${END}`);
  const m = readme.match(re);
  if (!m) {
    console.error("compat:table 标记区间缺失");
    process.exit(1);
  }
  const current = m[1].trim();
  if (current !== table.trim()) {
    console.error("README 适配表与兼容矩阵不一致，先跑 `node scripts/gen-compat-readme.mjs` 生成");
    process.exit(1);
  }
  console.log("compat matrix 与 README 一致");
  process.exit(0);
}

fs.writeFileSync(readmePath, replaceBlock(readme, table), "utf8");
console.log(`README 适配表已从矩阵生成（当前目标 ${COMPAT_CURRENT.dsh} / ${COMPAT_CURRENT.plugin}）`);

#!/usr/bin/env node
/**
 * F10 从兼容矩阵（lib/compat-matrix.js）生成两样东西：
 *   1) README 里的适配表（<!-- compat:table:start --> … <!-- compat:table:end --> 区间）
 *   2) 仓库根 compat.json —— 给 AI agent／CI 读的机器可读版本
 *
 * 单一事实来源是矩阵 + package.json；本脚本只负责渲染，不在 README 里手维护版本对照。
 *
 * 用法：node scripts/gen-compat-readme.mjs [--check]
 *   默认：重写 README 表与 compat.json。
 *   --check：只校验两者是否与矩阵一致，不一致退出码 1（供 CI／发版门禁）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPAT_MATRIX,
  COMPAT_CURRENT,
  COMPAT_VERIFICATION,
  DSH_RELEASES,
  EVIDENCE_LEVELS,
} from "../lib/compat-matrix.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(root, "README.md");
const compatJsonPath = path.join(root, "compat.json");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const START = "<!-- compat:table:start -->";
const END = "<!-- compat:table:end -->";

const EVIDENCE_SHORT = {
  contract: "契约",
  applySim: "实打",
  hostSmoke: "冒烟",
  device: "真机",
};

function evidenceCell(evidence) {
  if (!evidence) return "—";
  const keys = Object.keys(EVIDENCE_SHORT);
  return keys
    .map((k) => `${EVIDENCE_SHORT[k]}${evidence[k] === "verified" ? "✓" : "✗"}`)
    .join(" ");
}

function stripLinks(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function renderTable() {
  const rows = COMPAT_MATRIX.map((e) => {
    const plugin = e.plugin === "unknown" ? "unknown" : `**${e.plugin}**`;
    return `| **${e.dsh}** | ${plugin} | ${evidenceCell(e.evidence)} | ${e.note || ""} |`;
  });
  return ["| dsh 版本 | 本仓库版本 | 证据 | 说明 |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

function renderCompatJson() {
  const data = {
    name: pkg.name,
    version: pkg.version,
    dshTarget: pkg.dshTarget,
    generatedBy: "scripts/gen-compat-readme.mjs",
    source: "lib/compat-matrix.js",
    evidenceLevels: EVIDENCE_LEVELS,
    verification: COMPAT_VERIFICATION,
    // 逐宿主版本档位（宿主视角）：让 agent/CI 能一眼看出 rc.5 是「已适配未真机」而不是「不支持」。
    releases: Object.fromEntries(
      Object.entries(DSH_RELEASES).map(([dsh, r]) => [
        dsh,
        {
          status: r.status,
          plugin: r.plugin,
          evidence: r.evidence || null,
          note: stripLinks(r.note),
        },
      ]),
    ),
    matrix: COMPAT_MATRIX.map((e) => ({
      dsh: e.dsh,
      plugin: e.plugin,
      status: e.status,
      evidence: e.evidence || null,
      note: stripLinks(e.note),
    })),
    install: {
      preferred: pkg.dsh?.install?.preferred || "tarball",
      tarball: pkg.dsh?.install?.tarball || "",
      git: pkg.dsh?.install?.git || "",
      command: `dsh plugin --profile <web|desktop> add ${pkg.dsh?.install?.tarball || ""}`,
    },
    entrypoints: {
      cli: "dsh-purge --status | --diagnose | --preupdate | --apply | --revert | --uninstall",
      chat: "/purge status | apply | revert | uninstall | edit | help",
      tools: ["purge_status", "purge_apply", "purge_revert"],
      auditBeforeUpgrade: "node scripts/audit-next.mjs --version <dsh-version> --fail-on drift",
    },
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function readReadme() {
  return fs.readFileSync(readmePath, "utf8");
}

function replaceBlock(markdown, table) {
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (!re.test(markdown)) {
    throw new Error("README 缺少 compat:table 标记区间，无法定位适配表");
  }
  return markdown.replace(re, `${START}\n${table}\n${END}`);
}

const table = renderTable();
const compatJson = renderCompatJson();
const readme = readReadme();

if (process.argv.includes("--check")) {
  let bad = false;
  const re = new RegExp(`${START}([\\s\\S]*?)${END}`);
  const m = readme.match(re);
  if (!m) {
    console.error("compat:table 标记区间缺失");
    bad = true;
  } else if (m[1].trim() !== table.trim()) {
    console.error("README 适配表与兼容矩阵不一致，先跑 `node scripts/gen-compat-readme.mjs` 生成");
    bad = true;
  }
  const existing = fs.existsSync(compatJsonPath) ? fs.readFileSync(compatJsonPath, "utf8") : null;
  if (existing !== compatJson) {
    console.error("compat.json 与兼容矩阵不一致，先跑 `node scripts/gen-compat-readme.mjs` 生成");
    bad = true;
  }
  if (pkg.dshTarget !== COMPAT_CURRENT.dsh) {
    console.error(`package.json dshTarget=${pkg.dshTarget} 与矩阵 current=${COMPAT_CURRENT.dsh} 不一致`);
    bad = true;
  }
  if (bad) process.exit(1);
  console.log("compat matrix / README / compat.json 三者一致");
  process.exit(0);
}

fs.writeFileSync(readmePath, replaceBlock(readme, table), "utf8");
fs.writeFileSync(compatJsonPath, compatJson, "utf8");
console.log(`均已生成：README 适配表 + compat.json（当前目标 ${COMPAT_CURRENT.dsh} / ${COMPAT_CURRENT.plugin}）`);

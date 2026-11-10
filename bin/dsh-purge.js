#!/usr/bin/env node

import * as core from "../lib/core.js";
import * as rules from "../lib/rules.js";
import * as drift from "../lib/drift.js";
import * as preupdate from "../lib/preupdate.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sha256Of = (fp) => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(fp)).digest("hex");
  } catch {
    return null;
  }
};

/** 从 app.asar 里直接读 package.json 的 version：解包目录被清掉后唯一可靠的版本源。 */
const asarVersion = (asarPath) => {
  try {
    const fd = fs.openSync(asarPath, "r");
    try {
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      const hdrSize = head.readUInt32LE(12);
      const hdrBuf = Buffer.alloc(hdrSize);
      fs.readSync(fd, hdrBuf, 0, hdrSize, 16);
      const header = JSON.parse(hdrBuf.toString("utf8").replace(/\0+$/, ""));
      const base = 16 + hdrSize;
      const find = (node, prefix) => {
        for (const [k, v] of Object.entries(node.files || {})) {
          const full = prefix ? `${prefix}/${k}` : k;
          if (v.files) {
            const hit = find(v, full);
            if (hit) return hit;
          } else if (full === "package.json") return v;
        }
        return null;
      };
      const entry = find(header, "");
      if (!entry) return null;
      const buf = Buffer.alloc(entry.size);
      fs.readSync(fd, buf, 0, entry.size, base + Number(entry.offset));
      return JSON.parse(buf.toString("utf8")).version || null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
};

/** 从 app-update.yml 里抠出 channel（不引 yaml 依赖，两行足够）。 */
const updateChannelOf = (fp) => {
  try {
    const text = fs.readFileSync(fp, "utf8");
    const m = text.match(/^\s*channel:\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
};

/** 目录体积：带文件数上限，避免在大目录上卡住（只读）。 */
const dirSizeMB = (dir, maxFiles = 20000) => {
  let bytes = 0;
  let files = 0;
  const walk = (d) => {
    let ents = [];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (files >= maxFiles) return;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.isFile()) {
        try {
          bytes += fs.statSync(fp).size;
          files++;
        } catch {
          /* 单个文件读不到不影响整体估算 */
        }
      }
    }
  };
  walk(dir);
  return { mb: Math.round((bytes / 1048576) * 10) / 10, files, truncated: files >= maxFiles };
};


const args = process.argv.slice(2);

function printStatus(state) {
  const out = [];
  out.push("dsh-purge 状态 / Status");
  out.push("  宿主 / surface " + (state.surface || "web"));
  out.push("  DSH_HOME      " + state.dsh_home);
  if (state.desktop_install) out.push("  桌面安装       " + state.desktop_install);
  if (state.ai_base) {
    out.push("  插件根 / root  " + state.ai_base);
    for (const [key, fp] of Object.entries(state.files)) {
      out.push(`    ${key.padEnd(22)} ${fp}`);
    }
  } else {
    out.push("  插件根 / root  " + core.missingAiBaseMessage());
  }
  out.push(`  shim 目录      ${state.shim_dir || "未定位 / not found"}`);
  out.push(`  备份 / backup  ${state.has_backup ? "有 / yes" : "无 / no"}`);
  out.push(`  注入文件       ${state.override_path}`);
  out.push(`  注入状态       ${state.override_status}`);
  out.push("");
  out.push(`  ${core.describePatchCounts(state)}`);
  out.push("  口径 / scope  这里按补丁状态标记统计；--diagnose 的 clean 按载体原文探测，两者语义不同，不可对减");
  if (state.host_version) {
    const compat = state.host_supported === false ? `  ← 未适配：插件声明 ${state.host_target || "?"}` : "";
    out.push(`  宿主版本 / host  ${state.host_version}${compat}`);
  }
  for (const p of core.ALL_PATCHES) {
    const s = state.patch_status[p.id];
    const mark = s === "applied" ? "✓" : s === "pending" ? "✗" : s === "drifted" ? "!" : "·";
    out.push(`    ${mark} [#${String(p.id).padEnd(2)}] ${p.name.padEnd(30)} ${p.layer}/${p.layer_en} — ${s}`);
  }
  out.push("");
  out.push(`  shim: dsh.cmd=${state.shim_cmd}  dsh.ps1=${state.shim_ps1}  dsh=${state.shim_bin}`);
  return out.join("\n");
}

async function main() {
  const mode = args.find((a) => ["--apply", "--revert", "--uninstall", "--status", "--edit", "--diagnose", "--preupdate", "--help"].includes(a));

  if (mode === "--help" || args.includes("-h")) {
    console.log(`dsh-purge 用法:
  dsh-purge --status     显示状态
  dsh-purge --diagnose   补丁漂移诊断（只读）：载体是否还在、pattern 还命中几次、官方改了什么
                         加 --json 输出机器可读结果；加 --all-hosts 连残留 base 一起查
  dsh-purge --preupdate  升级前预检（只读）：这次更新会不会把 DSH 弄崩、更新前该做什么
                         加 --json 输出机器可读结果
  dsh-purge --apply      应用全部清洗（提示词+代码+shim+override）
  dsh-purge --revert     回滚还原
  dsh-purge --uninstall  卸载插件（已应用则先还原）
  dsh-purge --edit       编辑注入文件 prompt-inject.md
  dsh-purge --help       帮助`);
    return;
  }

  // 漂移诊断：只读，先于 status 处理，避免和写入路径混在一起。
  if (mode === "--diagnose") {
    const bases = core.enumeratePatchAiBases({});
    const ranked = drift.rankBases(bases);
    const jsonOut = args.includes("--json");
    const allHosts = args.includes("--all-hosts");
    const targets = allHosts ? ranked : ranked.filter((r) => r.live);
    if (!targets.length) {
      console.log("[ERROR] 没找到任何 @deepseek-ai 宿主 base，无法诊断。");
      process.exit(1);
    }
    const reports = targets.map((t) =>
      drift.diagnose({
        aiBase: t.aiBase,
        dshHome: core.findDshHome(),
        patches: core.ALL_PATCHES,
        resolveFiles: core.targetFiles,
        appliesHere: (p) => core.patchAppliesHere(p),
      })
    );
    // 只剩归档/pnpm 残留可选时，说明真正的宿主还封在 app.asar 里没解包：
    // 那时任何 base 上跑出来的都不是「当前宿主」的结论，必须说清楚。
    if (!ranked.some((r) => !r.archived && !r.pnpm)) {
      console.log("⚠ 没找到可打的宿主（大概率还封在 app.asar 里没解包）。");
      console.log("  这份结果只能当参考；要在真正宿主上诊断，先让插件解包（--apply），再跑 --diagnose。");
      console.log("");
    }
    if (jsonOut) {
      console.log(JSON.stringify({ bases: ranked, reports }, null, 2));
      return;
    }
    if (ranked.length > 1) {
      console.log(`发现 ${ranked.length} 个宿主 base，按「在用可能性」排序：`);
      for (const r of ranked) {
        const tag = r.live ? "← 视为当前宿主" : "  跳过";
        const why = r.why.length ? `（${r.why.join("；")}）` : "";
        console.log(`  ${tag}  ${r.aiBase}  子包=${r.pkgs}${why}`);
      }
      console.log("");
    }
    for (const rep of reports) {
      console.log(drift.renderDiagnose(rep));
      console.log("");
    }
    if (!allHosts && ranked.length > 1) {
      console.log("（只想看当前宿主；要连残留 base 一起查，加 --all-hosts）");
    }
    return;
  }

  // 升级前预检：只读，回答「这次更新会不会把 DSH 弄崩」。
  if (mode === "--preupdate") {
    const ranked = drift.rankBases(core.enumeratePatchAiBases({}));
    const live = ranked.find((r) => r.live) || ranked[0];
    const aiBase = live?.aiBase || null;
    if (!aiBase) {
      console.log("[ERROR] 没找到 @deepseek-ai 宿主 base，无法预检。");
      process.exit(1);
    }
    // 宿主定位优先走 asar，而不是靠解包目录：app/ 被挪走时解包目录不存在，
    // 照旧路走会掉到别的 base（例如归档 profile），预检就会指错方向。
    // 宿主定位：三段兜底，且都不依赖 resources/app 是否存在（它可能已被挪走）。
    let resourcesDir = null;
    let asarPath = null;
    const probe = (dir) => {
      if (!dir) return null;
      const res = path.join(dir, "resources");
      // 换手后 app.asar 已改名成 .bak，只认 asar 会把「已破甲」误判成「找不到安装」
      const hit = fs.existsSync(path.join(res, "app.asar")) || fs.existsSync(path.join(res, "app.asar.bak"));
      return hit ? res : null;
    };
    // 1) 插件自己记过的桌面安装目录
    try {
      const rec = fs.readFileSync(path.join(core.findDshHome(), "dsh-purge", "desktop-install.txt"), "utf8").trim();
      if (rec) {
        const asDir = /\.exe$/i.test(rec) ? path.dirname(rec) : rec;
        resourcesDir = probe(asDir) || probe(path.dirname(asDir));
      }
    } catch {
      /* 没有记录就继续 */
    }
    // 2) sealedAsarHandoff（有 exe 上下文时最准）
    if (!resourcesDir && core.sealedAsarHandoff) {
      try {
        const handoff = core.sealedAsarHandoff();
        if (handoff?.asar) resourcesDir = path.dirname(handoff.asar);
      } catch {
        /* 忽略 */
      }
    }
    // 3) 按 base 反推（不要求 asar 在，换手后 asar 本来就不在）
    if (!resourcesDir && aiBase) {
      let p4 = aiBase;
      for (let i = 0; i < 4; i++) p4 = path.dirname(p4);
      if (fs.existsSync(p4)) resourcesDir = p4;
    }
    if (!resourcesDir) {
      console.log("[ERROR] 定位不到 resources 目录（无 desktop-install 记录、无 asar、无 base），无法预检。");
      console.log("  fix: 把安装目录写进 " + path.join(core.findDshHome(), "dsh-purge", "desktop-install.txt"));
      process.exit(1);
    }
    asarPath = path.join(resourcesDir, "app.asar");
    const appDir = path.join(resourcesDir, "app");

    let hostVersion = null;
    const readVersion = (fp) => {
      try {
        return JSON.parse(fs.readFileSync(fp, "utf8")).version || null;
      } catch {
        return null;
      }
    };
    hostVersion = asarVersion(asarPath) || readVersion(path.join(appDir, "package.json"));
    if (!hostVersion) {
      // app/ 已挪走时，从改名残留里读版本，避免把宿主版本报成未知
      try {
        for (const e of fs.readdirSync(resourcesDir, { withFileTypes: true })) {
          if (!e.isDirectory() || !e.name.startsWith("app.")) continue;
          hostVersion = readVersion(path.join(resourcesDir, e.name, "package.json"));
          if (hostVersion) break;
        }
      } catch {
        /* 读不到就保持未知 */
      }
    }
    let patchTarget = null;
    try {
      patchTarget = JSON.parse(
        fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
      ).dshTarget;
    } catch {
      /* 同上 */
    }

    // 补丁备份统计：多少个文件当前处于被改状态（revert 会真正改变内容）
    let backupTotal = 0;
    let backupChanged = 0;
    const walkBak = (d) => {
      let ents = [];
      try {
        ents = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of ents) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walkBak(fp);
        else if (e.isFile() && e.name.endsWith(".dshpurge.bak")) {
          backupTotal++;
          const target = fp.slice(0, -".dshpurge.bak".length);
          const a = sha256Of(target);
          const b = sha256Of(fp);
          if (a && b && a !== b) backupChanged++;
        }
      }
    };
    // 备份只扫「活跃宿主」那份 @deepseek-ai；扫 aiBase 兜底会把归档残留算进来。
    const activeAi = path.join(appDir, "dsh", "node_modules", "@deepseek-ai");
    walkBak(fs.existsSync(activeAi) ? activeAi : aiBase);

    // 本插件是否被挂在 profile 启动路径上（更新后接口一变就会崩在启动阶段）
    const profilesDir = path.join(core.findDshHome(), "profiles");
    let pluginOnStartupPath = false;
    let profilePatchPath = null;
    let profNames = [];
    try {
      profNames = fs.readdirSync(profilesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      profNames = [];
    }
    for (const name of profNames) {
      // 下划线开头的都是归档/备份 profile（_archived-/_backup-/_pre-cleanup-…），
      // 启动时根本不加载，扫它们只会制造假警报。
      if (name.startsWith("_") || /\.(bak|trash)$/i.test(name)) continue;
      const fp = path.join(profilesDir, name, "cordis.patch.yml");
      let lines = null;
      try {
        lines = fs.readFileSync(fp, "utf8").split(/\r?\n/);
      } catch {
        continue;
      }
      // 只认「真的会被实例化」的注册：条目里 disabled: true 就是已停用，
      // 不该再报成启动崩溃风险，否则预检会永远喊狼来了。
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*-\s*id:\s*dsh-purge\s*$/.test(lines[i])) continue;
        const window = lines.slice(i, i + 5).join("\n");
        const disabled = /^\s*disabled:\s*true\s*$/m.test(window);
        if (!disabled) {
          pluginOnStartupPath = true;
          profilePatchPath = fp;
        }
        break;
      }
      if (pluginOnStartupPath) break;
    }

    let appDirMB = 0;
    const appDirExists = fs.existsSync(appDir) && fs.statSync(appDir).isDirectory();
    if (appDirExists) appDirMB = dirSizeMB(appDir).mb;

    // 被挪开的解包残留（app.dshpurge-unpacked-*）：不影响更新，但白占磁盘
    let movedLeftover = null;
    let movedSizeMB = 0;
    try {
      for (const e of fs.readdirSync(resourcesDir, { withFileTypes: true })) {
        if (!e.isDirectory() || !e.name.startsWith("app.") || e.name === "app.asar.unpacked") continue;
        movedLeftover = path.join(resourcesDir, e.name);
        movedSizeMB = dirSizeMB(movedLeftover).mb;
        break;
      }
    } catch {
      /* 列表失败就当没有 */
    }

    const report = preupdate.assessPreUpdate({
      sealed: fs.existsSync(asarPath),
      appDirPatched: appDirExists && backupTotal > 0,
      appDirExists,
      appDirSizeMB: appDirMB,
      movedLeftover,
      movedSizeMB,
      channel: updateChannelOf(path.join(resourcesDir, "app-update.yml")),
      hostVersion,
      patchTarget,
      hostSupported: hostVersion && patchTarget ? hostVersion === patchTarget : null,
      pluginOnStartupPath,
      profilePatchPath,
      backupTotal,
      backupChanged,
      aiBase,
      asarPath,
    });

    if (args.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(preupdate.renderPreUpdate(report));
    console.log("");
    console.log(`宿主 ${hostVersion || "?"} ｜ 插件声明 ${patchTarget || "?"} ｜ asar ${fs.existsSync(asarPath) ? "密封" : "已解包"} ｜ 备份 ${backupTotal} 个（${backupChanged} 个真改动）`);
    return;
  }

  const state = await core.gatherState();
  console.log(printStatus(state));
  console.log("");

  if (mode === "--apply") {
    if (!state.ai_base) {
      console.log("[ERROR] " + core.missingAiBaseMessage());
      console.log("  fix: 把 DSH_BASE 指到含 dsh-agent-instructions/lib 的 @deepseek-ai 目录");
      process.exit(1);
    }
    const inject = rules.resolveInjectText(state.dsh_home);
    if (!inject.text) {
      console.log("[ERROR] 提示词和规则集都是空的，必须先添加提示词");
      process.exit(1);
    }
    const { hosts, report } = await core.applyPatchesAllHosts(core.ALL_PATCHES, {
      preserveClientBundles: false,
      forApply: true,
    });
    for (const h of hosts) console.log(`  宿主 / host → ${h.aiBase}`);
    for (const r of report) {
      const m = r.status === "applied" ? "✓ 已清洗" : r.status === "already" ? "- 已是最新" : r.status === "missing_file" ? "⚠ 文件缺失" : `✗ ${r.status}`;
      console.log(`  ${m} patch #${String(r.patch_id).padEnd(2)} ${r.name}`);
    }
    const flashHost = hosts[0]?.aiBase || state.ai_base;
    const flash = core.silenceCmdFlash(flashHost);
    console.log(`  cmd-flash=${flash.entry} phase-1=${flash.phase1} ok=${flash.ok}`);
    if (hosts.length > 1) {
      console.log(`  多宿主 / multi-host: ${hosts.length} 份 @deepseek-ai 已清洗`);
    }
    console.log(inject.source === "rule"
      ? "  - 使用当前规则集，不改写提示词文件"
      : "  - 使用已有提示词文件");
    if (state.shim_dir) {
      const r = await core.patchShim(state.shim_dir);
      for (const [fname, st] of Object.entries(r)) {
        if (st === "patched") console.log(`  ✓ shim ${fname} 注入 / injected`);
        else if (st === "already_patched") console.log(`  - shim ${fname} 已注入 / already injected`);
        else if (st === "missing") console.log(`  - shim ${fname} 不存在 / missing`);
        else console.log(`  ⚠ shim ${fname}: ${st}`);
      }
    } else {
      console.log("  ⚠ 未定位 shim 目录，跳过注入");
    }
    console.log("");
    console.log("全部完成 / All done。重启 dsh 生效 / Restart dsh to take effect.");
  } else if (mode === "--revert") {
    if (state.ai_base || core.enumeratePatchAiBases().length) {
      const { reverted, errors } = await core.revertAllHosts();
      for (const p of reverted) console.log(`  ✓ 已还原 / Reverted ${p}`);
      for (const [p, e] of errors) console.log(`  ⚠ 还原失败 ${p}: ${e}`);
      if (reverted.length === 0) console.log("  - 没有补丁备份可还原 / no patch backup");
    }
    if (state.shim_dir) {
      const r = await core.revertShim(state.shim_dir);
      for (const [fname, st] of Object.entries(r)) {
        if (st === "reverted" || st === "stripped_inject") console.log(`  ✓ shim ${fname}: ${st}`);
        else console.log(`  - shim ${fname}: ${st}`);
      }
    }
    console.log("");
    console.log("回滚完成 / Revert done。重启 dsh 后恢复 / restart to restore.");
    console.log("注: prompt-inject.md 保留（用户文件）/ prompt-inject.md kept (user file)");
  } else if (mode === "--uninstall") {
    const { uninstallPurge } = await import("../lib/uninstall.js");
    const result = await uninstallPurge();
    if (result.applied) console.log("  已检测到补丁，已还原回原版。");
    else console.log("  未检测到已应用补丁，仍会清除插件文件。");
    if (result.override?.removed) console.log(`  已删除 ${result.override.path}`);
    if (result.stripped?.length) console.log(`  已从 profile 移除: ${result.stripped.join(", ")}`);
    for (const e of result.errors || []) console.log(`  ⚠ ${e}`);
    if (!result.ok) {
      console.log("  卸载中止：还原失败，插件文件未删除。");
      process.exit(1);
    }
    console.log("");
    console.log("卸载完成。请重启 dsh。");
  } else if (mode === "--edit") {
    const r = core.editOverride(state.dsh_home);
    if (!r.ok && r.needCreate) {
      await core.installOverride(state.dsh_home, true);
      console.log(`  ✓ 已创建默认注入文件：${state.override_path}`);
      core.editOverride(state.dsh_home);
    } else {
      console.log(`  → 已打开 ${r.editor} 编辑注入文件：${r.path}`);
    }
    console.log("  编辑完成后重启 dsh 生效。");
  } else {
    console.log("默认不清洗，使用 --apply 应用清洗。");
  }
}

main().catch((e) => {
  console.error("[dsh-purge] error:", e);
  process.exit(1);
});

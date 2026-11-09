// lib/preupdate.js — 升级前预检（纯只读：只判定和给建议，不碰任何文件）
//
// 为什么需要：这个插件最大的失败模式不是「补丁打不上」，而是「官方更新完
// DSH 直接起不来」。已经踩到的三个结构性原因，都在这里做成显式检查：
//   1) 桌面端 app.asar 密封：补丁写在 resources/app/，但 Electron 优先读 asar
//      → 补丁从未生效，还留下一份 174MB 的旧版解包目录与更新互撞
//   2) 更新通道是 nightly：收到的是 alpha 系列的破坏性变更，不是 rc
//   3) 插件自己挂在 profile 启动路径上：新版改了插件接口，加载即失败即崩
// 判定只输出风险与动作，不做任何写入。

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/** 纯判定：事实进，风险与动作出。不读文件，便于单独验证。 */
export function assessPreUpdate(facts) {
  const risks = [];
  const add = (level, code, title, detail) => risks.push({ level, code, title, detail });

  // 只有「确实还有补丁落在没人读的那份目录里」才算数：解包目录已被挪走或
  // 从没打过补丁时，这条风险不存在，不能一直挂着吓人。
  if (facts.sealed && facts.appDirPatched) {
    add(
      "high",
      "ASAR_SEALED_PATCH_INERT",
      "补丁实际未生效：进程读 app.asar，补丁却在 resources/app/",
      "Electron 的加载顺序是 app.asar 优先于 app/ 目录。asar 还在原位，说明补丁改的那份目录没人读；" +
        "同时它还占着一份旧版全套代码，更新时会同新 asar 并存。"
    );
  }

  if (facts.appDirExists) {
    add(
      "high",
      "LEFTOVER_UNPACKED_APP",
      `解包目录在位（${facts.appDirSizeMB} MB），更新时会与新版 asar 冲突`,
      "官方安装器不认识 resources/app/。保留它，更新后你会有两份不同版本的代码在同一目录树里。"
    );
  } else if (facts.movedLeftover) {
    add(
      "low",
      "MOVED_LEFTOVER",
      `已挪开的解包残留还占着 ${facts.movedSizeMB} MB（不再参与加载）`,
      `位置：${facts.movedLeftover}。它不会影响更新，只是白占磁盘，确认更新成功后可删。`
    );
  }

  if (facts.channel && /nightly|alpha|beta|canary/i.test(String(facts.channel))) {
    add(
      "high",
      "PRERELEASE_CHANNEL",
      `更新通道是 ${facts.channel}：拿到的是预发布版本，不是 rc`,
      "预发布线含有明确的破坏性变更（插件接口、工具模式、包导出都改过）。" +
        "这类版本会直接打穿本插件与它写进 profile 的配置。"
    );
  }

  if (facts.hostVersion && facts.patchTarget && facts.hostVersion !== facts.patchTarget) {
    const exact = facts.hostSupported === true;
    add(
      exact ? "low" : "high",
      "HOST_TARGET_MISMATCH",
      `宿主 ${facts.hostVersion} 与插件声明目标 ${facts.patchTarget} 不一致`,
      exact
        ? "宿主自检认为兼容；但 pattern 命中不等于语义正确，更新后仍应重跑诊断。"
        : "插件未声明支持该宿主版本。补丁按字符串替换，命中到语义已变的位置会把代码改坏。"
    );
  }

  if (facts.pluginOnStartupPath) {
    add(
      "high",
      "PLUGIN_ON_STARTUP_PATH",
      "本插件挂在 profile 启动路径上，更新后插件接口一变就是启动崩溃",
      `注册位置：${facts.profilePatchPath || "profiles/<name>/cordis.patch.yml"}。` +
        "崩在启动阶段时，用户看到的是「DSH 打不开」，而不是「某个补丁失败」。"
    );
  }

  if (facts.backupChanged > 0) {
    add(
      "medium",
      "PATCHED_FILES_PRESENT",
      `${facts.backupChanged} 个文件当前处于被改状态，更新前应先还原`,
      "更新器对已修改文件的行为不确定：可能跳过、可能覆盖一半。先 revert 再更新，路径才是确定的。"
    );
  }

  const actions = [
    { order: 1, cmd: "dsh-purge --revert", why: "把 52 个被改文件恢复成 .dshpurge.bak 的官方原文" },
    { order: 2, cmd: "完全退出 DSH 桌面（含托盘/后台进程）", why: "更新器要求没有句柄占用，否则安装会卡住或半途失败" },
    { order: 3, cmd: "删除 resources/app/ 目录", why: "清掉解包残留，让更新器看到单一 asar" },
    { order: 4, cmd: "执行更新", why: "此时目录结构干净，更新失败率最低" },
    { order: 5, cmd: "dsh-purge --diagnose", why: "先看新版本还认不认这些 pattern，再决定要不要 apply" },
  ];

  risks.sort((a, b) => (SEVERITY_ORDER[a.level] ?? 9) - (SEVERITY_ORDER[b.level] ?? 9));
  const level = risks.some((r) => r.level === "high")
    ? "high"
    : risks.some((r) => r.level === "medium")
      ? "medium"
      : risks.length
        ? "low"
        : "clear";

  return { risks, actions, level, checkedAt: new Date().toISOString() };
}

const LABEL = { high: "✗ 高", medium: "! 中", low: "· 低" };

export function renderPreUpdate(report) {
  const L = [];
  L.push("升级前预检 / pre-update check（只读，未改动任何文件）");
  L.push(`整体风险：${report.level === "clear" ? "无已知风险" : LABEL[report.level] || report.level}`);
  L.push("");
  if (!report.risks.length) {
    L.push("✓ 没有检测到已知的升级冲突项。");
  } else {
    for (const r of report.risks) {
      L.push(`${LABEL[r.level] || r.level}  [${r.code}] ${r.title}`);
      if (r.detail) {
        // 详情按句切行，免得一行挤成一条长龙
        for (const line of String(r.detail).split(/(?<=。)/)) {
          if (line.trim()) L.push(`     ${line.trim()}`);
        }
      }
    }
  }
  L.push("");
  L.push("建议动作（按顺序）：");
  for (const a of report.actions) L.push(`  ${a.order}. ${a.cmd}`);
  L.push("");
  L.push("  注：第 3 步之后补丁全部消失，破甲态需要重新 apply；先跑 --diagnose 确认新版本还认这些 pattern。");
  return L.join("\n");
}

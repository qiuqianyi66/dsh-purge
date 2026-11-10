# 规划复审（2026-11-10）：遗漏项与优先级重排（门 1 / 待审批）

- 复审对象：`docs/plans/evolution-roadmap.md`（513ad5d 已推送版本）
- 复审方式：只读实测（隔离副本 + 真身包 CLI + 宿主文件比对），未改任何代码
- 结论一句话：**原 F13 的前提不成立**——#33/#48 不是「宿主改文案导致漂移」，而是「补丁已生效、探测不认 markers 的误报」；另发现 CLI 定位错宿主、诊断 diff 失真、C4 还原链零单测三项遗漏。建议 P0 先修这四个正确性问题，再走 F14→F15。

## 1. 复审基线（实测，非推断）

| 项 | 实测值 | 命令/证据 |
| --- | --- | --- |
| git | main 513ad5d，工作区干净，origin/main 0/0 | `git status --porcelain`、`rev-list --left-right --count` |
| 单测 | 101 tests / 101 pass / 0 fail，exit 0 | 内置 Node `node --test` |
| 诊断 | 82 补丁：36 clean / 2 drifted / 5 dead_target / 1 carrier_missing / 9 optional_missing / 5 skipped_surface / 24 no_carrier | `--diagnose --json`（aiBase = `D:\DeepSeek Harness\...@deepseek-ai`） |
| CLI 状态 | surface=web，插件根指向 `_archived-dsh-browser-20261027`，补丁 3/82 | `--status`（与诊断同一台机、同一时刻） |
| 宿主 #33/#48 载体 | 原文短语 0 次；替换后短语命中：`Proceed with operator-requested paths` 1/2 次、`file access limited under` 1/2 次、`a sandbox notice; continue the task` 1/2 次 | `dsh-tool-bash` / `dsh-tool-pwsh` 的 `lib/index.js` 计数 |
| 备份差异 | `.dshpurge.bak` 与宿主实际只差 **2 行**（索引 243、525）；诊断报 removed 283 / added 283 | 行级对比 vs `diffWindow` 输出 |

## 2. 遗漏与偏差（6 条）

### N1 误报漂移：F13 前提错误（最高优先）
- 证据：`lib/drift.js:114-115` 判 `anyHit → matchable ／ marked("dsh-purge" 字面命中) → marked_only ／ 否则 drifted`，**从不读 `patch.markers`**；而 `#33`（`markersAny` + `a sandbox notice; continue the task...`）与 `#48`（`Proceed with operator-requested paths.`）的 markers 在宿主里都已命中，pattern 却因「已替换」而 0 命中 → 落进 drifted。
- 判定：这不是漂移，是探测口径缺陷。原 F13「一键重应用补命中」按其验收永远达不到（pattern 已不存在，重应用也不会命中），照做只会做出一个空动作。
- 正确做法：`probeCarrier` 先判 markers（与 `core.js:6503 isMarked` 同口径），markers 命中即 `applied_by_marker`，不进 drifted 分母；`#48` 的 `markers` 已足够，`#33` 同上（无需新增）。

### N2 CLI 定位错宿主：状态不可信（硬缺陷）
- 证据：同一台机同一时刻，`--status` 报 `surface web` + 归档目录 + 3/82；`--diagnose` 报活宿主 + 82 载体。
- 根因链：`detectSurface()` 在 node CLI 下判 web → `findAiBase()`（`core.js:2392`）走 `findAiBaseWeb()` → `findAiBaseFromDshHome()` 的 `pnpmHoistAiBases` 先命中 `_archived-dsh-browser-20261027`，**没有过 `rankBases` 的归档/在用排序**；诊断路径走 `rankBases` 才正确。
- 影响：CLI 与无宿主上下文的入口给出的状态、计数、注入判定全部失真（面板内因有宿主上下文不受影响）。

### N3 诊断 diff 多差异合并，输出 283 行噪声
- 证据：该载体实际 2 处改动（相隔 282 行），`diffWindow` 用「公共前后缀」法把两处并成单窗口 → removed/added 各 283 行且 `truncated: true`。
- 影响：F7/F13 面板「官方改了什么」显示无读值；两处以上差异时永远看不出一处一行。
- 修法：改多窗口分组（每处 ±3 行，最多 3 组），保留总量统计。

### N4 C4 还原链零单测（承重墙无回归保护）
- 证据：`test/` 11 个文件，`uninstall|restore|revert` 命中 **0**。
- 风险：`.dshpurge.bak` 是唯一回滚路径，改 `core.js` / `drift.js` 时没有任何用例会红。

### N5 备份基线无新鲜度校验（C4 隐患）
- 现状：bak 与宿主版本无绑定（本次 bak mtime 13:36:52 / 宿主 13:37:22 属同次 apply，正常），但宿主下一次升级后 bak 即过期，此时还原=把旧版代码盖到新宿主。
- 修法：apply 时记录宿主版本+文件指纹，宿主版本变化即标「备份过期」，还原前提示先重扫。

### N6 小项（低优先，登记不扩范围）
- 无 `SECURITY.md`（红队插件公开仓缺负责任披露入口）；`release-notes.md` 89 KB 手工维护无生成脚本；F5b 截图仍卡桌面接管（PIP RDP reason=516）。

## 3. 修正后的优先级（替换原 P2.5 排序）

### P0 正确性修复（1.1.x 收尾必做，合计约 6h）
1. **N1 误报漂移（重定义原 F13）**
   - Given `#33/#48` 载体已含替换文案、markers 命中，When 跑 `--diagnose`，Then 不再计入 drifted；且二次 `--apply` 后载体文件字节数不变（幂等）。
   - 承重墙：触及 C1（drift 判定）；只改判定，不改 pattern/替换文案。
   - 验收：`drifted` 由 2 → 0；新增用例 ≥3（markers 命中→applied_by_marker、markers 未命中+pattern 未命中→drifted、markers 命中+pattern 仍命中→matchable）；101 用例保持全绿。
2. **N2 CLI 宿主定位一致性**
   - Given 归档目录与活宿主并存，When 跑 `--status`，Then `ai_base` 与 `--diagnose` 一致（活宿主），计数口径一致。
   - 承重墙：不改 C2/C3；只改定位排序入口。
   - 验收：status/diagnose 的 `ai_base` 字符串相同；status 计数与诊断分类可对齐（36 clean 等）；新增用例 ≥2（归档目录不得判 live、多 base 排序稳定）。
3. **N4 C4 还原链最小回归测试**
   - Given 已 apply 的载体 + 有效 bak，When 跑还原，Then 文件字节回到 bak；bak 缺失时明确报错不动文件。
   - 承重墙：C4（还原链）——本项只加测试，不改实现；若测试暴露缺陷，另开修复项、不顺手改。
   - 验收：新增用例 ≥4（正常还原、bak 缺失、双 apply 后还原、markers 型补丁还原）；还原后 `node --test` 全绿。

### P1 工程加固（P0 之后）
4. **F14 完整性校验**（原计划保留）：tarball 来源 URL + SHA256；损坏/篡改包在 verify 阶段拦下，不触碰现有安装。
5. **N3 diff 多窗口**：服务 F7 面板可读性；验收=双差异载体输出 2 组窗口。
6. **F15 台账降噪**（扩口径）：除 dead_target / carrier_missing / optional_missing 三分类，另加「CLI 与面板计数口径一致」一条验收。

### P2 可观测自愈（1.2）
7. F16 自检建议化 → F17 启动留痕 → F18 矩阵接真机 → N5 备份新鲜度 → N6 `SECURITY.md`。
8. **F5b 截图**：单列，等桌面接管恢复（main 授权不超时、PIP 不报 516）再拍，不阻塞代码批次。
9. 暂缓不变：F11 配套插件 / F12 目录生态。

### 真机验收批次（依赖宿主重启 + UI，与 P0 并行不了）
F7 断网阶段落点、F8 排除态、F9 一屏展示三项仍 unknown；建议 N1/N2 修完、带新包重装后**一次过**，避免重复重启。

## 4. 承重墙与红线声明

- 触及：C1（N1 drift 判定）、C4（N4 仅加测试）。
- 不动：C2 私网门禁、C3 更新通道常量、C5 合规文案。
- 红线：R1–R6 零违反；本轮不改 LICENSE/NOTICE、不复活死链、不放宽私网、不引入付费/引流。

## 5. 未核实（保持 unknown，不用推断顶替）

- F7/F8/F9 真机表现（面板多行、切换预设、只读宿主 n/a）。
- `agent_teams_*` 会话内可见性（代码侧启动期注册已核实）。
- 桌面壳自身更新回调（宿主黑盒）。
- Teams/桌面接管：PIP RDP 516、main 授权超时。

## 6. 门禁口径（每项过门必须贴证据）

- `node --test`：≥101 通过、0 失败、退出码 0（新增用例后总数随之上升）。
- `npm run compat:check`：退出码 0。
- 改动全在隔离副本；推送前 `git fetch` 核对远端无新提交。

## 7. 审批门 → 已批准（2026-11-10，用户「可以去执行吧」）

## 8. 执行记录（门 2 / 门 3 证据，2026-11-10）

改动（3 项，均在隔离副本；未重装真身包）：

| 文件 | 改动 | 对应 |
| --- | --- | --- |
| `lib/drift.js` | 新增 `markersPresent()`；`probeCarrier` 增 `markers_ok` 与 `applied_by_marker` 判定；`diagnose` 输出 `applied_by_marker`；`renderDiagnose` 增「其中仅 markers 确认」 | N1 |
| `lib/core.js` | 新增 `looksLikeArchivedBase()`；`gatherState` 定位到归档残留时按 `rankBases` 纠偏，state 增 `ai_base_detected` / `ai_base_reassigned` | N2 |
| `test/drift-marker.test.js` | 5 例：markers+改动证据→applied；markers 无证据→仍 drifted（反例）；markersAny 全命中语义；matchable 优先；diagnose 归组 | N1 |
| `test/host-base-select.test.js` | 3 例：归档/回收站/备份路径判残留、活宿主不判残留、空值不谎报 | N2 |
| `test/restore-chain.test.js` | 7 例：bak 拷回（缺失/0 字节）、完好不动、无 bak 不新建、revertAll 还原并删 bak、二次幂等、无 bak 不删目标 | N4 |

判定收紧的一处（复审时发现的原方案漏洞）：只看 markers 会把宿主原生文本（`fetch: true`、`personaPrefix: ""` 之类）误判成「已生效」，因此 `applied_by_marker` 额外要求「purge 动过这个文件」的证据——bak 与本体有差异，或本体带 `[dsh-purge]` 自体标记。实测收紧后 `dead_target` 仍是 5 条，没有被误吸收。

门 3 证据：
- `node --test`：**116 tests / 116 pass / 0 fail**，退出码 0（101 基线 + 15 新增）。
- `node scripts/gen-compat-readme.mjs --check`：退出码 0。
- 真机只读复跑（新代码，宿主 `D:\DeepSeek Harness\...@deepseek-ai`）：
  - `--diagnose`：clean **38**（其中仅 markers 确认 **37**）／drifted **0**（原 2）／dead_target **5**／carrier_missing 1／optional_missing 9／no_carrier 24。
  - `--status`：`ai_base` 与诊断**同一路径**（原为归档目录）；补丁 63/82 已清洗、0 待清洗；备份有；注入 default。

新增待办（本次执行中暴露，归 F15 口径统一）：`--status` 的「63/82 已清洗」按 patch_status 标记口径，`--diagnose` 的 clean=38 按载体探测口径，两者语义不同、数字不可直接对减；F15 需把两套口径写清或统一。

未做（保持 unknown）：真身包未重装（需退出 DSH 走隔离副本 → tgz → 离线重装）；面板内 F7/F8/F9 三项真机验收仍待宿主重启；N5 备份新鲜度、F14 校验未开始。

## 9. 第二批执行记录（N3 多窗口 / F15 口径，2026-11-10）

- **N3 → F21 diff 多窗口**：`lib/drift.js` 的 `diffWindow` 由公共前后缀法改为 patience diff（唯一行锚点 + LIS + 分治），返回 `hunks` 数组，`truncated` 只在本处数超过上限时置位。真机实测 bash 载体 **2 处**（第 244、526 行各 1 行，旧法报 283/283 截断），pwsh 载体 3 处（256/258/499）。
- **F15 口径**：CLI 分母由 `ALL_PATCHES.length` 改为 `patches_total`，输出 `补丁 63/68 已清洗` 并注明「本机不适用 14 条、跳过/缺文件 5 条，不计入分母」，另加一行口径注脚说明与 `--diagnose` 的 clean 按载体探测、两者不可对减；抽 `core.describePatchCounts()` 复用。
- 新增测试：`test/drift-window.test.js` 5 例、`test/status-counts.test.js` 4 例。
- 门 3 证据：`node --test` **125/125 全绿**，退出码 0；`compat:check` 退出码 0；`--status` 实测输出如上。
- 未做：面板侧逐处展开与三类归并视图；F14 来源/证书/SHA256 校验、N5 备份新鲜度、F16/F17/F18 未开始。

## 10. 第三批执行记录（N5 备份新鲜度守卫，2026-11-10）

改动：
- 新增 `lib/restore-guard.js`：`writeBakStamp`/`readBakStamp`（state 目录 `bak-host.json` 记打补丁时的宿主版本）、`hostStampIsStale`、`staleRestoreMessage`、`revertGuard`（没戳的老安装放行并标 `unknown`，不谎报安全）。
- `lib/reapply.js`：`markPatchesApplied` 成功后顺带写宿主版本戳。
- `lib/core.js`：`revertAllHosts` 改为**逐宿主**判版本（可注入 `options.bases` 便于测试），返回 `blocked` 列表；`bin --revert` 加 `--force`，被拦时退出码 1 且不动任何文件。
- `lib/index.js`：`/purge revert`、`revert` 命令、HTTP revert 路由三处统一过守卫，面板返回 409 + `code=stale_backup` + 两个版本号。
- `lib/uninstall.js`：还原链被拦时**跳过还原**、保留 bak、在报告里给 `stale_backup` 与原因（卸载本身不阻断，但绝不用旧片段盖新宿主）。
- 测试：`test/restore-guard.test.js` 6 例（含"没有戳不谎报安全""版本读不到不假拦截"）、`test/restore-guard-hosts.test.js` 2 例（多宿主逐判 + force 放行）。合计 **133/133 全绿**，`compat:check` 退出码 0。

E2E 实测（临时 DSH_HOME + 临时 DSH_BASE，不碰真机）：宿主 0.2.2-rc.1 → 0.2.3 时 `--revert` 输出「宿主版本已变…未做任何还原」，退出码 1，载体与 bak 字节未动；加 `--force` 才还原（内容变 OLD、bak 删除）。

## 11. 事故与恢复记录（必须留痕）

**发生了什么**：第三批做 E2E 验证时，我第一次用了无效的 `DSH_BASE`，`gatherState` 落回**真机活宿主**；此后 `--revert --force` 通过 `revertAllHosts` 枚举到真机宿主并执行了还原——真机 `dsh-tool-bash` / `dsh-tool-pwsh` 的替换文案被写回原文，两份 `.dshpurge.bak` 被删除。守卫当时只看 `state.ai_base`（值为临时宿主），所以没拦住这次越界。

**怎么发现的**：核对载体 mtime 与文案计数，发现 `替换文案 1 → 0`、`bak 存在 → 不存在`，与打补丁后的基线不符。

**怎么恢复**（已全部完成并验证）：
1. `applyPatches(真机 aiBase)` 重打补丁：`applied 55 / already 7 / missing_file 10 / skipped 5 / na 5`，`--status` 回到 `63/68`。
2. bak 重建：按"replace → pattern"反向还原，要求**往返验证**（正向再替换必须字节还原当前文件）、`replace` 在原文件唯一出现、且重建后无 `replace` 残留；重建 40 个。
3. 用 `app.asar` 内的**未污染原始件**做最终校对：解析 asar 头和索引，逐文件比对——37 个与原始件**字节相同**，12 个用原始件覆盖，6 个（user-approval / user-approval-code / fs-sandbox / sandbox-local / base / system-prompt）原始件正向替换后无法还原当前文件，保留往返验证过的重建版本。临时解包目录已删除。
4. 恢复后实测：bak 52 个（`dsh-tool-bash`/`dsh-tool-pwsh` 的 bak 与 asar 原始件字节相同，diff 分别是 2 处 / 3 处各 1 行）、`--status 63/68`、`--diagnose` clean 38（marker-only 37）/ drifted 0 / dead_target 5（#50/#54/#56/#77/#62），与事故前基线一致。

**已修的根因**：守卫从「只看 `state.ai_base`」改成 `revertAllHosts` 里**逐宿主**判版本（新增 `restore-guard-hosts` 测试锁住该行为）。

**残留风险（未做）**：那 6 个文件的 bak 是重建而非原始件，理论上仍可能有"把本来就存在的替换文案误还原"的偏差；宿主重装或下次 `--apply` 会用当前文件重新建 bak，届时该偏差会固化成错误基线——需在真身重装验证时用 asar 再核一遍。

## 12. 第四批执行记录（F14 来源与完整性校验，2026-11-10）

- 新增 `lib/update-verify.js`：`describeSource`（只认 https + 主机白名单 codeload/github/objects，31 位以下 SHA 提取为 pinnedSha）、`sha256Hex`/`checkDigest`（无期望摘要时标 `unverified` 而不是通过）、`tlsChainSummary`（subject/issuer/fingerprint256/有效期，自引用节点止步）、`inspectArchive`（缺 package.json / 多顶层目录 / `..` 穿越）、`preflightArchive`、`formatPreflightDiagnostic`、`archiveVerifyError`、`preflightExpectedSha`（参数优先，其次 `DSH_PURGE_UPDATE_SHA256`）。
- 接线 `lib/update.js`：`requestBuffer` 在**响应头到手时**摘 `getPeerCertificate(true)`（等 `end` 事件取会拿到 `null` socket，实测踩过）；`overlayFromZip` 在写盘/解压/覆盖**之前**跑 `preflightArchive`，失败抛 `StageError(stage=verify)`；解压后再核 `package.json.name === "dsh-purge"`。
- 门 3 证据：`test/update-verify.test.js` 8 例（http/陌生主机拦截、unverified 不冒充通过、摘要不匹配报期望与实际、结构三类问题、解析抛错归类、汇总诊断 stage、证书链摘要、摘要来源优先级）；全量 **141/141 pass，exit 0**；`gen-compat-readme --check` exit 0；`--preupdate --json` 正常输出。
- 真机只读实测（不触碰安装）：codeload `main` 归档 956,873 字节，`ok=true`，TLS 4 级链，顶层目录 `dsh-purge-main`；同一字节末尾追加 3 字节 + 给期望摘要 → `ok=false`，`problems` = SHA256 不一致，诊断首行 `stage: verify`。
- 未做：GitHub 不发布归档摘要，默认 `expectedSha256` 为空 → 报告如实写 `sha256-check: unverified`，这是已知缺口而不是校验通过。




## 13. 第五批执行记录（F16 建议化 / F17 留痕，2026-11-10）

- F16：`lib/selfcheck-advice.js` 把诊断结果翻成建议清单（七类目录、按处置优先级排序、双语、带命令）；`renderDiagnose` 末尾追加「下一步 / Next steps」段，`--diagnose --json` 每条报告附 `advice_items` / `advice_summary`。`dead_target` 与 `stale_backup` 标 `irreversible: true`，全程只建议不自动跑。
- F17：`lib/selfcheck-log.js` 写 JSONL 到 `DSH_HOME/dsh-purge/logs/selfcheck.log`，按键名黑名单剔除 token/secret/cookie 等、字符串截 160、数组截 12；超 512 KB 轮转 `.1`/`.2`；任何异常返回 `ok:false` 不外抛。接线 `applyPatchesAllHosts`（apply）、`revertAllHosts`（revert，含被拦数）、`settleInstalledPatches` 外层（boot）。
- 门 3 证据：`test/selfcheck-advice.test.js` 6 例 + `test/selfcheck-log.test.js` 6 例；全量 **153/153 pass，exit 0**；`node --check lib/index.js` exit 0；`compat:check` exit 0；真机 `--diagnose` 末尾实测出现建议段（`有 1 条需要处理…`）。
- 未做：面板侧未把 `advice_items` 渲染成可点按钮；`--diagnose` 仍不写日志（漂移无痕，只能靠 apply/revert/boot 追）。
## 14. 真身适配记录（R5：隔离副本 → tgz → 离线重装，2026-11-10）

- 打包：从隔离副本按 `package.json` 的 `files` 口径暂存（`lib/bin/docs/presets/scripts/client.js/cordis.patch.yml/package.json/README/LICENSE/NOTICE/screenshots.json/CONTRIBUTING.md`），排除 `lib/default-prompt-inject.md`（构建期 embed，运行期不读）与 `docs/plans`；再把真身包里的 `docs/notice`、`docs/preview` 资产合并进包（隔离副本没有这两处图片）。产物 `package/` 前缀的 tgz，102 文件 / 2,015,917 字节。
- 自检：tgz 解包后与暂存目录逐文件 SHA256 比对，91→102 文件全部一致、0 差异；包内无 `.git`、无 lockfile。
- 安装：真身包先整体复制到 `desktop\runtime\dsh-purge-reinstall-backup\20261110-212654`（98 文件，与旧包逐项一致），把 `node_modules\dsh-purge` 改名为 `.old-20261110` 挪开，解包（`--strip-components=1`）后放回原位，重建空的 `node_modules\.bin`，核验备份 98 = 旧包 98 后删除 aside。
- 验证（真身路径直接跑）：四新模块就位（`restore-guard.js`/`update-verify.js`/`selfcheck-advice.js`/`selfcheck-log.js`）；`--status` → 插件根指活宿主、宿主 0.2.2-rc.1、`补丁 63/68`；`--diagnose --json` → `clean=38 / drifted=0 / dead_target=5`，`advice_items=4`，`summary=有 1 条需要处理…`。
- 未随装：`client.js` 未含 `stale_backup` / `hunksTotal` 文案——面板侧建议按钮与 diff 逐处展开仍是未做项，故包内前端行为不变。
- 生效条件：插件在 DSH 启动时加载，需重启 DSH 才会用上新代码；本机当前无 DSH 进程在跑。
## 15. 门 4 专家评审与 1.1.84 正式版发布（2026-11-10）

评审范围：`513ad5d..HEAD`（25 文件、+1830/-47），六维结论：

| 维度 | 结论 | 依据 |
| --- | --- | --- |
| 正确性 | 通过 | 158/158 全绿；drift 收紧、patience diff、逐宿主守卫均有正反双向用例；真机 63/68、clean=38/drifted=0 |
| 性能 | 通过 | patience diff 带深度 >12 兜底；日志/事件均有截断与 512 KB 轮转；无新增热路径 IO |
| 安全 | 通过 | 更新只认 https 白名单 + 摘要校验（unverified 不冒充通过）；日志按键名黑名单脱敏；攻击面仍限回环/私网；无新增依赖 |
| 一致性 | 通过 | package.json version = COMPAT_CURRENT.plugin（测试锁死）；README 适配表由矩阵生成、compat:check exit 0；双口径文案显式注明不可对减 |
| 可维护 | 通过 | 无 debugger/TODO 真残留（扫描命中均为中文注释误报）；新模块单一职责、纯函数可测；历史遗留项已登记不扩范围 |
| 架构 | 通过 | 承重墙（C1–C5）未改契约；探测只给证据不自动改写静态矩阵；R5 隔离/重装流程留痕 |

- 🔴 零残留、🟡 清零：本次变更未引入新的 🟡；历史 🟡 按既有登记保留，不属本次范围。
- 版本：1.1.84-rc1 转正为 **1.1.84**（不跳号，去掉 rc 后缀），release-notes.md 首行已更新为 `# 1.1.84`。
- 发布：推送 main 后由 release.yml 自动建 tag `v1.1.84` 与 GitHub Release（非 rc 不带 prerelease 标记），并上传 zip 归档。
- 门 5 待办：DSH 重启后冒烟（面板加载、status/diagnose、无回归）；真身包需再按 R5 重装 1.1.84 构建。
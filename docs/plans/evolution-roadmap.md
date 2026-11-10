# dsh-purge 进化规划（门 1：需求分析 / 待审批）

- 维护者：qiuqianyi66
- 基线版本：1.1.84-rc1（适配 DSH 0.2.2-rc.1）
- 发布状态：**1.1.84 正式版已发布（2026-11-10，tag v1.1.84）**——rc1 转正、不跳号；门 4 六维评审通过，158/158 全绿，证据见 review 文档第 15 节。
- 状态：**已批准执行**。P1 批次 F3/F4/F5/F6 已完成并推送（基线 74/74 全绿，test.yml 门禁绿，贡献模板、README 首屏对齐、依赖口径确认）；P0 F1 真身包已同步 fork/main 并重启验收通过，F2 遗留项代码侧复核完成（teams 启动期注册已核实；壳自身更新回调属宿主黑盒维持 unknown，见 F2 段）；P2 F7 分阶段失败诊断已在隔离副本实施（84/84 全绿，待真机断网场景验收）；F8 预设排除已实施（91/91 全绿，待真机切换预设验收）；F9 状态自检面板兼容级别四态已实施（96/96 全绿，待真机一屏验收）；F10 兼容矩阵门禁已实施（101/101 全绿，compat:check 接入 test.yml）。后续路线：P2.5 余项（F14 完整性校验 / F15 台账降噪与口径统一 / diff 多窗口）→ P2.6 可观测自愈（F16 建议化 / F17 留痕 / F18 矩阵接真机 / 备份新鲜度）→ P3 生态暂缓；版本节奏 1.1.x 收尾修漂移补校验，1.2 做自检建议化与留痕。**2026-11-10 规划复审后已执行 P0 正确性批次：F13 前提修正（漂移误报）落地、新增 F19 CLI 宿主定位一致性、F20 还原链回归测试，合计 116/116 全绿，真机 drifted 2→0 且 `--status` 与诊断同 base（证据见 `docs/plans/roadmap-review-20261110.md`）。** **2026-11-10 第三批：N5 备份新鲜度守卫已实施（`bak-host.json` 版本戳 + `--revert` 先比版本 + `--force` 放行 + 面板 409 `stale_backup` + 卸载跳过还原不阻断），133/133 全绿；同批补上 `revertAllHosts` 逐宿主守卫（该缺口曾导致一次真机补丁被误还原，恢复与事故记录见 review 文档第 10、11 节）。** 下文第 1 节为门 1 基线快照（2026-11-09 值）。
- 证据口径：数据来自本机隔离工作副本实测 + GitHub API 实查（2026-11-09）；推断项已标注 `unknown`。

## 1. 基线实测（我方现状）

| 维度 | 实测值 |
| --- | --- |
| 版本 / 兼容 | 1.1.84-rc1，dshTarget 0.2.2-rc.1 |
| 代码模块 | lib 42 个文件；6 个 scripts；1 个预设（redteam） |
| 测试 | 7 个测试文件 / 74 用例，73 过，1 失败（settleMayReapply，基线遗留） |
| CI | 仅 1 个 release.yml；无测试门禁工作流 |
| 依赖锁定 | 无 lockfile；运行时无第三方直接依赖，peerDependencies 仅 `@deepseek-ai/cordis` |
| 文档 | 4 个 docs 文件；三语 README；无 CONTRIBUTING / issue 模板 |
| 仓库热度 | 1 star / 0 fork / 0 issue（新发布） |
| 合规 | Apache-2.0；LICENSE/NOTICE 保留原始版权行；署名文字化，无死链 |

## 2. 竞品横纵对比

### 2.1 直接对标：kingcharleslzy-ai/dsh-purge（社区版）

| 维度 | 竞品 | 我方 | 差距判断 |
| --- | --- | --- | --- |
| 版本线 | 1.6.86，连续发版 | 1.1.84-rc1 | 功能代差，非短期可追平 |
| 测试 | 564 用例 / 99 测试文件，CI 全绿 | 74 用例 / 7 文件，1 基线失败 | 用例厚度差距大 |
| 宿主补丁 | 宣称 86 条补丁、25 层状态自检 | 单补丁链 + 状态有限回显 | 自检深度不足 |
| 安装/更新 | 独立安装器：分阶段诊断、有限重试、curl 备用、来源/证书/SHA256 校验 | 面板内更新 + tarball 安装，失败仅回显错误文本 | 诊断与校验能力缺失 |
| 预设管理 | `excludePresets` 按预设排除提示词注入 | 仅 redteam 预设，无排除机制 | 缺灵活度 |
| 面板 | 左侧栏整页设置；回退菜单锚点定位；兼容级别翻译 | 清洗面板 + 命令路由 | 面板交互较薄 |
| 工程化 | 5 个工作流（community/contributors/market/native-panel/release）；package-lock；CONTRIBUTORS；NATIVE-PANEL 文档 | 1 个 release 工作流；无 lockfile；无贡献文档 | 工程门禁与文档体系缺失 |
| 目录生态 | market/、packages/、skills/、51 个 docs | 无 market/packages；docs 4 个 | 生态位未铺开 |
| 配套产品 | 配套 dsh-qwen-studio 本机出图插件，跨仓引流 | 无 | 无交叉引流 |
| 许可证 | LICENSE 为 MIT，Copyright 小杨 | Apache-2.0，保留原始版权 | **竞品把 Apache-2.0 代码重授权为 MIT，属不合规；我方不跟随** |
| 上游署名 | README 链接 `YuJunZhiXue/dsh-purge`（实测仍 404，死链） | 文字署名 YuJunZhiXue，无死链 | 我方口径更稳 |

### 2.2 其他同类仓库（格局，非直接对标）

| 仓库 | 类型 | 说明 |
| --- | --- | --- |
| mmparko/dsh-purge | 全量镜像 | 3679★，存档性质，不改代码 |
| WoYun520/dsh-purge | 镜像 | 563★，全量历史 |
| ZXEB / realMisakaMikoto / evilevil / luowang-ui | 旧版适配 | 1.1.71 ~ 0.2.1-rc.x 单点适配 |
| ZiPengWei / xiaoshe1337-star | 激进路线 | 文案偏「do everything」、带 QQ 群引流；**不对标、不复制** |
| dream12347/dsh-session-manager | 相邻插件 | 会话管理方向，可作为后续生态参考 |

## 3. 承重墙（触及必须显式声明，默认不改）

- **C1 补丁命中与幂等**：core.js / reapply.js / settle-policy.js 的补丁锚点、二次 apply 幂等、drift 判定。
- **C2 私网门禁**：net-scope.js 回环/RFC1918 判定、域名解析校验、hosts 防绕过。
- **C3 更新通道**：update.js 的 REPO / STABLE_REF / BETA_REF、通道状态与历史记录、回滚钉选。
- **C4 还原链**：uninstall.js / restore 流程 / `.dshpurge.bak` 备份与恢复、桌面/Web 重启。
- **C5 合规边界**：LICENSE、NOTICE、署名章节、倒卖禁令与外挂禁令文案。

## 4. 红线（零违反）

- **R1** 保留 Apache-2.0 与 LICENSE/NOTICE 原始版权声明；禁止改 MIT 或任何形式重授权。
- **R2** 不出现已 404 的上游 GitHub 链接、TG 频道链接；上游署名只用文字。
- **R3** 攻击面仅限本机回环与 RFC1918 私网；禁止任何公网放行或域名白名单放宽。
- **R4** 禁止倒卖、收费挂群；不做付费版本。
- **R5** 本机已安装真身包不在运行中直接改动；任何代码改动走「隔离副本 → 打包 → 离线重装」流程。
- **R6** 不复制竞品的 MIT 重授权、QQ 群引流、激进「do everything」文案。

## 5. 进化路线（按优先级，单任务粒度 ≤4h）

### P0 合规与基线加固

#### F1 本机真身包同步 fork 源（运维项，非新功能）
- 现状：本机已装真身包仍指向上游 master，面板「检测更新」报 404。
- Given 隔离副本已切到 qiuqianyi66/dsh-purge main，When 退出 DSH 后用内置 Node/pnpm 重打 tgz 离线重装，Then 真身包 update.js REPO/STABLE_REF 指向 fork main，面板更新检查可读到版本。
- 依赖：R5 流程；前置备份 profile 与 Cookies。
- 验收：真身包 `lib/update.js` 常量 = fork/main；host 重启后无新 crash 日志。

#### F2 遗留项实测闭环
- Given 现有遗留未验证项，When 重启验收，Then 逐项给出实测结论（通过 / 失败附日志 / 标 unknown）。
- 范围：teams（@nanmicoder/dsh-agent-teams）子代理功能；桌面壳自动更新回调；7 条历史 `missing_file` 空目标确认。
- 验收：产出结论清单，不扩功能范围。
- 代码侧复核（2026-11-09，非真机运行态）：
  - **teams 工具注册**：已核实为启动期注册，非会话内惰性注册。`@nanmicoder/dsh-agent-teams` 在 `apply(ctx)` 内调用 `registerAgentTeamsTools(ctx, resolved)`，把 14 个 `agent_teams_*` 工具（见 `lib/tool-names.js`）注册进共享 tools 注册表；`inject: ['tools','llm','subagents','systemPrompt','agents']`。真机会话内实际可见性仍未在 DSH 会话内复现，保留运行态 unknown。
  - **桌面壳自动更新回调**：插件侧 `autoUpdateIfNeeded()` 已被钉成 `skipped: "manual-only"`（`lib/update.js`），启动路径永不自动升，更新只走面板手动触发；`cordis.patch.yml` / `lib/index.js` 的 `autoUpdateOnStart: false`。桌面壳（Electron / app.asar 主程序）自身是否另有更新回调，不在本仓库代码内，属宿主黑盒，维持 unknown。
  - 7 条历史 `missing_file` 空目标（#76/#71/#28/#30/#31/#64/#65）保持 pending/skipped，本轮不动。


### P1 工程质量与可发现性（低成本，先做）

#### F3 测试门禁 CI 工作流
- Given 主分支有 `node --test` 基线，When 推送 main 或开 PR，Then CI 跑全量测试并输出用例数/失败数，退出码反映结果。
- 前置：基线失败用例 settleMayReapply 必须先修复或显式标记 expected-fail，否则门禁不绿。
- 验收：Actions 出现测试工作流记录；README 可挂 passing 徽章；无第三方依赖安装步骤。

#### F4 贡献与问题模板
- Given 仓库公开、issues 已开启，When 外部用户提 issue / PR，Then 有模板引导填写：环境版本、DSH 版本、复现步骤、日志截图、是否本机靶场。
- 产物：`.github/ISSUE_TEMPLATE/`（bug / 功能建议）、`.github/pull_request_template.md`、简短 `CONTRIBUTING.md`（安装、测试、提交约定、署名要求）。
- 验收：远端模板在新建 issue 页面可见。

#### F5 README 首屏信息对齐
- Given 三语 README 已有一句话定义与关键事实，When 访问仓库首页，Then 首屏可见：当前版本、DSH 兼容范围、许可证徽章、测试/发布徽章、最近更新点、维护者与上游署名。
- 验收：英文 README 首屏信息齐全；中/日同步最小子集；无死链。

#### F6 依赖口径确认（不默认提交 lockfile）
- 现状：无第三方运行时直接依赖。Given 仅 peerDependencies cordis，When 评审打包清单，Then 确认是否提交 lockfile；推荐不提交，保持零直接依赖外观。
- 验收：`package.json` peerDependencies 与实际 import 一致；files 字段不含 test/草稿文档。

#### F5b README 面板截图刷新（部分完成，待补拍）
- 背景：旧 `dock-clean.png`（v1.1.31 / 44/44）与 `settings.png`（31/32、8/9）带过期版本号与补丁计数，与当前 1.1.84-rc1 / 0.2.2-rc.1 事实矛盾。
- 本轮：从三语 README 与 `screenshots.json` 移除这两张并 `git rm`；保留无版本戳的 `dock-drill.png` / `rules.png`。
- 二次复核（2026-11-09）：`dock-auth.png` 拍的是旧中文三段免责声明，当前打包的授权弹窗为英文八段（`docs/drill-auth-legal.html` 与 `client.js` 内嵌常量一致），已过时，一并从 README 与 `screenshots.json` 移除并 `git rm`；`own-servers.png` / `own-servers-en.png` 拍的是已下线的可编辑名单面板（前端不再渲染 textarea/保存按钮，后端 `/own-servers` 路由与 `ownServers` 状态为遗留残留），同样移除并 `git rm`。
- 三次复核（2026-11-09，用户决策）：剩余 `dock-drill.png` / `rules.png` 一并 `git rm`，`screenshots.json` 置空；README 不再挂任何面板截图，改用功能表格。同时按用户本人风格（对齐 yg-gateway / tea-ceremony：居中双语标题、中文优先、事实表格、单册）把三语分册合并为单个 `README.md`，删除 `README.zh-CN.md` / `README.ja.md` 及 `package.json.files`、`lib/update.js` COPY_NAMES 中的对应条目；10 条合规法条段保留。
- 已修复（2026-11-09）：`client.js` 中 `ownServers`/`ownLoaded` 死状态、`own.save` 死 i18n（中英两条）及 loadAll 里只写不读的 `GET /dsh-purge/own-servers` 调用已删；`lib/index.js` 的 `/dsh-purge/own-servers` GET/POST 路由及 net-scope 相关 import 已移除。前端无其他调用方，测试无覆盖，74 用例全过。
- 已修复（2026-11-09，内部死链清完）：`lib/net-scope.js` 的 `readAllowText`/`writeAllowText`/`readAllowExact`/`allowDecision`/`normalizeAllowText`/`allowFilePath`/`entryHost`/`ownServerNote`/`permittedHost`/`isOwnNetwork`/`HOST_NAME` 及随之失效的 `fs`/`path` import 全部移除；`lib/identity.js` 同步删除 `ownServerNote` import、`withOwnServers` 透传分支、`OWN_SERVER_MARK`，`injectNeedles` 简化为单文本，调用点直连。74 用例全过。
- 已修复（2026-11-09）：授权声明第 6 节 "MIT License" 已改为 "Apache License 2.0"，`docs/drill-auth-legal.html` 源文件与 `client.js` 内嵌 `AUTH_LEGAL_HTML` 常量同步；`docs/notice/` 下 4 张未被引用的照片已 `git rm`，目录移除。
- 阻塞：桌面接管不可用——PIP 虚拟桌面 RDP reason=516（提示需重启 Windows），main 独占授权超时；未能在 DSH 会话内打开清洗/补丁面板重新实拍。
- 待办（GWT）：Given 桌面控制恢复，When 在本机 DSH 打开 dsh-purge 清洗页与补丁列表，Then 仅裁剪面板区域、不含会话/账号信息，替换回 `docs/preview/` 并在单册 README 与 screenshots.json 重新登记；截图内不写死会漂移的补丁计数，版本戳以当前发版为准。

### P2 功能补齐（中等成本，P1 之后）

#### F7 安装/更新失败分阶段诊断
- Given 更新或安装失败，When 面板报错，Then 错误信息区分：下载阶段（网络/代理/证书）、校验阶段（SHA256/解压）、注入阶段（补丁命中/drift）、重启阶段；附可复制的脱敏诊断片段。
- 边界：不自动改代码、不自动重启宿主；失败不触碰现有安装。
- 验收：构造离线/断网场景，错误落到对应阶段并给出明确下一步。
- 已实施（2026-11-09）：新增 `lib/update-diagnose.js`——阶段归类 `classifyError`（network/verify/inject/restart/unknown）、`buildDiagnostic` 脱敏片段（剥盘符绝对路径与用户名）、`StageError`/`wrapStageError` 保留原始 cause。`lib/update.js` 在下载覆盖、reapply 失败、`handleUpdateOp` 出口包阶段；业务失败返回体带 `stage`/`diagnostic`。`lib/index.js` 的 update GET/POST 路由 500 回传 `stage`/`diagnostic`。`client.js`：`apiJson` 把 stage/diagnostic 挂到错误；update 错误文案按阶段给下一步提示（中英字典）；`noticeNode` 支持多行展示诊断片段。
- 测试：`test/update-diagnose.test.js` 10 例覆盖五类归类、脱敏、cause 保留、阶段顺序；全量 84/84 全绿（基线 74 + 新增 10）。
- 未覆盖（待真机验收，标 unknown）：离线/断网真机场景的阶段落点与面板多行展示；SHA256 校验当前代码链未落地，verify 阶段按归档/缺包/损坏归类。

#### F8 预设排除（excludePresets）
- Given 用户使用 roleplay/minimal 等非 redteam 预设，When 配置排除名单，Then 这些预设不注入 Purge 提示词，仍保留面板、命令与工具；切换预设、并行会话、子 Agent 与宿主兜底都遵守排除。
- 承重墙：C1 补丁链不动；排除只作用于提示词注入层。
- 验收：加一条配置用例 + 一条回归用例；切换预设后注入状态符合配置。
- 已实施（2026-11-09）：新增 `lib/exclude-presets.js`——`normalizePresetId`（去目录前缀/`preset-` 前缀、小写）、`presetMatchesRule`（尾部 `*` 通配）、`isPresetExcluded`；`loadExcludePresets` 文件优先 + 宿主 config 补充合并去重，`saveExcludePresets` 整体替换。`lib/core.js` 加缓存三件套 `refresh/get/setExcludePresetsSettings`、`setExcludePresetsConfigValue`、`isPresetExcludedByConfig`。`lib/index.js`：`rewriteLiveAssembly` 用 `injectEnabled = enabled && !excludedPreset` 闸住 full/localInject/policy/dropWorkspaceBaseline/redteam；`injectAllowedNow(config, context)` 加排除判定，三处 section 回调传入 context；status 暴露 `exclude_presets`；新增路由 `/dsh-purge/exclude-presets`（GET 读、POST 校验 string[] 后整体写回）；启动灌入 config 值并刷新缓存；DEFAULTS 加 `excludePresets: []`。
- 测试：`test/exclude-presets.test.js` 7 例覆盖归一化、精确/通配命中、文件+config 合并去重、整体替换剔除非字符串、损坏 JSON 回退；全量 91/91 全绿（基线 84 + 新增 7）。
- 未覆盖（待真机验收，标 unknown）：切换预设/并行会话/子 Agent 下的排除态实测；宿主 hung 兜底（`__dshPurgeHungPrompt` 注入钩子）在排除预设下仍会挂提示词，属 C1 补丁链层，本次未改，后续按需评估。

#### F9 状态自检面板
- Given 用户打开面板，When 读取状态，Then 一屏给出：补丁是否应用、注入是否就位、备份是否存在、当前版本/通道/钉选、兼容级别（已定位 / 仅内核校验 / 未定位 / 未知），每项附证据而非「应已生效」。
- 验收：状态项与实际落盘文件/校验清单对应；Web 宿主只读失败时显示 n/a，不谎报。
- 已实施（2026-11-09）：`lib/core.js` 新增纯函数 `compatLevelFromState(state)`，把现有信号归为四态——`located`（已定位且版本精确匹配）/`kernel-only`（定位到宿主但版本未能比对）/`unsupported`（版本已知但不在适配目标）/`unknown`（未定位宿主或读取失败，不谎报），每态附 evidence 判定依据。`lib/index.js` status 负载新增 `host_compat_level` 与 `host_compat_evidence`；`client.js` 指标区新增兼容级别卡片，悬停展示证据，中英文案齐备。补丁应用数、备份、shim、注入就位等状态项沿用既有落盘/校验证据链路。
- 测试：`test/compat-level.test.js` 5 例覆盖四态归类 + unknown 优先于已知标记；全量 96/96 全绿（基线 91 + 新增 5）。
- 未覆盖（待真机验收，标 unknown）：面板真机一屏展示与证据文案核对；Web 宿主只读失败路径的 n/a 展示未在真机复现。

#### F10 兼容矩阵门禁
- Given 兼容表列了 DSH 版本与对应插件版本，When 发版前跑核对，Then 表内版本与 `package.json` dshTarget、实测可运行版本一致；过时条目标 unknown 而非保留。
- 验收：新增/升级 DSH 版本时有一处单一事实来源（compat 配置），README 表格由其生成或人工核对留痕。
- 已实施（2026-11-09）：单一事实来源为 `lib/compat-matrix.js`，导出 `COMPAT_CURRENT`（当前 supported 行）与 `COMPAT_MATRIX`（历史/非目标行），每行含 `dsh / plugin / status / note`；`validateCompatMatrix()` 校验恰好一条 supported、字段合法。`scripts/gen-compat-readme.mjs` 从矩阵渲染 README 适配表（`--check` 仅比对不一致即退出 1）；`package.json` 新增 `compat:check` 脚本，`test.yml` 在单测前加一步门禁。
- 门禁测试 `test/compat-matrix.test.js` 5 例：矩阵内部一致、`dshTarget` 与矩阵当前行 dsh 一致、`version` 与当前行 plugin 一致、README 表未漂移、非目标条目标 unknown 不保留旧承诺。
- 测试：全量 101/101 全绿（基线 96 + 新增 5）；`compat:check` 退出码 0。
- 未覆盖（标 unknown）：矩阵未接真机实测版本探测；`0.2.0-rc.2 / 0.1.7` 旧线插件版本号为历史登记，未在本机复跑验证。

### P2.5 质量与可维护性加固（1.1.x 收尾，优先于功能扩张）

> 原则：以真实缺陷驱动测试与补丁增长，不追竞品 564 用例 / 86 补丁 / 25 层自检的数量指标。

#### F13 漂移修复闭环（**2026-11-10 前提修正并已实施**）
- 前提修正：#33/#48 实测**不是**宿主改文案造成的漂移，而是补丁已生效后 pattern 必然 0 命中、旧判据又不认 `patch.markers` 造成的**误报**（宿主 bash/pwsh 文件里替换后文案均命中、原文短语 0 次）。原「一键重应用补命中」按其验收永远达不到，重应用是空动作。
- Given 载体已含替换文案且 markers 命中、bak 与本体有差异，When 跑 `--diagnose`，Then 判 `applied_by_marker`（计入 clean、单列「仅 markers 确认」），不计入 drifted；二次 `--apply` 不重复写入。
- 验收：真机 drifted 2 → 0（实测已达成）；`node --test` 116/116；反例（去掉 markers 判定、去掉改动证据位）必红。
- 已实施（2026-11-10）：`lib/drift.js` 增 `markersPresent`、`probeCarrier` 增 `markers_ok` 与证据位（bak 差异或 `[dsh-purge]` 自体标记，防宿主原生文本误判）；`diagnose` 增 `applied_by_marker`；`renderDiagnose` 增计数展示。测试 `test/drift-marker.test.js` 5 例。
- 未覆盖（unknown）：真机面板漂移列表文案未复看（需重装新包并重启宿主）。

#### F14 来源与完整性校验（verify 阶段落地）
- Given 升级包/解压/注入任一环节失败，When 归类失败阶段，Then 补上来源 URL、证书链与 SHA256 完整性校验；当前 verify 阶段仅按归档/缺包/损坏归类，缺真校验。
- 验收：损坏/被篡改包在 verify 阶段被拦下并给明确诊断；合法包不受影响；校验失败不触碰现有安装。
- 已实施（2026-11-10）：新增 `lib/update-verify.js`（ `describeSource` 只认 https + 主机白名单、`sha256Hex`/`checkDigest`、`tlsChainSummary`、`inspectArchive` 查缺 package.json / 多顶层目录 / 路径穿越、`preflightArchive` 汇总、`formatPreflightDiagnostic` 出 `stage: verify` 诊断、`preflightExpectedSha` 读 `DSH_PURGE_UPDATE_SHA256`）。`lib/update.js` 在下载后、解压与覆盖之前插入前置校验，失败抛 `StageError(stage=verify)`；`requestBuffer` 在建连时摘证书链（等 `end` 事件再取只会拿到 null socket，实测踩过）；解压后再按 `package.json.name !== "dsh-purge"` 复核包身份。
- 证据：`test/update-verify.test.js` 8 例，全量 141/141 全绿；真机只读实测 codeload `main` 归档 ok=true（956 KB、TLS 4 级链、顶层 `dsh-purge-main`），末尾追加 3 字节并给期望摘要 → ok=false，诊断 `sha256-check: mismatch` 带期望/实际对照。
- 未做：`expectedSha256` 没有可信默认来源（GitHub 不发布归档摘要），未给期望值时报告如实标 `sha256-check: unverified`；发布侧 SHA256SUMS 的分发机制尚未设计。

#### F15 状态台账归并与降噪
- Given 诊断长期累积可选缺失、死目标、载体缺失条目，When 跑状态汇总，Then 区分"宿主已删载体 / 本机未装预设 / 可选不适用"三类，死目标与缺载体不混入待清洗分母，避免噪声累积。
- 验收：状态面板/CLI 输出按三类分组；当前 5 死目标（#50/#54/#56/#77/#62，均 optional）、1 载体缺失（#71 liangshen 预设）、9 可选缺失有明确归类口径。
- 补充（2026-11-10 实测发现）：`--status` 的「63/82 已清洗」按 patch_status 标记口径，`--diagnose` 的 clean=38 按载体探测口径，两套数字语义不同、不可直接对减；本项需给出统一口径或明确标注差异，避免用户拿两个数字互相质疑。
- 已实施（2026-11-10）：CLI 分母改为 `patches_total`（63/68，排除 14 条本机不适用 + 5 条跳过/缺文件），并加一行口径注脚说明与诊断不可对减；抽 `core.describePatchCounts()` 供 CLI 复用，`test/status-counts.test.js` 4 例。
- 未做：面板侧死目标/缺载体的分组文案仍用诊断数组，未合成三类归并视图。

#### F21 诊断 diff 多窗口（原 N3，2026-11-10 已实施）
- Given 宿主同一文件里有两处相隔数百行的改动，When 输出漂移证据，Then 报成多个独立窗口，而不是「官方重写整段」。
- 根因：`diffWindow` 用公共前后缀法，两处改动之间的所有行都被算进替换段（本机 bash 载体真实差异 2 行，被报成 removed 283 / added 283 / 截断）。
- 已实施：改走 patience diff（唯一行锚点 + LIS + 分治），返回 `hunks` 数组；实测 bash 载体 2 处（第 244、526 行各 1 行），pwsh 3 处；`test/drift-window.test.js` 5 例（含「还原前后缀法必红」的反例组）。
- 未做：面板侧仍只展示第一处与前 6 行，未做逐处展开。

#### F19 CLI 宿主定位一致性（新，2026-11-10 已实施）
- Given 归档目录（`_archived-*`）与活宿主并存，When 跑 `--status`，Then `ai_base` 与 `--diagnose` 指向同一活宿主，不再落到归档 pnpm 虚拟 store。
- 根因：CLI 在 node 下 `detectSurface()` 判 web → `findAiBaseWeb()` 顺 profile 的 pnpm 软链走进 DSH_HOME 下归档 store，而诊断走 `rankBases` 才排对；同一台机两套结论（实测 3/82 与 82 载体）。
- 已实施：`lib/core.js` 增 `looksLikeArchivedBase()`，`gatherState` 定位到归档路径时按 `rankBases` 纠偏，state 暴露 `ai_base_detected` / `ai_base_reassigned`。测试 `test/host-base-select.test.js` 3 例。实测 `--status` 已与诊断同 base。
- 边界：不改 web/desktop 面判定（`detectSurface` 与 adapter 分流保持原样），只纠「归档不优先」。

#### F20 还原链回归测试（新，2026-11-10 已实施）
- Given C4 还原链此前零测试（`test/` 内 uninstall|restore|revert 命中 0），When 改 `core.js`/`drift.js`，Then 还原语义有可执行回归。
- 已实施：`test/restore-chain.test.js` 7 例（bak 拷回、0 字节自愈、完好不动、无 bak 不新建、revertAll 还原并删 bak、二次幂等、无 bak 不删目标）；全部在临时 DSH_HOME 上跑，不触碰真机安装。
- 未覆盖：uninstallPurge 整链（含 profile 摘除、rules 重置）仍无集成测试，宿主升级后 bak 过期场景见 N5。

### P2.6 可观测与自愈（1.2 方向）

#### F16 自检建议化
- Given 面板读出漂移/缺失/未适配状态，When 用户查看，Then 每条问题附可执行下一步（重应用 / 换预设 / 忽略），而不仅是状态回显。
- 验收：状态卡片带动作入口；建议文案中英双语；不自动执行不可逆动作。
- 已实施（2026-11-10）：新增 `lib/selfcheck-advice.js`（`ADVICE_CATALOG` 七类 + `buildSelfcheckAdvice` 按「漂移→目标消失→载体缺失→备份过期→仅 markers→可选缺失」排序 + `renderAdviceLines` 双语带命令 + `advicePayload` 面板结构）；`renderDiagnose` 末尾追加建议段，`--diagnose --json` 每条报告带 `advice_items` / `advice_summary`；涉及不可逆的条目（`dead_target` / `stale_backup`）显式标 `irreversible: true`，全部只给建议不自动执行。
- 证据：`test/selfcheck-advice.test.js` 6 例；真机 `--diagnose` 末尾实测输出「有 1 条需要处理（carrier_missing × 1 …），其余可忽略」，并列出 `applied_by_marker × 37` 与 `optional_missing × 9` 的处置说明。
- 未做：面板侧尚未把 `advice_items` 渲染成可点动作按钮（当前只随 status 载荷下发结构）。

#### F17 启动自检留痕
- Given 每次 apply / revert / 漂移发生，When 写入本地日志，Then 可追溯时间、动作、命中/漂移结果，便于回滚定位与真机复盘。
- 验收：本地状态目录有结构化日志；日志不写敏感凭据；轮转避免无限增长。
- 已实施（2026-11-10）：新增 `lib/selfcheck-log.js`（JSONL 落 `DSH_HOME/dsh-purge/logs/selfcheck.log`；`sanitizeSelfcheckEvent` 按键名黑名单剔除 token/secret/cookie 等并对字符串截断 160、数组截 12；`appendSelfcheckEvent` 超 512 KB 轮转成 `.1`、`.2`；写失败只返回 `ok:false` 不抛）。接线三处：`core.applyPatchesAllHosts`（apply 事件带每宿主 summary）、`core.revertAllHosts`（revert 事件带被拦数量）、`lib/index.js` 启动 settle 外层（boot 事件带 outcome/scope）。
- 证据：`test/selfcheck-log.test.js` 6 例（含坏行跳过、轮转、写不进去不抛）；临时 home 冒烟写入读回 1 条 `outcome=already-clean`；全量 153/153 全绿。
- 未做：`--diagnose` 本身仍只读不写日志（漂移发生时不落痕，靠 apply/revert/boot 三条路径），是否让诊断也留痕待定。

#### F18 兼容矩阵接真机探测
- Given 兼容矩阵当前为静态登记，When 本机可读到实际宿主版本，Then 回填实测结论（located / kernel-only / unsupported / unknown），减少人工 unknown。
- 验收：状态负载能带实测宿主版本与比对结论；矩阵静态行与真机探测结果口径一致。
- 已实施（2026-11-10）：`lib/compat-matrix.js` 新增 `probeCompatMatrixRow(state, compatLevel)`（按 `compatLevelFromState` 判级映射 supported/unsupported/unknown，附 evidence 与 `matrix_match` 静态行对照；只产出探测行，不自动改写静态矩阵，避免单机环境被当通用结论）；`--status` 文本输出「矩阵探测」行，面板状态负载带 `matrix_probe`。
- 证据：`test/compat-matrix-probe.test.js` 5 例（四态 + 宿主不在矩阵）；真机只读实测 `located（supported）`、`matrix_match.same=true`；全量 158/158 全绿、compat:check exit 0。

### P3 生态扩展（高成本，暂缓）

#### F11 配套插件与跨仓引流
- 方向参考：本机出图、会话管理等相邻插件；当前 `unknown` 是否有明确需求。
- 前置：主插件 P1/P2 稳定、有真实用户反馈后再立项。
- 验收：每个配套插件独立仓库，README 互相链接；不捆绑安装。

#### F12 目录生态（market / skills / 预设目录）
- Given 后续预设或工具增多，When 目录超过 3 个预设/工具，Then 再考虑 market 清单目录与 skills 目录规范；当前规模不预建空目录。

## 6. 不做清单（本轮明确否决）

- 不把许可证改成 MIT 或其他重授权形式（R1）。
- 不复活上游死链、不挂 TG 频道、不做 QQ 群引流（R2/R6）。
- 不放宽私网门禁去支持公网靶场（R3）。
- 不做付费版、不卖补丁、不倒卖（R4）。
- 不在本机运行态直接改真身包（R5）。
- 不照搬竞品 564 用例规模与 86 补丁的数量目标；以真实缺陷驱动测试增长。

## 7. 待确认项（已拍板 2026-11-09）

1. **版本号策略**：✅ 沿用 1.1.84-rc1 线，兼容表述不跳号。
2. **独立安装器**：✅ 不单独做；保留面板内 F7 分阶段诊断，不另维护独立安装脚本。
3. **配套插件方向**：✅ 暂缓，先把主插件做稳；P3 生态扩展待主插件稳定与真实反馈后再立项。
4. **新增文档语言**：✅ 只写中英；日文沿用占位，不逐篇翻译。
5. **lockfile 取舍**：✅ 不提交（见 F6）；如后续有复现构建要求再补。

## 8. 审批门

```text
📋 进化规划已存 docs/plans/evolution-roadmap.md
1. ✅ 批准执行（按 P0→P1→P2→P3 顺序，逐任务过门）
2. 📝 修改规划（指出需调整的 F 项 / 优先级 / 验收口径）
3. ❌ 放弃本轮规划
```

等待明确决策；「继续」不等于批准。

# dsh-purge 进化规划（门 1：需求分析 / 待审批）

- 维护者：qiuqianyi66
- 基线版本：1.1.84-rc1（适配 DSH 0.2.2-rc.1）
- 状态：**已批准执行**。P1 批次 F3/F4/F5/F6 已完成并推送（测试 74/74 全绿，test.yml 门禁绿，贡献模板、README 首屏对齐、依赖口径确认）；P0 F1 真身包已同步 fork/main 并重启验收通过，F2 遗留项已出实测结论（teams 工具注册、壳更新回调标 unknown，见 backup-purge-20261109/notes.md）。下文第 1 节为门 1 基线快照。
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
- 遗留代码瑕疵（P2，未动工）：`client.js` 中 `ownServers`/`ownLoaded`/`own.save` 死状态与死 i18n；`docs/drill-auth-legal.html` 第 6 节仍写 "MIT License"，实际许可证为 Apache-2.0，内嵌常量 `AUTH_LEGAL_HTML` 同文，需同步更正；`docs/notice/` 下 4 张照片未被任何 README 引用，待用户确认是否清理。
- 阻塞：桌面接管不可用——PIP 虚拟桌面 RDP reason=516（提示需重启 Windows），main 独占授权超时；未能在 DSH 会话内打开清洗/补丁面板重新实拍。
- 待办（GWT）：Given 桌面控制恢复，When 在本机 DSH 打开 dsh-purge 清洗页与补丁列表，Then 仅裁剪面板区域、不含会话/账号信息，替换回 `docs/preview/` 并在三语 README 与 screenshots.json 重新登记；截图内不写死会漂移的补丁计数，版本戳以当前发版为准。

### P2 功能补齐（中等成本，P1 之后）

#### F7 安装/更新失败分阶段诊断
- Given 更新或安装失败，When 面板报错，Then 错误信息区分：下载阶段（网络/代理/证书）、校验阶段（SHA256/解压）、注入阶段（补丁命中/drift）、重启阶段；附可复制的脱敏诊断片段。
- 边界：不自动改代码、不自动重启宿主；失败不触碰现有安装。
- 验收：构造离线/断网场景，错误落到对应阶段并给出明确下一步。

#### F8 预设排除（excludePresets）
- Given 用户使用 roleplay/minimal 等非 redteam 预设，When 配置排除名单，Then 这些预设不注入 Purge 提示词，仍保留面板、命令与工具；切换预设、并行会话、子 Agent 与宿主兜底都遵守排除。
- 承重墙：C1 补丁链不动；排除只作用于提示词注入层。
- 验收：加一条配置用例 + 一条回归用例；切换预设后注入状态符合配置。

#### F9 状态自检面板
- Given 用户打开面板，When 读取状态，Then 一屏给出：补丁是否应用、注入是否就位、备份是否存在、当前版本/通道/钉选、兼容级别（已定位 / 仅内核校验 / 未定位 / 未知），每项附证据而非「应已生效」。
- 验收：状态项与实际落盘文件/校验清单对应；Web 宿主只读失败时显示 n/a，不谎报。

#### F10 兼容矩阵门禁
- Given 兼容表列了 DSH 版本与对应插件版本，When 发版前跑核对，Then 表内版本与 `package.json` dshTarget、实测可运行版本一致；过时条目标 unknown 而非保留。
- 验收：新增/升级 DSH 版本时有一处单一事实来源（compat 配置），README 表格由其生成或人工核对留痕。

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

## 7. 待确认项（审批时一并拍板，附推荐）

1. **版本号策略**：沿用 1.1.84-rc1 线，还是重排 1.2.x？推荐沿用，兼容表述不跳号。
2. **独立安装器**：是否需要竞品那样的独立安装脚本？推荐先做 F7 面板内诊断，不单独做安装器。
3. **配套插件方向**：本机出图 / 会话管理哪个优先？推荐暂缓，先把主插件做稳。
4. **新增文档语言**：docs 新增条目是否只写中英？推荐中英，日文沿用占位不逐篇翻译。
5. **lockfile 取舍**：推荐不提交（见 F6），如有复现构建要求再补。

## 8. 审批门

```text
📋 进化规划已存 docs/plans/evolution-roadmap.md
1. ✅ 批准执行（按 P0→P1→P2→P3 顺序，逐任务过门）
2. 📝 修改规划（指出需调整的 F 项 / 优先级 / 验收口径）
3. ❌ 放弃本轮规划
```

等待明确决策；「继续」不等于批准。

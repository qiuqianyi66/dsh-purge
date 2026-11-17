# 竞品适配分析（2026-11-17 实测）

- 目的：回答「同一条线上的竞品现在适配到哪、哪些做法值得吸收、哪些不跟」。
- 数据：GitHub REST API 实查（`gh api`，2026-11-17 14:4x UTC+8）+ 本机离体审计两次（rc.2 / rc.1-rc.5 尝试）。
- 口径：标注 `self-reported` 的是对方 README 自述、未在对方仓库复现；标注 `unknown` 的是本机无法验证。

## 1. 纵向：这条线怎么走到今天

| 时间 | 事件 | 证据 |
| --- | --- | --- |
| 2026-11-15 | 上游 `YuJunZhiXue/dsh-purge` 复核 404 | `gh api` 现查仍 404 |
| 2026-10-13 | 镜像 `mmparko/dsh-purge` 停更（★5229） | `pushed_at 2026-10-13` |
| 2026-10-21 | 镜像 `WoYun520/dsh-purge` 停更（★622） | `pushed_at 2026-10-21` |
| 2026-11-10 → 11-17 | 我方 1.1.84 → 1.2.10，连续修 6 个真机缺陷 | git log 275f05c 起 |
| 2026-11-16 | 社区版 `kingcharleslzy-ai/dsh-purge` 冲到 1.7.18（★9408） | release list + `pushed_at` |

结论：这条线只剩两条活分支——社区版（功能扩张路线）与我方（深度与证据路线）。镜像仓库已是存档，不再产生适配。

## 2. 横向：直接竞品逐项对照（2026-11-17）

| 维度 | 社区版 1.7.18（★9408） | 我方 1.2.10（★10） | 判断 |
| --- | --- | --- | --- |
| 宿主声明 | `dshTarget` 字符串写 `0.2.1-rc.1 (runtime injection + host patches verified)`；README 自述 `0.2.2-rc.1 / 0.2.1-rc.1 / rc.2 / rc.3 / rc.5` 同样通过（self-reported） | `dshTarget` + `dshTargets` 均为 `0.2.2-rc.3`，矩阵一行一证据 | 对方广而含糊；我方窄而可核验 |
| 补丁规模 | 86 条（self-reported） | 82 条，本机 `--status` 逐条回显 | 数量接近，口径不同 |
| 自检 | 25 层（self-reported） | 分组诊断 + 四类桶计数 + 建议/留痕（`selfcheck-panel/advice/log`） | 我方按状态机出证据，不按层数造指标 |
| 组开关 | 14 条权限补丁收成组开关、上下文管理独立开关（`test/patch-group-switches.test.mjs`） | 无组级开关，只有全局 apply/revert | **功能扩张，按「不扩功能」不跟** |
| 安装器 | 独立安装器：分阶段诊断、有限重试、curl 备用、来源/证书/SHA256 | 面板更新 + `update-verify.js`（SHA256/证书链/归档预检）+ `archive-digests.json` TOFU 台账 | 互有胜负；我方已把校验做成可复用台账 |
| CI | 6 个工作流（community/contributors/market/native-panel/official-installer/release） | 2 个（test/release）；`compat:check` + 233 用例门禁 | 对方门禁多但含生态向流水线 |
| 测试 | 约 100 个测试文件 / 564 用例（self-reported） | 36 个文件 / 233 用例（本机 `node --test` 实测） | 用例厚度差距真实存在 |
| 打包自检 | `npm run smoke`（`npm pack` + 冒烟脚本）、`check:docs` | 无 | **可吸收，见 §5-A** |
| 生态 | `market/` `packages/` `skills/`、59 个 docs、配套 DSH-Spicy（★258） | 无 market/packages | 不跟（扩功能 + 跨仓引流） |
| 许可证 | MIT | Apache-2.0，LICENSE/NOTICE 保留原始版权 | 口径不同；上游 404 无法核验来源，对方改证是否合规标 unknown |

## 3. 相邻高星项目的做法（不是同赛道，但工具链可迁移）

| 项目 | 实测规模 | 可迁移的做法 | 我方对应 |
| --- | --- | --- | --- |
| `promptfoo/promptfoo` | ★27344，MIT（已被 OpenAI 收购） | 漏洞按严重度分组、给出命中原文 + 评分理由；`code-scan` 作为 PR 门禁 | 红队侧 `score-rules.js` + `report-replay.js` 已有「面板/报告/攻击链同一口径」；PR 门禁只有 `compat:check` |
| `NVIDIA/garak` | ★10058，Apache-2.0 | probe / detector / buff 三层分离；报告卡给绝对分 + 相对分 + bootstrap 置信区间 | 我方是 patch / 状态 / 证据三层；未做置信区间（单机确定性补丁不需要） |
| `microsoft/PyRIT` | ★4901，MIT | scenario → technique → executor 分层；memory 落库；scorer 统一判定 | 我方红队已有 evidence ledger（`lib/redteam/evidence-ledger.mjs`）与 score board |
| `snyk/agent-scan` | ★3246，Apache-2.0 | 工具描述哈希钉住（pin）防漂移；三行 YAML 进 CI；可离线 | 我方 `archive-digests.json` 是同一思路（首次记录、后续比对） |

## 4. 合轴判断

- **跟**：把「可核验的窄结论」继续压实——多版本只登记跑过审计且有数字的；文档里的竞品事实按日期重查，不沿用旧数字。
- **不跟**：组开关、market/packages 生态、配套插件引流、25 层/564 用例这类数量指标。理由是主线约束「不扩功能、只做深度」，且数量指标会诱发为凑数写补丁。
- **差距承认**：用例厚度（233 vs 564）与安装器成熟度确实落后；本轮只补「打包自检」这一条可机械验证的缺口，不追数量。

## 5. 本轮吸收与落地

### A. 打包自检（吸收社区版 `npm run smoke`）
- 现状缺口：`package.json` 的 `files` 白名单靠人维护，缺一条「打出来的 tgz 是否真含运行必需文件、是否误带 test/docs/plans」的机械检查。
- 落地：`scripts/pack-check.mjs` + `npm run pack:check`，CI 在 `compat:check` 之后执行；只读 `npm pack --dry-run --json`，不产包、不联网。

### B. README §10 竞品表按日期重查
- 旧表停留在 11-15 口径（社区版未列、镜像无星数）。本轮改为 11-17 实查值，并指向本文件。

### C. 多版本适配：只登记有证据的
- `0.2.2-rc.2`：`node scripts/audit-next.mjs --version 0.2.2-rc.2` 退出码 0，`rows=78 / missed=0`，报告 `upstream-reports/0.2.2-rc.2.json`。属「契约✓ 实打✓」，**未做真机冒烟**，因此不写进 `dshTargets`、不进 supported 行，只在 §7 说明里保留「rc.2 与 rc.3 四个载体文件逐字节一致」的事实。
- `0.2.1-rc.5`：铺树失败 `ETARGET @deepseek-ai/dsh-tool-executor-ptc@0.2.1-rc.5`，本机无法审计 → 对社区版「rc.5 也通过」的说法标 **unknown**，不引用。

## 6. 复核命令（任何人可重跑）

```powershell
# 竞品现状
gh api repos/kingcharleslzy-ai/dsh-purge --jq '.stargazers_count,.pushed_at,.license.spdx_id'
gh release list -R kingcharleslzy-ai/dsh-purge --limit 1

# 我方适配
node scripts/audit-next.mjs --version 0.2.2-rc.2 --json upstream-reports\0.2.2-rc.2.json
npm run pack:check
npm test
```

## 7. 未决 / 风险

- 社区版 README 的 rc.5 说法无法在本机复现（子包未发版），只能在对方机器或 CI 里验，标 unknown。
- 组开关若后续被用户明确要求，再单独立项；本轮不动 `lib/core.js` 补丁链。
- 用例数量差距不设追赶目标：按「真实缺陷驱动」补测试，不做指标竞赛。

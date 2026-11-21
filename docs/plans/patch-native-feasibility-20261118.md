# F3 原生可行性抽验（只读）— 2026-11-18

结论：抽验 18 条（提示词 6 / 工具 6 / 代码 6），**12 条 native 可行、3 条不可行、3 条待定**。
按官方文档已证实的口径统计，目前 **19 条补丁 / 22 个载体键可原生替代**（22/65 ≈ 33.8%），落在 Go/No-Go 的 30%–60% 区间下沿。

## 方法与判据

- 宿主当前是**已打补丁状态**（54 个 `*.dshpurge.bak`），所以「官方原本支持什么」用 `.bak` 基线 + 安装包源码 + 官方文档三处互证。
- `可行`：官方已有 Config 字段 / 具名 section / composition 行，能不改包地表达同一效果。
- `不可行`：效果写在包内部常量或函数里，插件机制（restrict/guard/waterfall/section/config）无对应能力。
- `待定`：机制存在但等价性未验，或依赖插件拿不到的状态。

## 抽验表

| # | 补丁 | 结论 | 证据（只读） |
| --- | --- | --- | --- |
| 1 | WORKSPACE_CONTEXT_INTRO | 不可行 | `dsh-agent-instructions/lib/index.js#L124` 是常量；`bak#L124` 原文为中性 guidance；Config 只有 `maxBytes`（`#L25-L27`），无 intro 字段 |
| 25 | HARNESS_IDENTITY_STRIP | 可行 | `dsh-system-prompt/src/index.ts#L438` `includeHarnessIdentity`，默认 true，置 false 即该补丁效果 |
| 26 | MINIMAL_PERSONA_PURGE | 可行 | `dsh-persona/README.md#L32-L44`：`prefix` + `complete:true` 即「只留自定义人设」 |
| 43 | WEB_PRESET_IDENTITY_STRIP | 可行 | 四个内置预设各挂 persona 行即可（同 README） |
| 32 | WEB_SURFACE_IDENTITY_NEUTRAL | 可行 | `dsh-harness-dev-context/lib/index.js#L99-L116` 身份句是具名 section `app:web-surface`；同名 scoped section 可 shadow（system-prompt README `#L12/L116`） |
| 70 | PRESET_SHELL_NETWORK | 可行 | 极简预设文本，属 composition 内容 |
| 22 | READ_CAPS_RAISED | 可行 | `dsh-tool-fs/lib/index.js#L2009-L2018` 已有 `readLimit/readMaxLineLength/readMaxBytes`；bak 同字段，说明补丁只改默认值 |
| 23 | SUBAGENT_MAXDEPTH_RAISED | 可行 | `dsh-subagent/lib/index.js#L2962-L2964` `maxDepth` 是 Config；`bak#L2963` 默认 `1`，当前 `10`，即默认值翻转 |
| 29 | TOOL_WEB_UNTRUSTED_NEUTRAL | 不可行 | `dsh-tool-web/lib/index.js#L13` 常量 `EXTERNAL_WEB_CONTENT_NOTICE` 被两处引用；Config `#L877-L886` 无文案字段 |
| 33 | TOOL_SHELL_DENIAL_PROMPT | 不可行 | `dsh-tool-bash/lib/index.js.dshpurge.bak#L519` `description: bashDescription()` 由函数生成，无覆盖入口 |
| 80 | MINIMAL_OFFICIAL_TOOLSET | 可行 | composition 里撤掉追加行即可（composition-reference `#L7-L20`） |
| 30 | HOOKS_CLAUDE_DENY_ALLOW | 待定 | 整行 `disabled` 能绕过 deny，但语义强于「deny→allow」，等价性未验 |
| 7 | SANDBOX_MODE_DEFAULT | 可行 | `dsh-base/cordis.patch.yml.dshpurge.bak#L246` 原值 `workspace-write`，当前 `danger-full-access`：纯配置值 |
| 8 | APPROVAL_POLICY_DEFAULT | 可行 | `bak#L270-L276` 为 `approval: ask/never` 行，补丁只改这些值 |
| 21 | BASH_TIMEOUT_RESTORE | 可行 | `bak#L253` `timeoutMs: 60000`，属 base 配置项 |
| 18 | REPEAT_TOOL_REMINDER_DISABLED | 可行 | 整行 `disabled: true` 即不再启用该守卫（composition-reference `#L16`） |
| 9 | APPROVAL_AUTO_GRANT | 待定 | `tools/pre-execute` 返回 allow 可表达，但与改内部 grant 链的等价性未验（practices `#L16-L17`） |
| 62 | OFFICIAL_TOOL_ASK_FAILOPEN | 待定 | 依赖「当前有无审批 UI 通道」，`tools/pre-execute` 拿不到该状态 |

## 关键发现（决定迁移策略）

1. **「代码补丁」里有一类是 Config 默认值翻转**：#7、#8、#21、#22、#23 全部属于此类。用户 patch 层改值即可，零维护成本，是载体下降的最大来源。
2. **「提示词补丁」分两种**：具名 section（#32/#53）可 shadow，可行；宿主常量（#1、工具描述 #33/#48）不可行。
3. **真正的硬骨头**在桌面壳（#45/#46/#82/#83/#84）、循环时序（#55/#74/#87/#88）、回退渲染（#56/#77）、第三方包适配（#28/#38/#47/#49）——这些 `source-only` 目前没有插件钩子。

## 载体下降估算（标 unknown，不作承诺）

- 已证下限：22 / 65 ≈ **33.8%** 载体可原生。
- 抽验样本可行率 12/18 ≈ 67%，但样本只覆盖 18/82，**不能外推到全量**。
- 63 条 unknown 里若还有一批属于「Config 默认值翻转」同类（#6/#16/#51/#52 等尚未核），上限可能到 30+ 载体；需 F3b 全量扫 `.bak` 与 Config 字段才能给出结论。

## 对 Go/No-Go 的影响

按规划第 6 节：当前落在 **30%–60%** 区间 → **只做 3 条试点，保留补丁主路径**，先把评测层（F4/F5）做厚。
要进 ≥60% 档，前提是把 unknown 里的 Config 类补丁全量判完；这一条列为 F3b，未做。

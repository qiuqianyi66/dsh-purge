# 1.1.89

## 中文

- **适配 DSH 0.2.2-rc.3**：补上 rc.2 引入的新原文形态，旧 pattern 全部保留（老宿主不掉档）。#13 沙箱升级阶梯改按 `SandboxEscalationError` 错误码；#35「从不拒绝」判定同步；#18 重复工具调用守卫补 rc.2 删掉的 post-execute 分支；#36 justification 补 `Required with … this exact …` 整句（大小写两版 marker）；#62 工具审批 fail-open 从 `serviceAsk` 改走 `approvalDenial(...)`。
- **归因修正（重要）**：失配源自 **rc.2**，不是 rc.3 —— rc.2 的 sandbox/tools 包已含 `SandboxEscalationError` ×15、`approvalDenial` ×6，四个载体文件在 rc.2 与 rc.3 之间逐字节一致。1.1.88 只覆盖 rc.1，装在 rc.2 或 rc.3 上会静默失配；兼容矩阵的 legacy 行已改为「只有 rc.1 → 1.1.88」。
- **证据分级**：兼容矩阵新增 `EVIDENCE_LEVELS`（契约 / 实打 / 冒烟 / 真机）与行级 `evidence`，不再把四件事合并成一句「支持」。README 的兼容表由 `scripts/gen-compat-readme.mjs` 生成，同时产出机器可读的 `compat.json`（`version` / `dshTarget` / `matrix` / `verification` / `install` / `entrypoints`），`npm run compat:check` 在 CI 里三方核对（矩阵 / README / `package.json`）。
- **审计门禁**：`audit-next` 增加 `--fail-on drift|any|none`（默认 drift），可直接当 CI 门禁用；`upstream-sync` 新增 `HOST_BEHIND_MATRIX`（本机宿主落后于矩阵目标时主动报告），并拒绝通过 `--bump` 把矩阵目标往回降。
- **README 全量重写（SEO/GEO）**：16 节结构——英雄区与一句话安装、目录锚点、30 秒上手、它解决什么问题、能做什么、兼容与证据、安装、应用与验证、升级前先自检、FAQ 十条、同类实现与差异、工作原理、还原与更新、已知限制、仓库结构、给 AI Agent 的协议、术语表。法务段逐字保留。新增 `README.en.md` 供英文检索。
- **机械验证**：rc.3 离体审计——载体 45 键 / 补丁 78 条 / 认得 56 / 校验型 6 / **需重对齐 0** / 未审计 11（载体不在 npm 包内）；隔离树实打——58 applied / 6 already / 7 missing_file / 2 skipped / 9 na，改动 31 个 `.js`，语法失败 0；真宿主 0.2.2-rc.1 诊断——82 条补丁、改过原文 0、退役 4；单元测试 194 通过。
- 维护者 qiuqianyi66；本版本系原始项目（作者 YuJunZhiXue）的衍生作品，Apache-2.0，保留 LICENSE/NOTICE 版权声明。

## English

- **Now targets DSH 0.2.2-rc.3**: the patch set covers the source literals introduced in rc.2 (`SandboxEscalationError`, `approvalDenial`, `Required with … this exact …`) while every older pattern is kept, so older hosts do not regress.
- **Corrected attribution**: the mismatch starts at **rc.2**, not rc.3 — rc.2 already shipped `SandboxEscalationError` ×15 and `approvalDenial` ×6, and the four carrier files are byte-identical between rc.2 and rc.3. 1.1.88 only covers rc.1 and fails silently on rc.2/rc.3; the matrix legacy row now reads "rc.1 only → 1.1.88".
- **Evidence levels** (contract / apply / smoke / device) are now first-class in `lib/compat-matrix.js`, and `compat.json` is generated from the same source as the README table; `npm run compat:check` verifies matrix, README and `package.json` agree in CI.
- **Audit gate**: `audit-next --fail-on drift|any|none`; `upstream-sync` reports `HOST_BEHIND_MATRIX` and refuses to downgrade the matrix target via `--bump`.
- **README rewritten for SEO/GEO** in 16 sections, plus `README.en.md`; the legal/compliance section is carried over verbatim.
- **Verified**: rc.3 off-host audit — 45 carrier keys, 78 patches, 56 recognized, 6 verify-only, 0 needing realignment, 11 unaudited; apply simulation — 58 applied, 31 JS files checked, 0 syntax failures; real host 0.2.2-rc.1 — 82 patches, 0 source drift; 194 unit tests pass.
- Apache-2.0 derivative of the original project by YuJunZhiXue; LICENSE/NOTICE attribution preserved.

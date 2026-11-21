# 1.2.12

## 中文

- **一条命令安装（P0 开箱即用）**：新增 `node bin/dsh-purge.js --install`，以及 Windows 双击入口 `install.cmd`、macOS/Linux 入口 `install.sh`。安装器自动定位 `DSH_HOME` 与正在运行的 profile，备份 `package.json` / `cordis.patch.yml`，把插件复制到 `dsh-purge-vendor`，写依赖 / `dsh.profile.bundles` / 用户层 insert / `allowBuilds`，回读校验 4 项，然后重启 DSH。**不经过 pnpm**，因此不再受 `ERR_PNPM_IGNORED_BUILDS` 影响；任何一步失败自动回滚，错误翻译成人话。
- **修卸载残留（G1）**：`--uninstall` 以前只删 `package.json` 的依赖与 bundles，`cordis.patch.yml` 里的 `id: dsh-purge` insert 会留下，下次启动 loader 指向已删除的包。现在卸载会一并摘除该 insert 实体（同组其它插件实体保留），临时 profile 集成测试已覆盖。
- **profile 写入改成原子 + 备份（G3）**：`ensureProfileBundles` / `ensureProfileBodyInsert` / `ensurePnpmAllowBuild` 改为「临时文件 + rename」并保留单份 `.dshpurge.bak`；断电不再可能留下半截 JSON/YAML。
- **postinstall 不再静默成功（G4）**：在插件仓库里跑 `pnpm install` 仍正常跳过；在其他目录找不到 profile 时退出码 2，并提示改用 `--install`，不再假装装好。
- **安装器决策**：默认只装「正在运行的那个 profile」；多 profile 且无法判断时要求 `--profile desktop|web`；已有 URL/tarball 依赖原样保留，只补 vendor 与注册。
- **双击入口实测修复**：`install.cmd` 改为 CRLF 并加 `.gitattributes`（`*.cmd eol=crlf`）——LF 换行会让 cmd 逐行解析错乱，真机双击会直接失败；同时用 `scripts/find-dsh-node.ps1` 在 DSH 未运行时也能从卸载注册表找到内置 Node。
- **空 profile 文案**：`DSH_HOME` 下没有任何 profile 时报 `NO_PROFILE`（不再误报 `NO_PROFILE_MULTI`），并提示「先启动一次 DSH 生成 profile」；`NO_PROFILE_MULTI` 的翻译顺序修正。
- **干净 profile 实测**：临时 `DSH_HOME` + 空 profile 首次安装 `copied 126 files`、4/4 回读通过；随后 `--uninstall` 后 `cordis.patch.yml` 无 `dsh-purge`，G1 在真实文件系统闭环。
- **测试**：新增 `test/install-autoload.test.js` 11 条（全新安装 / 幂等 / 试运行 / 未知 YAML 回滚 / URL 依赖保留 / 卸载归零 / insert 多实体 / 往返 / 错误翻译 / 空 profile / 发布清单）。全套 `node --test` **262 通过 / 0 失败**；compat / fixture / native / pack 四道 check 全绿。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **One-command install (P0 out-of-the-box)**: new `node bin/dsh-purge.js --install`, plus `install.cmd` (Windows double-click) and `install.sh` (macOS/Linux). The installer detects `DSH_HOME` and the running profile, backs up `package.json` / `cordis.patch.yml`, copies the plugin to `dsh-purge-vendor`, writes the dependency / `dsh.profile.bundles` / user-layer insert / `allowBuilds`, verifies 4 items by reading back, then restarts DSH. It **bypasses pnpm**, so `ERR_PNPM_IGNORED_BUILDS` no longer blocks first install; any failure rolls back and translates the cause into plain language.
- **Fixed dangling insert on uninstall (G1)**: `--uninstall` used to strip only the `package.json` dependency and bundles, leaving `id: dsh-purge` in `cordis.patch.yml`; the next boot pointed the loader at a deleted package. Uninstall now removes that insert entity (other plugin entities in the same group are preserved), covered by a temp-profile integration test.
- **Atomic profile writes + backup (G3)**: `ensureProfileBundles` / `ensureProfileBodyInsert` / `ensurePnpmAllowBuild` now write via temp-file + rename and keep one `.dshpurge.bak`; a crash can no longer leave half-written JSON/YAML.
- **postinstall no longer silently succeeds (G4)**: running `pnpm install` inside the plugin repo still skips normally; anywhere else, a missing profile exits with code 2 and points to `--install` instead of pretending success.
- **Installer decisions**: install only the running profile by default; require `--profile desktop|web` when multiple profiles cannot be disambiguated; keep an existing URL/tarball dependency and only add the vendor copy plus registration.
- **Double-click entry fixed after real testing**: `install.cmd` is now CRLF with `.gitattributes` (`*.cmd eol=crlf`) — LF line endings make cmd misparse the script and fail on a real double-click; `scripts/find-dsh-node.ps1` also locates the bundled Node from the uninstall registry when DSH is not running.
- **Empty-profile wording**: an empty `profiles` directory now reports `NO_PROFILE` instead of incorrectly reporting `NO_PROFILE_MULTI`, and tells the user to launch DSH once to create a profile; the `NO_PROFILE_MULTI` translation order is fixed.
- **Clean-profile real test**: fresh `DSH_HOME` with an empty profile installed `copied 126 files` and passed 4/4 read-back checks; a following `--uninstall` left no `dsh-purge` in `cordis.patch.yml`, closing G1 on a real filesystem.
- **Tests**: new `test/install-autoload.test.js` (11 cases: fresh install / idempotency / dry-run / unknown-YAML rollback / URL dependency preserved / uninstall zero-reference / multi-entity insert / round-trip / error translation / empty profile / pack list). `node --test` **262 passing / 0 failing**; compat / fixture / native / pack checks all green.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.11

## 中文

- **rc.5 真机转正**：supported 目标从 `0.2.2-rc.3` 迁到 `0.2.2-rc.5`，rc.3 降为 legacy（1.2.11 仍覆盖）。82 条补丁 **0 条需要改**——rc.4/rc.5 的上游源码变更（base 组合删 `searchProvider: deepseek-search-api` 改由 dsh-web 按模型路由、rc.5 新增 `CONTENT_REFUSED`/`refusal()`）逐条核对，均不触及本插件 pattern。
- **源码级差异工具**：新增 `npm run upstream:diff`（`scripts/upstream-src-diff.mjs`），对两棵隔离树逐文件 SHA-256 比对（290 包中 15 包变化），结构指纹剔除 version 字段防噪声。
- **锚点 fixture 化**：`scripts/rc5-fixture-gen.mjs` 从真宿主机械提取锚点（找不到即 exit 2 不静默），`fixtures/host-anchors-0.2.2-rc.5.json` + `test/anchor-rc5.test.js` 8 条锁 #22/#7/#8/#63/#40；首跑即抓到单双引号真实差异（`'plan:policy'` vs `"plan:policy"`）。
- **审计口径修复**：`audit-next.mjs` 此前跳过 RegExp 型 pattern，纯正则补丁（#40/#73）永远落 unknown；修后 rc.3/rc.5 同口径 ok58/verify6/unknown3/no-carrier11，drift 0。
- **真机验证（0.2.2-rc.5 桌面版）**：官方 NSIS 安装器被安全软件拦临时文件写入（`Error writing temporary file`，TEMP 可写、换新 TEMP 仍拒、/NCRC 无效），改从官方 exe 解出 `app-64.7z` 落盘（sha512 与 nightly feed 一致）；宿主 21782 文件 / 338 个 @deepseek-ai 包，`--apply` **70/71 已清洗、0 待清洗**，`--diagnose` 载体 56 / 改原文 0 / 目标消失 0 / 载体缺失 0 / 部分副本 0，可选缺失 7（正常跳过），主窗口正常启动。完整 338 包树 isolated-cycle G1–G6 全过（applied 55 / failed 0 / revert 46 mismatch 0）。
- **测试防假红**：`compat-matrix-probe.test.js` 的宿主版本改为跟随 `COMPAT_CURRENT`，矩阵转正不再需要改测试（本轮转正时写死 rc.3 红过一次）。全套 `node --test` **251 通过 / 0 失败**；compat / fixture / native / pack 四道 check 全绿。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **rc.5 promoted on a real host**: the supported target moves from `0.2.2-rc.3` to `0.2.2-rc.5`; rc.3 becomes a legacy row (still covered by 1.2.11). **Zero of the 82 patches needed changes** — the rc.4/rc.5 upstream source deltas (base composition dropping `searchProvider: deepseek-search-api` in favor of dsh-web per-model routing; rc.5 adding `CONTENT_REFUSED` / `refusal()`) were checked line by line and touch none of this plugin's patterns.
- **Source-level diff tooling**: new `npm run upstream:diff` (`scripts/upstream-src-diff.mjs`) compares two isolated trees file by file with SHA-256 (15 of 290 packages changed); structural fingerprints strip the version field to avoid noise.
- **Anchor fixtures**: `scripts/rc5-fixture-gen.mjs` extracts anchors mechanically from the real host (exit 2, never silent, when an anchor is missing); `fixtures/host-anchors-0.2.2-rc.5.json` + `test/anchor-rc5.test.js` (8 tests) lock #22/#7/#8/#63/#40. The first run caught a real quote-style delta (`'plan:policy'` vs `"plan:policy"`).
- **Audit coverage fix**: `audit-next.mjs` used to skip RegExp patterns, so regex-only patches (#40/#73) were stuck at unknown; after the fix rc.3 and rc.5 share the same distribution — ok 58 / verify 6 / unknown 3 / no-carrier 11, drift 0.
- **Verified on a real 0.2.2-rc.5 desktop host**: the official NSIS installer was blocked from writing its temp file by security software (`Error writing temporary file`; TEMP writable, fresh TEMP still denied, /NCRC ineffective), so the payload was extracted from the official exe (`app-64.7z`, sha512 matching the nightly feed) and laid down directly; 21,782 files / 338 `@deepseek-ai` packages, `--apply` **70/71 cleaned, 0 pending**, `--diagnose` 56 carriers / 0 changed source / 0 dead target / 0 missing carrier / 0 partial copies, 7 optional carriers absent (expected), main window boots normally. Full 338-package tree isolated-cycle gates G1–G6 all pass (55 applied / 0 failed / 46 reverted, 0 mismatch).
- **Test hardening**: `compat-matrix-probe.test.js` now derives the host version from `COMPAT_CURRENT` instead of hardcoding it, so future promotions do not break the suite (the hardcoded rc.3 went red once during this promotion). `node --test` **251 passing / 0 failing**; compat / fixture / native / pack checks all green.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.10

## 中文

- **修「红队模式被重复注册挤掉」**：1.2.9 把预设写进 rc.3 声明行后，宿主 loader 会在启动时注册 `redteam`；插件运行时又调用 `agentPresets.register()`，得到 `Duplicate agent preset: redteam`，模式下拉因此被过滤。`preset-declare.json` 会停在 `register-failed`。
- 新版分支改为**只验证、不重复注册**：检测到 profile 已有 `preset-redteam` 声明行时，等待 loader 的注册结果并写回 `registered` / `registered-broken`，不再调用 `registry.register()`；rc.2 的运行时注册路径保留。
- 成功状态会清掉上一轮遗留的 `error` 字段，避免面板显示旧错误。
- 真机复验：`preset-declare.json` = `ok:true / phase:registered / plugins:19 / broken:null / error:null`；`/redteam/api` version 1.2.9、164 技能、blockers 0。全套 `node --test` **233 通过 / 0 失败**；`compat:check` 一致。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Fixes the red-team preset being squeezed out by duplicate registration**: 1.2.9 wrote the rc.3 declaration row, so the host loader already registered `redteam` at startup; the plugin then called `agentPresets.register()` again and hit `Duplicate agent preset: redteam`, which filtered the mode out of the picker. `preset-declare.json` stayed at `register-failed`.
- The modern branch now **verifies instead of registering again**: when the profile already carries the `preset-redteam` declaration row, it waits for the loader's registration and writes `registered` / `registered-broken` without calling `registry.register()`; the rc.2 runtime path is unchanged.
- Successful status clears the stale `error` field from the previous attempt.
- Live check: `preset-declare.json` = `ok:true / phase:registered / plugins:19 / broken:null / error:null`; `/redteam/api` reports version 1.2.9, 164 skills and 0 blockers. `node --test` **233 passing / 0 failing**; `compat:check` clean.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.9

## 中文

- **修「红队模式加载失败」**：1.2.8 把预设写成 rc.3 声明行后，模式卡显示了但带红标「加载失败」。逐行核对插件名后定位到两处 rc.3 改名/删包：
  - `@deepseek-ai/dsh-tool-subagent-control/list-agents` 子路径在 rc.3 已删除，`list_agents` 现在由主入口注册；继续写这一行 → 整份预设激活失败。
  - `@deepseek-ai/dsh-workflow-worker-thread` 包在 rc.3 不存在，即便 `disabled: true` 也会拖垮激活。
- 预设模板 `presets/redteam/agent.cordis.yml` 删掉这两行，其余 16 行逐一在宿主里校验存在且导出匹配。
- 真机 profile 的 `preset-redteam` 声明行已用 `force` 重写并复验（宿主自带 YAML 解析器：`id: redteam`、`name: 红队模式`、无失效插件名）。
- 全套 `node --test` **233 通过 / 0 失败**；`compat:check` 一致。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Fixes "red-team mode failed to load"**: 1.2.8 moved the preset to an rc.3 declaration row, and the card appeared with a red "failed to activate" badge. Auditing every plugin name found two rc.3 changes:
  - `@deepseek-ai/dsh-tool-subagent-control/list-agents` no longer exists as a subpath; `list_agents` is registered by the main entry, and keeping the old row fails the whole preset.
  - `@deepseek-ai/dsh-workflow-worker-thread` has no package in rc.3, and even `disabled: true` still breaks activation.
- Both rows are removed from `presets/redteam/agent.cordis.yml`; the remaining 16 rows are checked against the host for presence and matching exports.
- The live profile's `preset-redteam` row was rewritten with `force` and re-validated with the host's YAML parser (`id: redteam`, `name: 红队模式`, no dead plugin names).
- `node --test` **233 passing / 0 failing**; `compat:check` clean.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.8

## 中文

- **红队模式在 rc.3 上装不出来的根因**：0.2.2 起宿主不再读取 `$DSH_HOME/.agent-presets/<id>/`（官方文档原话 "Nothing reads that directory any more"），预设改为 bundle 补丁里的 `@deepseek-ai/dsh-agent-preset` **声明行**。本插件一直只写旧目录，于是模式下拉里没有红队模式，面板仍在、`/redteam/api` 也通——只剩入口消失。
- **`installPreset` 增加新版分支**：宿主能解析到 `@deepseek-ai/dsh-agent-preset` 时，改为在挂着本插件的 profile `cordis.patch.yml` 追加 `preset-redteam` 声明行（`id/name/description/order/plugins`），插件列表从包内 `presets/redteam/agent.cordis.yml` 生成、跳过锚点门行（它是性能项，不是功能项）；幂等，已存在就保留，`force` 才重写。旧目录安装保留给 rc.2 及更早。
- 声明行里显示的预设名是「红队模式」；插件逐项校验：本轮只缺 `dsh-workflow-worker-thread`（模板里本就 `disabled: true`，不影响激活）。
- 真机已按此格式写入 `~/.dsh/profiles/desktop/cordis.patch.yml`（YAML 用宿主自带解析器验证：`preset-redteam` / `plugins` 18 行 / 首行 persona），重启后模式下拉应出现红队模式。
- 全套 `node --test` **233 通过 / 0 失败**；`compat:check` 一致。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Why the red-team mode never showed up on rc.3**: 0.2.2 no longer reads `$DSH_HOME/.agent-presets/<id>/` ("Nothing reads that directory any more" in the official docs); presets are now `@deepseek-ai/dsh-agent-preset` **declaration rows** inside bundle patches. This plugin kept writing only the legacy directory, so the console and `/redteam/api` stayed up while the mode vanished from the picker.
- **`installPreset` gained a modern branch**: when the host resolves `@deepseek-ai/dsh-agent-preset`, it appends a `preset-redteam` declaration row (`id/name/description/order/plugins`) to the profile `cordis.patch.yml` that carries this plugin, generating the plugin list from the bundled `presets/redteam/agent.cordis.yml` and skipping the anchor-gate row (a performance knob, not a feature). Idempotent: kept when present, rewritten only with `force`. Legacy install remains for rc.2 and older.
- The row shows the preset as 红队模式. Every plugin name was checked; only `dsh-workflow-worker-thread` is absent, and the template already ships it `disabled: true`, so activation is unaffected.
- The live profile has the row now (validated with the host's own YAML parser: `preset-redteam`, 18 plugins, first row persona); restart makes it appear in the picker.
- `node --test` **233 passing / 0 failing**; `compat:check` clean.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.7

## 中文

- **修 1.2.6 的复发口子**：宿主重启会走「过期基线上刷新」自愈（`refreshStaleBaksForUpgrade`），原判据是「正文里没有 `dsh-purge` 字面量且与 bak 不同 → 认定成官方新版，把 bak 刷成正文」。但 #1/#22/#33/#48 这类补丁**只改文案、不写 marker 注释**，于是刚重建好的基线被下一次启动原样打回已打态——真机实测重启一次，8 个刚修好的文件全部复发成 `baseline_lost`（`dsh-agent-instructions/lib/index.js` 从 63281 字节的官方原件又变回 63970 字节的已打态）。
- **判据换成补丁自己的**：逐文件按「marker 命中 + 原 pattern 已不命中」判定正文是否已被我们写过，命中就不动 bak；只有正文确实回到官方新版（原 pattern 还在）才刷新基线。拿不到补丁索引时退回旧的字面量判据，不改变无补丁文件的行为。
- 新增 `test/upgrade-refresh.test.js` 3 条：已打态无字面量不刷基线、官方新版照常刷新、`applyPatches` 内部刷新后再 `revertAll` 回到官方新版而非旧版。全套 `node --test` **233 通过 / 0 失败**。
- `npm run cycle:isolated` 在 rc.3 隔离树 **OK 6/6**，与 1.2.6 同口径。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Closes the 1.2.6 regression window**: every host boot runs the "stale baseline refresh" self-heal (`refreshStaleBaksForUpgrade`), which used to decide "no `dsh-purge` literal + differs from bak ⇒ this is the official new version, overwrite bak with the current bytes". Patches #1/#22/#33/#48 only rewrite sentences and never write marker comments, so every freshly rebuilt baseline was reverted to the patched state on the next boot — on the live host all 8 repaired files relapsed to `baseline_lost` after one restart (`dsh-agent-instructions/lib/index.js` went from the 63281-byte official copy back to the 63970-byte patched one).
- **The refresh now uses the patch's own verdict**: per file it checks "marker present + original pattern gone"; when that holds the backup is left alone, and only a file that really is the official new version gets its baseline refreshed. Without a patch index it falls back to the old literal check, so files no patch touches keep the previous behaviour.
- 3 new cases in `test/upgrade-refresh.test.js`; `node --test` **233 passing / 0 failing**. `npm run cycle:isolated` remains **OK 6/6** on the rc.3 tree.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.6

## 中文

- **修掉「假还原」**：`.dshpurge.bak` 只在缺失时才创建，遇到「先打补丁、后才有备份」的历史状态会把**已打态**存成基线。此时 `revertAll` 把打过补丁的文件覆盖回自己：不报错、0 差异、界面显示成功，用户以为退回了官方原版，其实补丁全在。真机实测 54 个备份里 **10 个**是这种，其中 `dsh-agent-instructions/lib/index.js`、`dsh-tool-fs/lib/index.js` 能直接验到补丁痕迹（强句 / `READ_MAX_LINE_LENGTH = 1e4`）。
- **新判定 `baseline_lost`**：备份与本体逐字节相同、且本体确实带补丁痕迹（marker 命中 + 原 pattern 已不在）时，不再计入 reverted，单独列出并保留 bak 留证；`--revert`、面板「还原」都会提示「需从官方安装包/asar 重建基线」。只同字节、但没补丁痕迹的文件仍按 `skipped` 处理，不误报。
- **`--apply` 预先告警**：应用前先跑一次只读检测，若存在基线丢失文件就先说明「还原回不到官方原文」，避免用户事后才发现。
- 新增 `test/baseline-lost.test.js` 5 条（判丢失、真原文不丢、未打不丢、revert 不谎报、same-bytes 无痕迹仍 skipped），全套 `node --test` **230 通过 / 0 失败**。
- 真机已按官方 rc.3 原包重建 8 个文件的基线（旧备份留档 `*.dshpurge.bak.lost-20261116`），剩余 2 个属于已退役的 #50 残留，官方原件里没有对应锚点，按「无法重建」如实列出。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Fake reverts are gone**: `.dshpurge.bak` was only created when missing, so a history of "patch first, backup later" stored the **already-patched** bytes as the baseline. `revertAll` then copied a patched file over itself — no error, zero diff, a success message, and every patch still in place. On the live host **10 of 54** backups were in this state; two of them prove it outright (`dsh-agent-instructions/lib/index.js` carries the strong sentence, `dsh-tool-fs/lib/index.js` carries `READ_MAX_LINE_LENGTH = 1e4`).
- **New `baseline_lost` verdict**: when the backup is byte-identical to the body *and* the body really is patched (marker present, original pattern gone), the file is no longer counted as reverted; it is listed separately, the backup is kept as evidence, and both `--revert` and the panel revert say "rebuild the baseline from the official package/asar". A same-bytes backup without patch traces is still just `skipped`, so untouched files are not misreported.
- **`--apply` warns first**: a read-only pre-check reports baseline-lost files before patching, instead of letting users discover it later.
- 5 new cases in `test/baseline-lost.test.js`; `node --test` **230 passing / 0 failing**.
- On the live host 8 baselines were rebuilt from the official rc.3 package (old copies kept as `*.dshpurge.bak.lost-20261116`); the remaining 2 are leftovers of the retired #50 whose anchors do not exist in the official files, so they are listed as unrecoverable rather than quietly cleared.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.5

## 中文

- **修掉一个比 1.2.1 更大的诊断盲区**：`diagnose` 只认数组形态的 `file`，而 **29 条补丁（#1/#2/#3/#21/#22/#45/#46/#82-#85…，占 35%）用字符串声明载体**，整批被塞进「无文件字段 29 条」——等于这三分之一补丁从未参与漂移诊断。现在 `file` 字符串与数组同口径展开；真机 `--diagnose` 从「42 命中 + 29 无文件字段」变为 **71 条可命中 / 无文件字段 0**，与 `--status` 的 70/71 完全对齐。
- **补齐四类特殊补丁的判定语义**（否则它们一旦可见就会被误判成「目标已消失」）：① 校验型（官方原文 marker，如 #2/#3）→ `verified`；② 带编号自标记（#88 校验 #87 的 `[dsh-purge-87]`）→ 未出现时 `verify_pending`（待配套），不是漂移；③ 占位/撤销型（#14/#80 的 `[dsh-purge]` 自标记永不写入）→ `noop`；④ 迁移/恢复默认型（`softSettle`，如 #21）→ `satisfied`。新增独立桶并在诊断行里分开计数。
- **两条被基线丢失误伤的补丁**：#1 `WORKSPACE_CONTEXT_INTRO`、#22 `READ_CAPS_RAISED` 的 marker 是补丁自己写进去的人造文本（强句 / 1e4、1MB、2e4），但基线备份曾被覆盖成「已打态」，diff 为空导致诊断判成「目标已消失」。声明 `markersStrict` 后按「marker 在 + 原 pattern 不在」判定为已生效。
- **多候选载体不再被一个不存在的键整条判死**：#24 的 `preset-unrestricted`/`preset-liangshen`、#46 的 `system-prompt-nested` 在 rc.3 里根本没有，旧口径只要有一个键解析不到就整条进「载体缺失」。现在只要有一个候选能探到就按实际结论归类，缺的键记进 `unresolvedKeys`；`#83 DESKTOP_HOST_CLOSE_NO_FATAL` 的载体是桌面壳 `main.js`（纯 npm 树不存在），改标 `optional`，隔离门禁不再因此判红。
- **#24 `PRESET_FETCH_ENABLED` 判为默认态满足**：rc.3 的 preset 原生就是 `fetch: true`，`fetch: false` 块已不存在；声明 `softSettle` 且要求 marker（`fetch: true`）同时命中，避免上游换写法时被误报成已满足。
- **status 口径**：#88 在净树上由 `drifted` 改为 `pending`（待配套），revert 后不再出现「已还原却仍报漂移」的假告警。
- 新增 `test/diagnose-caliber.test.js` 8 条（字符串 file、校验型两向、待配套、占位、softSettle、softSettle+markers、多候选载体、#88 净树/已打）；全套 `node --test` 225 通过 / 0 失败；`npm run cycle:isolated` 六判据 OK 6/6；真机 `--status` 70/71、0 待清洗，`--diagnose` 71 命中、漂移 0、目标已消失 0、待配套 0、载体缺失 0、无文件字段 0。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **A diagnostic blind spot larger than the 1.2.1 one**: `diagnose` only accepted array-form `file`, while **29 of 82 patches (35%) declared their carrier as a string** (#1/#2/#3/#21/#22/#45/#46/#82–#85, …). All of them fell into a bucket mislabelled "no file field", so a third of the patch set had never been drift-diagnosed. String and array forms are now expanded identically; live `--diagnose` moves from "42 matched + 29 no-file-field" to **71 matched / 0 no-file-field**, exactly aligning with `--status` 70/71.
- **Four special patch classes now have explicit semantics** (otherwise they would be misread as "target gone" the moment they became visible): verify-only official markers → `verified`; numbered self-markers (#88 checks #87's `[dsh-purge-87]`) → `verify_pending` when absent, not drift; placeholder/undo patches (#14/#80 `[dsh-purge]` never written) → `noop`; migration/restore-default (`softSettle`, #21) → `satisfied`. Each has its own bucket and count in the diagnostic line.
- **Two patches wrongly hit by a lost baseline**: #1 `WORKSPACE_CONTEXT_INTRO` and #22 `READ_CAPS_RAISED` carry markers the patch itself writes (strong sentences / 1e4, 1MB, 2e4), but the backup had been overwritten with the applied state, leaving an empty diff and a "target gone" verdict. Declaring `markersStrict` makes "marker present + original pattern absent" count as applied.
- **One unresolvable candidate key no longer fails a whole patch**: #24's `preset-unrestricted`/`preset-liangshen` and #46's `system-prompt-nested` simply do not exist in rc.3, yet the old rule sent the entire patch to "carrier missing" as soon as any key failed to resolve. Now one evaluable candidate is enough, unresolvable keys are recorded in `unresolvedKeys`, and `#83 DESKTOP_HOST_CLOSE_NO_FATAL` (carrier = desktop-shell `main.js`, absent from a pure npm tree) is marked `optional` so the isolated gate stops failing on it.
- **#24 `PRESET_FETCH_ENABLED` classified as default-state satisfied**: rc.3 presets already ship `fetch: true` and the `fetch: false` block is gone; `softSettle` now requires its marker (`fetch: true`) to hit as well, so a rewritten upstream config cannot be misread as satisfied.
- **Status caliber**: #88 flips from `drifted` to `pending` on a pristine tree (companion patch not yet run), so a completed revert no longer reports a phantom drift.
- 8 cases in `test/diagnose-caliber.test.js`; `node --test` 225 passing / 0 failing; `npm run cycle:isolated` OK 6/6; live host `--status` 70/71 with 0 pending, `--diagnose` 71 matched, 0 drift, 0 dead target, 0 verify-pending, 0 missing carrier, 0 no-file-field.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.4

## 中文

- **隔离全链路固化成门禁脚本**：新增 `npm run cycle:isolated`（`scripts/isolated-cycle.mjs`）——在干净官方包树上跑 `backupAll → apply → diagnose → revert`，六条判据任一失败即退出码 1：G1 干净树（有 `.dshpurge.bak`/`tx` 残留直接拒跑）、**G2 所有解析出的载体路径必须都在隔离树内（跨树副作用门禁，1.2.2 那类事故从此机器可拦）**、G3 apply 0 失败且确实改写了文件、G4 drifted/partial/carrier_missing 全 0、G5 改写 `.js` 语法全过、G6 revert 后与原始树逐字节 0 差异。rc.3 实测 OK 6/6。
- CLI 行为回归：树缺失 / 树有残留两种情形退出码 2 且给出铺树命令（`test/isolated-cycle-cli.test.js` 2 条）。
- `.tmp/` 工作区加入 `.gitignore`；README / README.en / llms.txt 增加门禁命令并把「离体实打」数字更新为本轮实测（58 applied / 49 改写 / 39 `.js` 语法全过）。
- 全套 `node --test` 217 通过 / 0 失败。维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Isolated full-cycle promoted to a gate script**: `npm run cycle:isolated` (`scripts/isolated-cycle.mjs`) runs `backupAll → apply → diagnose → revert` on a clean official package tree and exits 1 when any of six criteria fails: G1 clean tree (refuses to run on leftover `.dshpurge.bak`/`tx` files), **G2 every resolved carrier path must stay inside the isolation tree (the cross-tree-side-effect gate — the 1.2.2 class of bug is now machine-catchable)**, G3 apply with 0 failures and real changes, G4 drifted/partial/carrier_missing all 0, G5 syntax-clean on every modified `.js`, G6 byte-for-byte 0 diff after revert. Measured OK 6/6 on rc.3.
- CLI behaviour regression: missing tree / dirty tree exit 2 with the staging command (`test/isolated-cycle-cli.test.js`, 2 cases).
- `.tmp/` workspace gitignored; README / README.en / llms.txt document the gate command and refresh the isolated-apply numbers to this round's measurements.
- `node --test` 217 passing / 0 failing. Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.3

## 中文

- 1.2.2 的桌面壳作用域修复补上 macOS 布局：`shellMainForAiBase` 改为按「`@deepseek-ai` 上四级目录名 = resources（大小写不敏感）」定位，Windows `resources` 与 macOS `Contents/Resources` 都只跟随本树，仍不会跨树。
- 新增第 3 条范围回归（macOS `Contents/Resources` 布局）；全套 `node --test` 215 通过 / 0 失败。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- Extends the 1.2.2 desktop-shell scope fix to the macOS layout: `shellMainForAiBase` now derives the resources directory four levels above `@deepseek-ai` and accepts either `resources` or `Contents/Resources` (case-insensitive), still never crossing trees.
- Adds a third scope regression (macOS `Contents/Resources`); `node --test` 215 passing / 0 failing.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.2

## 中文

- **修掉跨树副作用**：`targetFiles` 里的 `desktop-shell` 以前无条件取「当前官方桌面安装」的 `resources/app/lib/main.js`，于对隔离树 / 归档 base 跑 `revert` 时，会把真实宿主的桌面壳补丁一起摘掉。现在只跟随 `aiBase` 自己所属的 `resources/app`，不命中就留空。
- **离体全周期验证**（这次补上的证据）：在干净 rc.3 npm 隔离树里 `backupAll → apply → status → diagnose → revert`；apply 58 条、0 失败、49 个文件改写、diagnose 42 命中且漂移 0、语法 0 错；revert 49 个文件后与原始树逐字节比对 **0 差异**，真实宿主桌面壳 marker 前后均为 9（未被触碰）。
- **回归**：新增 `test/target-scope.test.js` 2 条（桌面壳只跟随自己的 resources/app；隔离包布局不挂真实桌面壳）；全套 `node --test` 214 通过 / 0 失败。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **Cross-tree side effect fixed**: `desktop-shell` in `targetFiles` used to resolve the currently installed official desktop `resources/app/lib/main.js` regardless of `aiBase`, so a `revert` on an isolation tree or archived base could strip the live host's shell patches. It now follows only the `resources/app` that owns the given `aiBase`.
- **Full isolated cycle**: on a clean rc.3 npm tree, `backupAll → apply → status → diagnose → revert`: 58 applied / 0 failed / 49 files changed, diagnosis 42 hits with 0 drift, 0 syntax errors; after revert, byte-for-byte comparison against the pristine tree showed **0 differences**, and the live desktop shell markers stayed at 9.
- **Tests**: 2 new scope cases; `node --test` 214 passing / 0 failing.
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.1

## 中文

- **修掉一处静默漏打**：#57 `DEEPSEEK_SYSTEM_ROLE` 在 rc.3 的 `openai-responses-shared.js` 里，变量名是 `instructionRole` 且带可选链（`compat?.supportsDeveloperRole !== false`），旧 pattern 只认 `role`，导致这个文件一直没打上、诊断却因另一份文件已打而整条报 clean。现已补上该候选锚点，真机两份副本（宿主 + profile）都已改写并带 allowlist marker，`node --check` 通过。
- **诊断补上老式补丁的命中数**：`probeCarrier` 此前只读 `replacements`，7 条用 `patterns + replace` 老式声明的补丁在诊断里永远 0 命中、只能靠 `dsh-purge` 字样蒙混。现在与新式补丁同口径展开，上游再改这几条能直接报「可命中/漂移」。
- **事务临时文件清理**：写盘失败时不再把 `.dshpurge.tx-*` 临时文件留在宿主目录。
- **验证**：新增 3 条回归（instructionRole 锚点命中、重复执行不再改写、老式 patterns 计数）；全套 `node --test` 212 通过 / 0 失败，`compat:check` 一致；真机连打两次 apply，62 个载体文件哈希零变化（第二次 applied 0），确认幂等。
- 维护者 qiuqianyi66；衍生作品，Apache-2.0，保留 LICENSE/NOTICE。

## English

- **One silent miss fixed**: patch #57 `DEEPSEEK_SYSTEM_ROLE` uses `instructionRole` with optional chaining in rc.3's `openai-responses-shared.js`; the old pattern only matched `role`, so that file was never patched while diagnosis called the patch clean because its sibling file was. A candidate anchor is now included; both the host and profile copies carry the allowlist marker and pass `node --check`.
- **Legacy patches now report hit counts**: `probeCarrier` only read `replacements`, so the 7 patches declared with `patterns + replace` always showed zero hits. It now expands them the same way as modern patches.
- **Transaction temp cleanup**: failed writes no longer leave `.dshpurge.tx-*` files in the host tree.
- **Verification**: 3 new regression tests; `node --test` 212 passing / 0 failing; two consecutive live applies changed zero bytes across 62 carrier files (second apply: applied 0).
- Maintainer qiuqianyi66. Derivative work, Apache-2.0, LICENSE/NOTICE retained.

# 1.2.0

## 中文

- **本地重锚覆盖（用户可撤销）**：`$DSH_HOME/dsh-purge/anchor-overrides.json` 允许给某条补丁钉一个新锚点，`apply` / `status` / `diagnose` 共用同一份覆盖；覆盖项追加为候选，旧锚点 0 命中不再按命中数契约拒写，候选自带 `expect` 时仍严格校验。坏 JSON 只报错不生效，删文件即恢复；`--anchors` 只读查看，`--diagnose` 出 `⚓ 本地重锚 N 条生效`。
- **fail-closed 补丁写盘**：一条补丁的全部目标文件先在内存算完，提交前逐文件校验内容指纹，再原子写入；任一文件失败即把已写文件回滚到原文，报 `write_error:…:rolled_back_N`，不再出现「第 1 个文件改了、第 2 个失败」的半打状态。
- **候选锚点表与多版本声明**：`replacements[].pattern` 支持数组（旧版/新版原文二选一，唯一命中才替换，两版同时存在则整条拒写）；`package.json` 新增 `dshTargets`，可声明多个已验证宿主版本，命中其一即适配；诊断与探测同口径展开候选。
- **回归测试**：`test/anchor-overrides.test.js` 6 条 + `test/transaction.test.js` 6 条（事务提交/指纹拦改/失败回滚、候选命中/歧义拒写、多版本命中），全套 `node --test` 209 通过 / 0 失败，`npm run compat:check` 三者一致。
- 真机：无覆盖文件时行为不变（`--status` 70/71、`--diagnose` 42 命中、partial 0）；`--apply` 走事务路径后数字不变、无 write_error。
- 维护者 qiuqianyi66；本版本系原始项目（作者 YuJunZhiXue）的衍生作品，Apache-2.0，保留 LICENSE/NOTICE 版权声明。

## English

- **Local re-anchor overrides**: `$DSH_HOME/dsh-purge/anchor-overrides.json` lets you pin a new anchor for one patch; `apply`, `status` and `diagnose` read the same file. Overrides are appended as candidates, a zero-hit original no longer trips the hit-count contract, and an override that declares `expect` is still checked strictly. Broken JSON reports an error without taking effect; delete the file to restore. `--anchors` lists entries, `--diagnose` prints `⚓ 本地重锚 N 条生效`.
- **Fail-closed patch writes**: all target files of one patch are computed in memory first, fingerprinted before commit, then written atomically. Any failure rolls the already-written files back to their original text and reports `write_error:…:rolled_back_N`, so a patch is never half-applied.
- **Candidate anchor table and multi-version declaration**: `pattern` in `replacements` accepts an array (old/new upstream text, replace only when exactly one is present, refuse when both are); `package.json` gains `dshTargets` so several verified host versions can be declared, any match counts as supported.
- **Tests**: 6 anchor-override cases + 6 transaction cases (commit, fingerprint guard, rollback; candidate hit/ambiguity; multi-version match); `node --test` 209 passing / 0 failing, `npm run compat:check` consistent.
- Maintainer qiuqianyi66. Derivative work of the original project by YuJunZhiXue, Apache-2.0, LICENSE/NOTICE retained.

# 1.1.91

## 中文

- **修掉「status 说待清洗、diagnose 说没问题」的口径打架**：同一个载体键落到多份副本时（宿主自带 `pi-ai` 与 profile 里装的 `pi-ai` 各一份 `anthropic-messages.js` / `openai-completions.js`），`--status` 按文件计数报 pending，`--diagnose` 按「任一文件已生效」把整条判成 clean。现在诊断新增「部分副本未清洗」桶与每文件证据（`partial` / `pending_files`），两边口径归一；建议文案直接说“跑一次 apply 补齐，pattern 不用改”。
- **真机复现与修复**：#47 `ANTHROPIC_OAUTH_NO_CLAUDE_IDENTITY`、#49 `ANTHROPIC_OAUTH_CLI_NEUTRAL`、#57 `DEEPSEEK_SYSTEM_ROLE` 三条因 profile 侧 `pi-ai` 升级到 1.5.2、原文又匹配旧 pattern 而挂 pending；`--apply` 补齐后 `--status` = 70/71 已清洗、0 待清洗，`--diagnose` = 42 命中、partial 0、漂移 0。两份 pi-ai 文件 `node --check` 通过，原文件留 `.dshpurge.bak`。
- **回归测试**：新增 `test/diagnose-partial.test.js` 三条用例（一打一原文 → partial；两份都打 → clean；单文件 → 旧行为不变），全套 `node --test` 197 通过 / 0 失败。
- **文档**：中英 README 与 `llms.txt` 的证据数字同步为 42 命中 + 197 测试 + partial 0，FAQ 补上「部分副本未清洗」的判读方式。
- 维护者 qiuqianyi66；本版本系原始项目（作者 YuJunZhiXue）的衍生作品，Apache-2.0，保留 LICENSE/NOTICE 版权声明。

## English

- **Fixes the status-vs-diagnose contradiction**: when one carrier key maps to several copies (the host-bundled `pi-ai` and the `pi-ai` plugin installed under a profile each ship `anthropic-messages.js` / `openai-completions.js`), `--status` counted per file and reported pending while `--diagnose` took the strongest evidence and called the whole patch clean. Diagnosis now carries a dedicated *partially-patched copies* bucket with per-file evidence (`partial` / `pending_files`) so both commands agree, and the advice says exactly what to do: run apply once, no pattern change needed.
- **Reproduced and fixed on a real host**: #47, #49 and #57 sat in pending because the profile-side `pi-ai` had been upgraded to 1.5.2 and matched the old patterns again; one `--apply` caught it up — `--status` now reports 70/71 applied with 0 pending, `--diagnose` reports 42 matched, 0 partially-patched, 0 drift. Both patched `pi-ai` files pass `node --check` and keep their `.dshpurge.bak` originals.
- **Regression tests**: `test/diagnose-partial.test.js` covers half-patched → partial, fully patched → clean, and single-file → unchanged behaviour; `node --test` is 197 passing / 0 failing.
- **Docs**: the Chinese and English README plus `llms.txt` now carry the same numbers (42 matched, 197 tests, 0 partially-patched), and the FAQ explains the new state.
- Apache-2.0 derivative of the original project by YuJunZhiXue; LICENSE/NOTICE attribution preserved.

# 1.1.90

## 中文

- **适配 0.2.2-rc.3 桌面版的 asar 密封布局**：rc.3 把整个 dsh 运行时打进 `resources/app.asar`（209 MB），`resources/runtime` 为空，不再有 rc.1 的 `resources/app/dsh` 明文目录。面板点「应用」时插件会自动解开 asar 到 `resources/app`（451 MB、338 个 `@deepseek-ai` 包）、补上 `app.asar.unpacked` 的原生件、把 asar 改名 `.bak` 并重启宿主 —— 用户不用再自己跑脚本。
- **命令行不再漏掉桌面壳补丁**：CLI 跑在 node 里探不到 Electron 的 `resourcesPath`，过去会把自己判成 web 宿主，整批跳过 `surfaces: ["desktop"]` 的补丁（`#82 DESKTOP_SHELL_PROFILE_FALLBACK`、`#83`、`#84` 等）。1.1.90 起按 `aiBase` 是否落在 `resources/app/dsh/...` 自动判成 desktop，实测这 7 条从「na / pending」变成 applied。
- **`--apply` 末尾明说 asar 后果**：写完补丁后若 `app.asar` 仍在原位，提示「宿主会优先读它」并给出退出后改名的具体做法，不再让人以为打完就生效。
- **诊断口径修正（1.1.90 内）**：`--diagnose` 在 CLI 下把桌面宿主当成 web，桌面壳补丁全被标成「本表面不适用」；现在按 `aiBase` 是否落在 `resources/app/dsh/...` 自动判 desktop（rc.3 真机：本表面不适用 0）。另外 `#33`/`#48` 这类「替换文案就是 marker」的补丁，在 pattern 已全被替换、又没有 `.bak` 差异时被误判为「目标已消失」；新增 `markersStrict`，人造后置文案命中即算已生效（真机目标已消失 0）。
- **真机验证（0.2.2-rc.3 桌面版）**：82 条补丁 = 42 条文件核验命中（40 条靠 markers）+ 29 条无文件字段（运行时注入）+ 7 条本机无对应载体（可选：#28/#30/#31/#64/#65/#71/#76，hooks/preset 包没装）+ 4 条已退役；改过原文 0、目标已消失 0、载体缺失 0；重启宿主后插件自检日志记 `sealed:false` / `boot:host-untouched`。兼容矩阵 `hostSmoke` 由 `not-run` 改为 `verified`，`verifiedOn` 记为 2026-11-16。
- **安装提醒**：rc.3 起注册表项迁到 HKLM（per-machine），静默安装必须提权；升级前请用 `dsh-purge --preupdate` 看一遍「解包目录会与新版 asar 冲突」的预检结论。
- 维护者 qiuqianyi66；本版本系原始项目（作者 YuJunZhiXue）的衍生作品，Apache-2.0，保留 LICENSE/NOTICE 版权声明。

## English

- **Handles the sealed-`app.asar` layout of the 0.2.2-rc.3 desktop build**: rc.3 packs the whole dsh runtime into `resources/app.asar` (209 MB) and leaves `resources/runtime` empty, so the rc.1-era plain `resources/app/dsh` directory no longer exists. Pressing Apply in the panel now extracts the asar into `resources/app` (451 MB, 338 `@deepseek-ai` packages), overlays `app.asar.unpacked`, renames the asar to `.bak` and restarts the host — no manual script needed.
- **The CLI no longer drops desktop-shell patches**: running under plain node it cannot see Electron's `resourcesPath` and used to classify itself as a web host, silently skipping every `surfaces: ["desktop"]` patch (`#82`, `#83`, `#84`, …). 1.1.90 infers desktop from an `aiBase` under `resources/app/dsh/...`; those 7 patches went from `na / pending` to applied on a real rc.3 install.
- **`--apply` states the asar consequence**: if `app.asar` is still in place after writing, it now says the host reads it first and tells you to rename it after quitting.
- **Verified on a real 0.2.2-rc.3 desktop host**: 71 of 82 patches applied directly, 7 not applicable to this surface, 4 skipped, 0 drift, 4 retired; the plugin self-check log records `sealed:false` and `boot:host-untouched` after restart (6 processes, port 65088). The matrix `hostSmoke` cell moves from `not-run` to `verified`, `verifiedOn` is 2026-11-16.
- Apache-2.0 derivative of the original project by YuJunZhiXue; LICENSE/NOTICE attribution preserved.

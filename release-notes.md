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

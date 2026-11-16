<div align="center">

<img src="docs/banner.svg" alt="dsh-purge — red-team evaluation plugin for DeepSeek Harness" width="720">

# dsh-purge

**A local red-team evaluation plugin for DeepSeek Harness: 82 host patches plus per-model prompts, one-click revert. Requires DSH `0.2.2-rc.3`, Node ≥ 18.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat)](LICENSE)
[![Release](https://img.shields.io/github/v/release/qiuqianyi66/dsh-purge?label=Release)](https://github.com/qiuqianyi66/dsh-purge/releases/latest)
[![Test](https://github.com/qiuqianyi66/dsh-purge/actions/workflows/test.yml/badge.svg)](https://github.com/qiuqianyi66/dsh-purge/actions/workflows/test.yml)
[![Patches](https://img.shields.io/badge/patches-82-informational)](lib/core.js)
[![Audit](https://img.shields.io/badge/rc.3%20audit-0%20drift-brightgreen)](compat.json)

**Read this first:** authorized, self-owned environments only. Licensing in [§1](#1-license-copyright-and-redistribution), safety limits in [§2](#2-hard-safety-limits).

<p align="center">
  <img src="docs/demo/dsh-purge-demo.gif" alt="dsh-purge 23-second demo: install → diagnose → pre-upgrade audit → unit tests" width="100%">
</p>

<p align="center"><sub>▲ 23 s · every frame is real command output (measured 2026-11-16) · <a href="docs/demo/dsh-purge-demo.mp4">Download MP4</a> · reproduce with <code>python scripts/render-demo.py</code></sub></p>

[中文 README](./README.md) · [Quick facts](#0-quick-facts-cite-ready) · [License](#1-license-copyright-and-redistribution) · [Safety](#2-hard-safety-limits) · [Install](#4-install-two-minutes) · [Capabilities](#6-what-it-does) · [Compatibility](#7-compatibility-and-measured-data-2026-11-16) · [Pre-upgrade audit](#8-audit-before-upgrading-and-drift-diagnosis) · [FAQ](#11-faq) · [llms.txt](./llms.txt)

</div>

---

## 0. Quick facts (cite-ready)

> dsh-purge is a local red-team evaluation plugin for **DeepSeek Harness (DSH)**: 82 grouped host patches plus per-model prompt presets separate a host-layer policy block from a model refusal, every touched file is backed up and revertible, and an isolated audit tells you before upgrading whether the patterns will silently stop matching.

1. **Scale** — 82 patches across 65 carrier keys (concrete host files), covering both the web and desktop surfaces.
2. **Requirements** — target host DSH `0.2.2-rc.3`, Node.js ≥ 18, installed into a profile's `node_modules`; nothing global, nothing written to remote repositories.
3. **Evidence** — live `--diagnose` on 2026-11-16: 71 matched (56 marker-confirmed, 3 verify-only, 1 default-state, 1 placeholder) + 7 carriers absent on this host + 4 retired, with **0 changed source, 0 dead target, 0 missing carriers, 0 partially-patched copies and 0 no-file-field**; `node --test` 233 passing.

| Quick fact | Value |
| --- | --- |
| Project / repository | `dsh-purge` · [qiuqianyi66/dsh-purge](https://github.com/qiuqianyi66/dsh-purge) |
| Version / host target | `1.2.9` / DSH `0.2.2-rc.3` (same as `dshTarget`) |
| License / upstream copyright | Apache-2.0 · Copyright 2026 YuJunZhiXue (see [`NOTICE`](./NOTICE)) |
| Requirements | Node.js ≥ 18; DSH desktop app or official `dsh web`; pnpm |
| One-line install | `dsh plugin --profile desktop add https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main` |
| Machine-readable | [`compat.json`](./compat.json) (version / matrix / evidence) · [`llms.txt`](./llms.txt) |
| Demo | [`docs/demo/dsh-purge-demo.gif`](docs/demo/dsh-purge-demo.gif) (23 s, real output) |
| Search terms | DSH jailbreak plugin · DeepSeek Harness plugin · host patches · prompt injection · red-team evaluation · LLM security |

**Suggested path:** [§4 Install](#4-install-two-minutes) → [§7 Compatibility](#7-compatibility-and-measured-data-2026-11-16) → [§8 Pre-upgrade audit](#8-audit-before-upgrading-and-drift-diagnosis).

---

## 1. License, copyright and redistribution

**License:** [Apache License 2.0](./LICENSE). Software provided "as is", without warranties of any kind.

**Upstream copyright (must be retained):** the codebase derives from the original `dsh-purge` by **YuJunZhiXue** (Copyright 2026). That notice and the license text are preserved verbatim in [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE), as Apache-2.0 §4 requires — removing them is infringement, not an option. Adaptation and distribution are maintained by [@qiuqianyi66](https://github.com/qiuqianyi66) from `1.1.84-rc1` onward.

**Original to this repository:** apart from the upstream notice inside `LICENSE` / `NOTICE`, the README, diagrams, scripts, compatibility matrix, audit tooling and wording here were written for this repository.

**Allowed:** read, deploy on your own machines, modify for personal use, redistribute under Apache-2.0 (commercial use included).

**Redistribution and forks must:** keep `LICENSE` and `NOTICE` unchanged; state the source repository <https://github.com/qiuqianyi66/dsh-purge> and upstream author YuJunZhiXue; describe your modifications (Apache-2.0 §4(b)); never rename it as your own original work.

**Prohibited:** paid resale, white-label relisting, paid-group redistribution, or stripping attribution. Violations terminate the license and are pursued.

**Independence:** no affiliation, partnership or endorsement by DeepSeek. "Official" here only means the official DeepSeek Harness build you installed locally, which is the object under test.

---

## 2. Hard safety limits

This is an evaluation tool, not an attack platform. The following limits are enforced by code, not relaxed by prose.

**Permitted:** your own local DSH install; offline synthetic targets; labs, ranges or private networks you are explicitly authorized to use.

**Prohibited:** any system you do not own or have written authorization for; public-network targets; production systems; game cheats; acting as a launchpad for outbound attacks; generating unlawful content.

| Limit | Actual behaviour | Source |
| --- | --- | --- |
| Target scope | Attack tasks allow loopback and RFC1918 only | `lib/redteam/` |
| Domain handling | Resolve to an IP first; `.lab` / `.htb` suffixes earn no exemption | same |
| Escalation channels | Keys, passwords, CIDRs, wildcards, spoken authorization add no exceptions | same |
| Shipped content | The OSS build ships no skill or knowledge bases; the console marks them unauthorized | console |
| Injection scope | Sealed `host-commands` / `runtime-commands` are always stripped, never injected | prompt-injection path |
| Write scope | Only your local `$DSH_HOME` and the profile's `@deepseek-ai` packages, each file backed up first | apply / revert |

**Liability:** you bear sole responsibility for every download, deployment, run, modification and redistribution, and for its consequences. Authors and contributors accept no liability. **If your use case is not in the permitted list, stop and delete this project.**

---

## 3. What it is, what it is not

**Is:** a plugin inside your local DeepSeek Harness. It separates "host policy blocked it" from "the model refused": the runtime rewrites system prompts, approval gates, sandbox policy and session formats, so both blocks look nearly identical — this plugin makes them distinguishable and revertible. It also carries a local range and rule sets for controlled robustness evaluation.

**Is not:** a general jailbreak service or online proxy; a public-network penetration framework; a fine-tuning or weight-editing tool; an official DSH component; an npm package (the name does not exist on npm, `pnpm add dsh-purge` always fails); a theme plugin.

---

## 4. Install: two minutes

**Prerequisites:** DeepSeek Harness `0.2.2-rc.3` (desktop app or official `dsh web`), Node.js ≥ 18, pnpm available.

```sh
# step 1 — install (use "desktop" for the desktop app, "web" for dsh web)
dsh plugin --profile desktop add https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main

# step 2 — confirm version (expect 1.2.9), run inside $DSH_HOME
node -p "require('./profiles/desktop/node_modules/dsh-purge/package.json').version"

# step 3 — confirm the host will load it (must print true)
node -p "require('./profiles/desktop/package.json').dsh.profile.bundles.includes('dsh-purge')"
```

Use `codeload.github.com` exactly; `github.com/.../archive` redirects with a 302 and pnpm reports `fetch failed`. If step 3 prints `false`, run `node node_modules/dsh-purge/scripts/ensure-profile-bundle.mjs` and restart.

**Step 4 — quit the host completely** (tray included on desktop), reopen it, then click **dsh-purge** next to the session title → "Purge" → "Apply".

**pnpm only, no `dsh` CLI:**

```sh
cd "$DSH_HOME/profiles/desktop"
pnpm add --allow-build=dsh-purge --allow-build="dsh-purge@https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main" https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main
```

pnpm 11/12 blocks install scripts by default (`ERR_PNPM_IGNORED_BUILDS`); approve later with the full specifier, not the bare name.

---

## 5. Three entry points

- **Console** next to the session title: grouped status of all 82 patches, apply / revert / uninstall, prompt editing, rule-set switching, local range assets.
- **CLI:** `node node_modules/dsh-purge/bin/dsh-purge.js --status | --diagnose [--json] | --preupdate [--json] | --apply | --revert | --uninstall | --edit`.
- **Chat and model tools:** `/purge status|apply|revert|uninstall|edit|help`, `/rules list|use|create|delete|reset`, `/skills list|import|create|delete`, `/rewind`; tools `purge_status`, `purge_apply`, `purge_revert`.

---

## 6. What it does

| Capability | What you see | Source |
| --- | --- | --- |
| Grouped patches | 82 patches listed by group, each with state: applied / pending / drift / carrier missing | `lib/core.js`, console |
| Coverage | 82 patches across 65 carrier keys (concrete host files) | `lib/core.js` |
| Per-model prompts | Different system prompts per model; rule sets switchable and revertible | `prompt-inject.md` path |
| One-click revert | Every touched file backed up as `.dshpurge.bak` before writing | apply / revert |
| Pre-upgrade audit | Isolated npm tree, each patch tried for real; proceed only when drift is 0 | `scripts/audit-next.mjs` |
| Drift diagnosis | Changed upstream text is reported as drift, never a silent "success" | `--diagnose` |
| Local range | Loopback and RFC1918 only, resolve-then-check | `lib/redteam/` |
| Version matrix | Host version, matrix and evidence levels generated from one source | `compat.json` ← `lib/compat-matrix.js` |

Sample of what a patch touches: #82 restores `DSH_PROFILE` when the desktop exe is launched by double click; #13 / #35 cover the sandbox escalation ladder and "never deny" decision, rewritten by rc.2 as `SandboxEscalationError`; #62 covers the `serviceAsk` fail-open branch, rewritten by rc.2 as `approvalDenial(...)`; #36 covers the `sandbox_permissions` justification string added in rc.2.

---

## 7. Compatibility and measured data (2026-11-16)

Current release `1.2.9` targets DSH `0.2.2-rc.3` (same value as `dshTarget`). `0.1.x` and `0.2.1-rc.x` are out of scope for this version — pick an older tag from [Releases](https://github.com/qiuqianyi66/dsh-purge/releases).

| dsh version | This repo | Evidence | Notes |
| --- | --- | --- | --- |
| **0.2.2-rc.3** | **1.2.9** | contract ✓ / apply-sim ✓ / host smoke ✓ / device ✗ | rc.3 desktop packs the runtime into `resources/app.asar`; Apply unpacks it, moves the asar aside and restarts. rc.2 introduced the new `SandboxEscalationError` / `approvalDenial` text; rc.2 and rc.3 carrier files are byte-identical |
| **0.2.2-rc.1** | **1.1.88** | contract ✓ / apply-sim ✓ / host smoke ✓ / device ✗ | Only rc.1 matches the old patterns; rc.2 and later need 1.1.89 patterns |
| **0.2.1-rc.x** | unknown | — | Not a target of this version |
| **0.2.0-rc.2** | **1.1.40+** | — | Older line, see Releases |
| **0.1.7** | **1.1.39-** | — | Older line, see Releases |

**Measured 2026-11-16 on a local Windows desktop `0.2.2-rc.3`:** isolated audit 45 carriers / 78 patches / 56 recognized / 6 verify-only / **drift 0** / 11 unaudited; isolated apply 58 applied / 49 files changed (39 `.js` syntax-clean); `cycle:isolated` gate OK 6/6 with 0 byte diff after revert; live host diagnosis 82 patches = **71 matched** (56 marker-confirmed / 3 verify-only / 1 default-state / 1 placeholder) + 7 carriers absent on this host + 4 retired, with **0 changed source, 0 dead target, 0 missing carrier, 0 partially-patched copies, 0 no-file-field**; `node --test` 233 passing / 0 failing. Machine-readable copy: [`compat.json`](./compat.json).

**rc.3 desktop packaging, the one thing to know:** the runtime ships inside `resources/app.asar` (209,021,953 B), `resources/runtime` is empty and there is no plain `resources/app/dsh` tree. Electron reads the asar before a same-named directory, so patches must land in plain files and the asar must move out of the way — Apply does both and restarts the host; CLI `--apply` prints the manual rename step instead of killing your process. Since `1.1.90` the CLI also detects a desktop host from the `aiBase` path, so desktop-shell patches are no longer skipped in a plain Node process.

---

## 8. Audit before upgrading, and drift diagnosis

Every prerelease can change the text a patch anchors on. One edited word and the pattern stops matching — the plugin still looks installed while nothing takes effect. Before upgrading the host:

```sh
npm run audit:next -- --version 0.2.2-rc.3                   # report only
npm run audit:next -- --version 0.2.2-rc.3 --fail-on drift  # exit 1 on drift, usable as a CI gate
```

Four verdicts: recognized / verify-only / realign-needed / unaudited. **Upgrade only when realign-needed is 0.** Day-to-day three-way check: `node scripts/upstream-sync.mjs --offline` (also `--plan`, `--json`); it reports `HOST_BEHIND_MATRIX` when your host is behind the matrix.

Before publishing a plugin prerelease, also run the isolated full-cycle gate (apply → revert, byte-for-byte comparison; exits 1 on any failed criterion. Requires a clean tree from `audit:next --refresh` first, ~1 GB, not run in CI):

```sh
npm run cycle:isolated -- --version 0.2.2-rc.3    # expect OK 6/6: clean / no out-of-tree targets / apply 0 failed / 0 drift / syntax clean / 0 diff after revert
```

Diagnosis states: *pending* means matched but not yet written; *drift* means upstream text changed; *carrier missing* means this host lacks that package and skipping is normal; *partially-patched copies* means the host tree is patched but a second copy (the plugin installed under a profile) is still raw — one --apply catches it up.

---

## 9. Revert, upgrade, uninstall

- **Revert** restores every `.dshpurge.bak` copy and deletes the backup; with no backup it strips the shim lines this plugin wrote. Your `prompt-inject.md` is left in place.
- **Lost baseline**: if a `.dshpurge.bak` is byte-identical to the body while the body already carries patch traces (the backup was taken *after* patching), reverting cannot bring the original back. Such files are no longer counted as reverted; they are reported as `baseline_lost` with the backup kept as evidence, and the only fix is rebuilding the baseline from the official package or `app.asar`. `--apply` warns about them before writing. The boot-time baseline refresh judges each file by the patch's own verdict, so a patched file is never mistaken for the official new version.
- **Upgrade** the host only after a clean audit, then re-run `--diagnose`.
- **Uninstall**: revert first, then uninstall; the CLI or `/purge uninstall` is equivalent.
- **Host rollback (rc.3 desktop):** rename `resources/app.asar.bak` back to `app.asar` and delete `resources/app`.

---

## 10. Position among similar projects

Few DSH plugins patch host sources; the known lines, checked 2026-11-15 against each repository's own description and `package.json`:

| Line | Status |
| --- | --- |
| Original `YuJunZhiXue/dsh-purge` | removed / private; last artifact verified only against `0.2.2-rc.1` |
| Mirror `mmparko/dsh-purge` | frozen at `1.1.71` / `dshTarget 0.2.0-rc.2` |
| This repo `qiuqianyi66/dsh-purge` | `1.2.9` / `0.2.2-rc.3`, with isolated audit, four evidence levels and `compat.json` |

**How to verify a fork really adapted:** do not trust `dshTarget` or the version string — grep its `lib/core.js` for text the new host introduced, such as `SandboxEscalationError`, `approvalDenial`, `this exact`. Missing means the patterns were never added and the install will silently mismatch.

---

## 11. FAQ

### No button after install?

Either `dsh.profile.bundles` lacks `"dsh-purge"` or `cordis.patch.yml` lacks the `id: dsh-purge` insert. Run `node node_modules/dsh-purge/scripts/ensure-profile-bundle.mjs`, then fully restart.

### Applied but behaviour unchanged?

Run `--diagnose`: drift means upstream text changed, pending means not yet written, carrier missing means this host lacks that package.

### Upstream rewrote the text and you do not want to wait for a release? Local re-anchor

Drop a new anchor for one patch into `$DSH_HOME/dsh-purge/anchor-overrides.json`; `apply`, `status` and `diagnose` all read the same file, deleting it restores the original behaviour, and no plugin source changes:

```json
{ "patches": { "57": { "pattern": "text in the new host build", "replacement": "patched text", "note": "rc.3 rewording" } } }
```

Overrides are **extra candidates**: older hosts keep matching the original anchor, newer hosts match the override; a zero-hit original no longer trips the hit-count contract, while an override that declares `expect` is still checked strictly. `dsh-purge --anchors` lists the entries and their parse result, `--diagnose` prints `⚓ 本地重锚 N 条生效` so the evidence always names its source, and a broken JSON only reports an error instead of taking effect.

### Two hard rules for writes and versions

- **Fail-closed writes** — every target file of one patch is computed in memory first; before committing, each file's content fingerprint is re-checked (the on-disk text must still be the text the patch was computed from), then written atomically. Any failure writes the already-written files back and reports `write_error:…:rolled_back_N`, so a patch never ends up half-applied.
- **Candidate anchors and multiple versions** — `pattern` in `replacements` may be an array (`["old text", "new text"]`); it replaces only when exactly one variant is present, and refuses the patch when both are. `dshTargets` in `package.json` may list several verified host versions; matching any one counts as supported. Do not list an unverified version — a clean `audit:next` with zero drift is the admission evidence.

### Why do console numbers differ between machines?

They are per surface; web and desktop are separate baselines. Compare only within the same host version and surface.

### Free?

Yes, Apache-2.0, commercial use allowed, but keep `LICENSE`, `NOTICE` and attribution. Resale and white-label relisting are prohibited.

### Public targets?

No. Loopback and RFC1918 only; public IPs, domains resolving public, failed resolutions and hosts-file tricks are all denied. See [§2](#2-hard-safety-limits).

---

## 12. Protocol for AI agents

1. Read [`compat.json`](./compat.json) first — version, target, matrix, evidence, install and audit commands.
2. Install only `dsh-purge` from `codeload.github.com`; never `pnpm add dsh-purge`, never the plugin marketplace (`already queued`).
3. Touch only the profile the user is actually running; web and desktop are separate.
4. Never click Apply or restart the host for the user — it writes their `@deepseek-ai` packages.
5. Before suggesting a host upgrade, run `npm run audit:next -- --version <version> --fail-on drift` and stop if drift is non-zero.
6. Report evidence by level (contract / apply-sim / smoke / device); never collapse them into "compatible".

---

## 13. Snapshot and license

All numbers above are a **2026-11-16** measurement on one Windows desktop `0.2.2-rc.3`, not a permanent truth; re-measure after any host, OS or plugin change.

[Apache License 2.0](./LICENSE) · upstream notice in [`NOTICE`](./NOTICE) (Copyright 2026 YuJunZhiXue; maintainer qiuqianyi66) · redistributing requires both, plus a description of your changes.

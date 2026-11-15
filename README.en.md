<div align="center">

<img src="docs/banner.svg" alt="dsh-purge — jailbreak and red-team evaluation plugin for DeepSeek Harness" width="720">

# dsh-purge · DeepSeek Harness red-team plugin

**Separate a host-layer block from a model refusal, inside your own DSH install.**

Grouped host patches · per-model prompt presets · one-click revert · Apache-2.0 · targets DSH `0.2.2-rc.3`

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/dsh-0.2.2--rc.3-blue)](https://www.deepseek.com/harness/)
[![Patches](https://img.shields.io/badge/patches-82-informational)](lib/core.js)
[![Audit](https://img.shields.io/badge/rc.3%20audit-0%20drift-brightgreen)](compat.json)

```sh
dsh plugin --profile web add https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main
```

Swap `web` for `desktop` on the desktop app. Then **quit the host completely**, reopen it, click **dsh-purge** next to the session title → "Purge" → "Apply".

[中文 README](./README.md) · [Compatibility & evidence](#compatibility--evidence) · [Audit before upgrading](#audit-before-you-upgrade) · [FAQ](#faq)

</div>

> ⚠️ **Authorized local / intranet labs only.** The open-source build allows loopback and RFC1918 targets only. No public-network attacks, no game cheats, no resale. Full legal terms are in the [Chinese README](./README.md#署名与许可证).

> **Maintainer (2026-11)**: a derivative of the original dsh-purge by **YuJunZhiXue** (upstream no longer public), maintained and distributed by [@qiuqianyi66](https://github.com/qiuqianyi66). Current release **1.1.89**, targeting DSH **0.2.2-rc.3**.

---

## What it is for

DeepSeek Harness does more than forward prompts: it rewrites the system prompt, approval gates, sandbox policy and session format. A host-side block and a model refusal look almost identical from the outside. dsh-purge makes the host-side layer **observable and reversible**:

- 82 grouped patches across 65 carrier files (host source files), each with an id, a name and a human-readable note.
- Per-model prompt presets plus switchable rule sets (`AGENTS.md` / `CLAUDE.md`).
- Every patched file is backed up as `.dshpurge.bak` before writing; revert restores it.
- Drift is reported, never silently "skipped": if the official source text changed, the panel says so.

It patches your **local** official `@deepseek-ai` packages only. It is not a network scanner and ships no attack payloads.

## Install

| Situation | Command |
| --- | --- |
| `dsh` CLI available | `dsh plugin --profile web add https://codeload.github.com/qiuqianyi66/dsh-purge/tar.gz/refs/heads/main` |
| pnpm only | `cd "$DSH_HOME/profiles/web"` (or `profiles/desktop`), then `pnpm add` the same URL |
| Desktop client | use the `dsh://plugin/install` link in the Chinese README |

Do **not** install through a plugin marketplace (`already queued` error), and do **not** `pnpm add dsh-purge` — that name is not on npm. Use the `codeload.github.com` tarball URL; `github.com/.../archive` redirects and makes pnpm fail with `fetch failed`.

After installing, make sure the profile's `dsh.profile.bundles` contains `"dsh-purge"` and `cordis.patch.yml` contains an insert with `id: dsh-purge`; otherwise the host never loads the plugin and no button appears. `node node_modules/dsh-purge/scripts/ensure-profile-bundle.mjs` repairs both.

## Compatibility & evidence

`1.1.89` targets DSH `0.2.2-rc.3`. Do not use it on `0.1.x` or `0.2.1-rc.x`.

The full matrix lives in [`compat.json`](./compat.json) (generated from `lib/compat-matrix.js`, checked by `npm run compat:check`). Evidence is reported at four levels, and they are never collapsed into one "supported" claim:

- **contract** — official package text matches every patch pattern (off-host audit).
- **apply** — patches are really applied to an isolated copy and the results pass `node --check`.
- **smoke** — a real host reports `drift 0` and boots.
- **device** — a human verified the panel/buttons on a patched real host.

Last mechanical verification (2026-11-15): rc.3 audit — 45 carrier keys, 78 patches, 56 recognized, 6 verify-only, **0 needing realignment**, 11 unaudited; apply simulation — 58 applied, 31 JS files checked, 0 syntax failures; real host (`0.2.2-rc.1`) — 82 patches, 0 source-drift; unit tests 194/194. rc.2 and rc.3 carrier files are byte-identical, so the realignment work originates in rc.2.

## Audit before you upgrade

A host release can change the exact text a patch anchors on. When that happens the plugin still "looks installed" while **none of its patches land** — silent failure. Audit the next version off-host, before touching your running install:

```sh
npm run audit:next -- --version 0.2.2-rc.3
npm run audit:next -- --version 0.2.2-rc.3 --fail-on drift    # exit 1 for CI gates
```

Verdicts: `recognized` / `verify-only` (marker-only, no replacement) / `needs realignment` (carrier present, text changed) / `unaudited` (package not in that release). Only `needs realignment = 0` means "safe to upgrade". "Recognized" is not "supported": a real host still has to boot and be checked.

## Usage

```sh
dsh-purge --status
dsh-purge --diagnose [--json] [--all-hosts]   # read-only drift diagnosis
dsh-purge --preupdate [--json]                # read-only pre-upgrade check
dsh-purge --apply | --revert | --uninstall | --edit | --help

/purge status | apply | revert | uninstall | edit | help
purge_status   purge_apply   purge_revert     # model-facing tools
```

Three states to keep apart: **pending** (text matches, not written yet), **drifted** (official text changed, patch cannot land), **carrier missing** (that package is not installed here — a normal skip).

## FAQ

**Does installing modify the harness?** Only when you click "Apply"; each target file is backed up first and can be restored from the panel. No official repository is touched.

**No button after install?** Missing `"dsh-purge"` in `dsh.profile.bundles`, or missing the `id: dsh-purge` insert in `cordis.patch.yml`. Run `ensure-profile-bundle.mjs`, then fully restart the host.

**Nothing changed after Apply?** Run `dsh-purge --diagnose`: `drifted` means the host source changed and the patches need realignment; `pending` means the write has not happened yet.

**Why do panel numbers differ between people?** The panel counts per host surface; web and desktop are two different baselines.

**Can it attack public targets?** No. Loopback and RFC1918 only; hostnames are resolved first and public addresses are blocked.

**License?** Apache-2.0. Redistribution and derivative work must keep `LICENSE`, `NOTICE` and attribution to [qiuqianyi66/dsh-purge](https://github.com/qiuqianyi66/dsh-purge) (original author YuJunZhiXue). Resale is not allowed.

## How to verify a fork "really" supports a new release

Do not trust the `dshTarget` field or the version number. Search that fork's `lib/core.js` for the literals the new release introduced — e.g. `SandboxEscalationError`, `approvalDenial`, `this exact`. If they are absent, those patterns were never added and the plugin will fail silently on that host.

## Limits

- Patches anchor on official text; structural upstream changes cost a real realignment. The plugin makes failure visible, it cannot predict upstream edits.
- Panel/button acceptance needs a human; CI covers contract + apply + unit tests.
- Community desktop builds are not supported; official npm-global installs are not patched.
- `0.1.x` and `0.2.1-rc.x` are out of scope.

## For AI agents

Read [`compat.json`](./compat.json) first — it carries `version`, `dshTarget`, the matrix, evidence levels, install command and audit command. Install only into the profile the user actually runs, never click "Apply" on their behalf, never restart their host, and run `audit:next --fail-on drift` before recommending an upgrade. Do not describe an audit result as "compatible": report the evidence level.

---

Apache-2.0 · original author **YuJunZhiXue** · maintained by [qiuqianyi66](https://github.com/qiuqianyi66)

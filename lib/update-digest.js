// F14 续：归档摘要台账（TOFU，首次使用即固定）。
//
// 前面 update-verify 已经能拿期望摘要比对，但「期望值从哪来」一直是空的：
// GitHub 不发布源码归档摘要，env 变量又要人工填。这里补一条自动来源：
// 同一份**不可变**归档（按 40 位 commit sha 取）第一次通过校验后把摘要记下来，
// 之后再下同一个 sha 就自动要求一致——被换包/被劫持会在 verify 阶段被拦下，
// 而分支名（main/beta）会正常前移，不参与固定，避免误伤常规升级。
import fs from "node:fs";
import path from "node:path";
import { atomicWriteSync } from "./core.js";

const MAX_ENTRIES = 200;

export function digestLedgerPath(dshHome) {
  return path.join(String(dshHome || ""), "dsh-purge", "archive-digests.json");
}

/** 归档的不可变键：只有 40 位 commit sha 才固定；分支/tag 返回空串表示不参与。 */
export function digestKey(ref) {
  const value = String(ref || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) return "";
  return `sha:${value}`;
}

export function readDigestLedger(dshHome) {
  const out = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(digestLedgerPath(dshHome), "utf8")) || {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k === "at") continue;
      if (typeof v === "string" && /^[0-9a-f]{64}$/.test(v)) out[k] = v;
    }
  } catch {
    return {};
  }
  return out;
}

/** 记一条摘要；键为空（分支/tag）时不写盘，直接返回原台账。 */
export function rememberDigest(ledger, key, sha256, dshHome, now = new Date()) {
  const next = { ...(ledger || {}) };
  if (!key || !/^[0-9a-f]{64}$/.test(String(sha256 || ""))) return next;
  next[key] = String(sha256);
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES) {
    // 超出上限按写入时间无法判断就先砍最早的键序，保证文件不会无限长。
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k];
  }
  try {
    fs.mkdirSync(path.dirname(digestLedgerPath(dshHome)), { recursive: true });
    atomicWriteSync(digestLedgerPath(dshHome), `${JSON.stringify({ ...next, at: now.toISOString() }, null, 2)}\n`);
  } catch {
    // 台账写失败不影响更新流程：只是这一次没固定住。
  }
  return next;
}

/**
 * 该用哪个期望摘要：
 * 1) 调用方显式给的（env / 参数）优先；
 * 2) 否则用台账里同 sha 的既有记录；
 * 3) 都没有 → 空串，verify 如实标 unverified。
 */
export function expectedDigestFor({ ref = "", explicit = "", ledger = {} } = {}) {
  const want = String(explicit || "").trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(want)) return { expectedSha256: want, source: "explicit" };
  const key = digestKey(ref);
  const recorded = key ? ledger[key] : "";
  if (recorded) return { expectedSha256: recorded, source: "ledger" };
  return { expectedSha256: "", source: "none" };
}

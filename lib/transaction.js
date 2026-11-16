// lib/transaction.js — 单补丁级别的 fail-closed 写盘事务
//
// 为什么需要它：apply 一条补丁可能落到多个文件（桌面宿主 + profile 副本）。过去逐个
// `saveText`，第 2 个文件 EBUSY 时第 1 个已经落盘，补丁停在「半打」状态，而报告只会
// 记一条 write_error。这里改成：先把这条补丁的全部目标文件读出来算好，再统一提交；
// 提交前逐文件校验「磁盘内容仍是计算时那份原文」（内容指纹），
// 任何一步不符就整批回滚，一个字节都不留。

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function atomicWrite(fp, buf) {
  const tmp = `${fp}.dshpurge.tx-${process.pid}-${Math.random().toString(16).slice(2)}`;
  // 同目录临时文件 + rename：断电/EBUSY 不会留下半个文件。
  await fs.writeFile(tmp, buf);
  try {
    await fs.rename(tmp, fp);
  } catch (e) {
    // 提交失败不能把自己的临时文件留在用户目录里。
    try {
      await fs.unlink(tmp);
    } catch {
      /* 临时文件也被占：交给上层报告，至少不再继续写 */
    }
    throw e;
  }
}

async function readOrNull(fp) {
  try {
    return await fs.readFile(fp);
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
}

/**
 * 提交一组文件改写。
 * @param {Array<{fp: string, base: string, next: string}>} entries
 * @returns {Promise<{ok: boolean, written: number, rolled_back: number, reason?: string, fp?: string}>}
 */
export async function commitFileBatch(entries, io = {}) {
  const writeFile = typeof io.write === "function" ? io.write : atomicWrite;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, written: 0, rolled_back: 0 };
  }
  // 1) 指纹校验：计算时读到的原文必须仍是磁盘上那份，否则证明有别的进程改过。
  for (const e of entries) {
    const current = await readOrNull(e.fp);
    if (current == null) return { ok: false, written: 0, rolled_back: 0, reason: "mutation_detected", fp: e.fp };
    if (sha256(current) !== sha256(Buffer.from(e.base, "utf8"))) {
      return { ok: false, written: 0, rolled_back: 0, reason: "mutation_detected", fp: e.fp };
    }
  }
  // 2) 逐个提交；任何一个失败，把已写过的全部写回原文。
  const done = [];
  let written = 0;
  try {
    for (const e of entries) {
      const next = Buffer.from(e.next, "utf8");
      const current = await readOrNull(e.fp);
      if (current && sha256(current) === sha256(next)) continue;
      await writeFile(e.fp, next);
      done.push(e);
      written += 1;
    }
    return { ok: true, written, rolled_back: 0 };
  } catch (e) {
    let rolled = 0;
    for (const d of done.reverse()) {
      try {
        await writeFile(d.fp, Buffer.from(d.base, "utf8"));
        rolled += 1;
      } catch {
        /* 回滚也失败：保留已写状态，由调用方报告，不再二次覆盖 */
      }
    }
    return {
      ok: false,
      written: 0,
      rolled_back: rolled,
      reason: "write_error",
      fp: done[0]?.fp || entries[0]?.fp || "",
      detail: e?.code || String(e?.message || e),
    };
  }
}

/** 事务日志：只给诊断/自检用，不参与判定。 */
export function journalLine(result, patchId) {
  if (!result) return "";
  const tag = result.ok ? "committed" : "rolled_back";
  const extra = result.reason ? ` ${result.reason}${result.detail ? `(${result.detail})` : ""}` : "";
  return `tx #${patchId} ${tag} written=${result.written} rolled_back=${result.rolled_back}${extra}`;
}

// F14 续：归档摘要台账（TOFU）——谁提供期望值、什么情况才固定、坏数据不能污染台账。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  digestKey,
  digestLedgerPath,
  readDigestLedger,
  rememberDigest,
  expectedDigestFor,
} from "../lib/update-digest.js";

const H = (c) => c.repeat(64);
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

test("只有 40 位 commit sha 参与固定，分支与 tag 不固定", () => {
  assert.equal(digestKey(SHA_A), `sha:${SHA_A}`);
  assert.equal(digestKey(SHA_A.toUpperCase()), `sha:${SHA_A}`);
  assert.equal(digestKey("main"), "");
  assert.equal(digestKey("v1.1.88"), "");
  assert.equal(digestKey(""), "");
  assert.equal(digestKey("abc1234"), "", "短 sha 也会前移，不算不可变");
});

test("显式摘要优先于台账，其次台账，都没有就返回空（verify 标 unverified）", () => {
  const ledger = { [`sha:${SHA_A}`]: H("1") };
  assert.deepEqual(expectedDigestFor({ ref: SHA_A, explicit: H("2"), ledger }), {
    expectedSha256: H("2"),
    source: "explicit",
  });
  assert.deepEqual(expectedDigestFor({ ref: SHA_A, ledger }), { expectedSha256: H("1"), source: "ledger" });
  assert.deepEqual(expectedDigestFor({ ref: SHA_B, ledger }), { expectedSha256: "", source: "none" });
  assert.deepEqual(expectedDigestFor({ ref: "main", ledger }), { expectedSha256: "", source: "none" });
  // 显式值不是 64 位十六进制就当没给，回落台账，不拿坏值去比对
  assert.equal(expectedDigestFor({ ref: SHA_A, explicit: "not-a-hash", ledger }).source, "ledger");
});

test("记住摘要后读写一致，坏键与坏摘要不入账", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dshp-digest-"));
  let ledger = {};
  ledger = rememberDigest(ledger, `sha:${SHA_A}`, H("3"), home);
  assert.equal(ledger[`sha:${SHA_A}`], H("3"));
  // 空键（分支）不写盘也不进内存
  assert.deepEqual(rememberDigest(ledger, "", H("4"), home), ledger);
  // 非法摘要不写入
  assert.deepEqual(rememberDigest(ledger, `sha:${SHA_B}`, "zzz", home), ledger);

  const read = readDigestLedger(home);
  assert.equal(read[`sha:${SHA_A}`], H("3"));
  assert.equal(typeof read.at, "undefined", "时间戳字段不能混进键空间");

  // 台账文件本身是合法 JSON 且不含明文路径字段
  const raw = JSON.parse(fs.readFileSync(digestLedgerPath(home), "utf8"));
  assert.equal(raw[`sha:${SHA_A}`], H("3"));
  fs.rmSync(home, { recursive: true, force: true });
});

test("台账损坏时读成空表，不抛错也不让更新流程停", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dshp-digest-bad-"));
  fs.mkdirSync(path.join(home, "dsh-purge"), { recursive: true });
  fs.writeFileSync(digestLedgerPath(home), "{not json", "utf8");
  assert.deepEqual(readDigestLedger(home), {});
  assert.equal(expectedDigestFor({ ref: SHA_A, ledger: readDigestLedger(home) }).source, "none");
  fs.rmSync(home, { recursive: true, force: true });
});

test("台账条数有上限，不会无限长", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dshp-digest-cap-"));
  let ledger = {};
  for (let i = 0; i < 205; i += 1) {
    const sha = i.toString(16).padStart(40, "0");
    ledger = rememberDigest(ledger, `sha:${sha}`, H("5"), home);
  }
  const keys = Object.keys(ledger);
  assert.ok(keys.length <= 200, `台账应被裁到 200 以内，实际 ${keys.length}`);
  fs.rmSync(home, { recursive: true, force: true });
});

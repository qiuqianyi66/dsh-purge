// N5 回归：宿主升级后 .dshpurge.bak 是旧版原文，还原前必须按宿主版本拦下。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { revertGuard, writeBakStamp, readBakStamp, hostStampIsStale, bakStampPath } from "../lib/restore-guard.js";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-stamp-"));

test("打戳后可读回宿主版本", () => {
  assert.equal(writeBakStamp({ dshHome: home, hostVersion: "0.2.2-rc.1", aiBase: "X", pluginVersion: "1.1.84-rc1", at: "2026-11-10T00:00:00.000Z" }), true);
  const stamp = readBakStamp(home);
  assert.equal(stamp.hostVersion, "0.2.2-rc.1");
  assert.equal(stamp.pluginVersion, "1.1.84-rc1");
  assert.equal(stamp.at, "2026-11-10T00:00:00.000Z");
});

test("宿主版本变了 → 拦下，不做任何还原（消息里给出两个版本与出路）", () => {
  const guard = revertGuard({ dshHome: home, currentHost: "0.2.3" });
  assert.equal(guard.blocked, true);
  assert.match(guard.message, /0\.2\.2-rc\.1/);
  assert.match(guard.message, /0\.2\.3/);
  assert.match(guard.message, /--apply/);
  assert.match(guard.message, /--force/);
});

test("宿主版本没变 → 放行", () => {
  assert.equal(revertGuard({ dshHome: home, currentHost: "0.2.2-rc.1" }).blocked, false);
});

test("--force 时放行，但标记 forced（给调用方日志用）", () => {
  const guard = revertGuard({ dshHome: home, currentHost: "0.2.3", force: true });
  assert.equal(guard.blocked, false);
  assert.equal(guard.forced, true);
});

test("没有戳（老安装）→ 不拦也不谎报安全，标记 unknown", () => {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-stamp-empty-"));
  const guard = revertGuard({ dshHome: fresh, currentHost: "0.2.3" });
  assert.equal(guard.blocked, false);
  assert.equal(guard.unknown, true);
  assert.equal(fs.existsSync(bakStampPath(fresh)), false);
});

test("任一侧版本读不到就不判过期（不制造假拦截）", () => {
  assert.equal(hostStampIsStale("", "0.2.3"), false);
  assert.equal(hostStampIsStale("0.2.2", ""), false);
  assert.equal(hostStampIsStale(" 0.2.2 ", "0.2.2"), false);
  assert.equal(hostStampIsStale("0.2.2", "0.2.3"), true);
});

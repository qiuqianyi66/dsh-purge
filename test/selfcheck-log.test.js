// F17：启动自检留痕。锁三件事：结构化可解析、敏感字段被剔除、超限会轮转。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  selfcheckLogPath,
  sanitizeSelfcheckEvent,
  appendSelfcheckEvent,
  readSelfcheckLog,
  SELFCHECK_LOG_MAX_BYTES,
} from "../lib/selfcheck-log.js";

function tmpHome(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dsh-purge-log-${tag}-`));
  return dir;
}

test("日志路径落在状态目录 dsh-purge/logs 下", () => {
  const home = path.join("C:", "Users", "x", ".dsh");
  assert.equal(selfcheckLogPath(home).replace(/\\/g, "/"), "C:/Users/x/.dsh/dsh-purge/logs/selfcheck.log");
});

test("敏感字段被剔除，长字符串截断，深层结构不无限展开", () => {
  const clean = sanitizeSelfcheckEvent({
    action: "apply",
    token: "ghp_secret",
    nested: { authorization: "Bearer abc", apiKey: "k", ok: 1 },
    note: "x".repeat(400),
    list: Array.from({ length: 20 }, (_, i) => i),
  });
  assert.equal(clean.token, undefined);
  assert.equal(clean.nested.authorization, undefined);
  assert.equal(clean.nested.apiKey, undefined);
  assert.equal(clean.nested.ok, 1);
  assert.equal(clean.note.length, 158, "160 截断 + 省略号");
  assert.equal(clean.list.length, 13, "12 项 + 计数标记");
  assert.match(clean.list[12], /\+8/);
});

test("追加一条后能原样读回，坏行不影响解析", () => {
  const home = tmpHome("append");
  const r = appendSelfcheckEvent({ dshHome: home, action: "apply", data: { hosts: [{ aiBase: "D:/host", summary: { applied: 55 } }], token: "should-drop" } });
  assert.equal(r.ok, true);
  assert.equal(fs.existsSync(r.path), true);

  // 手写一条坏行，模拟写入被截断
  fs.appendFileSync(r.path, "{not json}\n", "utf8");
  const { entries } = readSelfcheckLog({ dshHome: home, limit: 10 });
  assert.equal(entries.length, 1, "坏行被跳过");
  assert.equal(entries[0].action, "apply");
  assert.equal(entries[0].hosts[0].summary.applied, 55);
  assert.equal(entries[0].token, undefined, "敏感字段没落盘");
  assert.match(entries[0].ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("超过上限会轮转，老文件滚成 .1 而不是无限增长", () => {
  const home = tmpHome("rotate");
  const logPath = selfcheckLogPath(home);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `${"y".repeat(200)}\n`, "utf8");
  const small = 260;
  const a = appendSelfcheckEvent({ dshHome: home, action: "apply", data: { pad: "z".repeat(100) }, maxBytes: small, keep: 2 });
  assert.equal(a.ok, true);
  assert.equal(fs.existsSync(`${logPath}.1`), true, "老内容被滚到 .1");
  assert.ok(fs.statSync(logPath).size <= small + 200, "新文件重新从小开始");
  const { entries } = readSelfcheckLog({ dshHome: home, limit: 5 });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "apply");
});

test("写不进去也不抛——返回 ok=false 让调用方继续跑主流程", () => {
  const badHome = path.join(tmpHome("bad"), "logs-is-a-file");
  fs.writeFileSync(badHome, "occupied", "utf8");
  const r = appendSelfcheckEvent({ dshHome: path.join(badHome, "nested"), action: "apply" });
  assert.equal(r.ok, false);
  assert.equal(typeof r.error, "string");
});

test("默认上限是个正数常量（避免有人把轮转阈值设成 0 变相关掉）", () => {
  assert.equal(typeof SELFCHECK_LOG_MAX_BYTES, "number");
  assert.ok(SELFCHECK_LOG_MAX_BYTES >= 64 * 1024);
});

// N5 回归（第二层）：revertAllHosts 会枚举多个宿主，守卫必须逐宿主判，
// 不能只看当前 state.ai_base —— 只看一处会把其它宿主（归档残留/临时环境）的补丁还原掉。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-hosts-"));
const dshHome = path.join(root, "home");
fs.mkdirSync(path.join(dshHome, "dsh-purge"), { recursive: true });
process.env.DSH_HOME = dshHome;
process.env.DSH_SURFACE = "web";

const core = await import("../lib/core.js");
const guard = await import("../lib/restore-guard.js");

function makeBase(version, tag) {
  const aiBase = path.join(root, `base-${tag}`);
  fs.mkdirSync(path.join(aiBase, "dsh"), { recursive: true });
  fs.mkdirSync(path.join(aiBase, "dsh-tool-bash", "lib"), { recursive: true });
  fs.writeFileSync(path.join(aiBase, "dsh", "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version }), "utf8");
  const fp = path.join(aiBase, "dsh-tool-bash", "lib", "index.js");
  fs.writeFileSync(fp, "PATCHED BODY\n", "utf8");
  fs.writeFileSync(`${fp}.dshpurge.bak`, "ORIGINAL BODY\n", "utf8");
  return { aiBase, fp };
}

guard.writeBakStamp({ dshHome, hostVersion: "0.2.2-rc.1", aiBase: "x", pluginVersion: "1.1.84-rc1" });

const stale = makeBase("0.2.3", "stale");
const fresh = makeBase("0.2.2-rc.1", "fresh");

test("宿主版本不一致的那个宿主被拦下，同批里版本一致的照常还原", async () => {
  const r = await core.revertAllHosts({ bases: [stale.aiBase, fresh.aiBase] });
  assert.equal(r.blocked.length, 1);
  assert.equal(r.blocked[0].aiBase, stale.aiBase);
  assert.match(r.blocked[0].message, /0\.2\.3/);
  assert.deepEqual(r.reverted, [fresh.fp]);
  // 被拦下的宿主一个字节都不动，bak 也留着
  assert.equal(fs.readFileSync(stale.fp, "utf8"), "PATCHED BODY\n");
  assert.equal(fs.existsSync(`${stale.fp}.dshpurge.bak`), true);
  // 放行的那个已还原并删 bak
  assert.equal(fs.readFileSync(fresh.fp, "utf8"), "ORIGINAL BODY\n");
  assert.equal(fs.existsSync(`${fresh.fp}.dshpurge.bak`), false);
});

test("force 时不再拦，过期宿主也被还原（调用方明确承担后果）", async () => {
  fs.writeFileSync(stale.fp, "PATCHED BODY\n", "utf8");
  fs.writeFileSync(`${stale.fp}.dshpurge.bak`, "ORIGINAL BODY\n", "utf8");
  const r = await core.revertAllHosts({ bases: [stale.aiBase], force: true });
  assert.equal(r.blocked.length, 0);
  assert.deepEqual(r.reverted, [stale.fp]);
  assert.equal(fs.readFileSync(stale.fp, "utf8"), "ORIGINAL BODY\n");
});

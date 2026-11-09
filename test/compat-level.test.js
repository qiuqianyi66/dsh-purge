import test from "node:test";
import assert from "node:assert/strict";
import { compatLevelFromState } from "../lib/core.js";

test("无 aiBase → unknown，不谎报", () => {
  const r = compatLevelFromState({});
  assert.equal(r.level, "unknown");
  assert.match(r.evidence, /未定位/);
});

test("定位到宿主但版本未能比对 → kernel-only", () => {
  const r = compatLevelFromState({ ai_base: "/x", host_compat_known: false });
  assert.equal(r.level, "kernel-only");
  assert.match(r.evidence, /未能解析/);
});

test("版本已知但不适配 → unsupported，证据带版本与目标", () => {
  const r = compatLevelFromState({
    ai_base: "/x",
    host_compat_known: true,
    host_supported: false,
    host_version: "0.3.0",
    host_target: "0.2.2-rc.1",
  });
  assert.equal(r.level, "unsupported");
  assert.match(r.evidence, /0\.3\.0/);
  assert.match(r.evidence, /0\.2\.2-rc\.1/);
});

test("版本与目标一致 → located", () => {
  const r = compatLevelFromState({
    ai_base: "/x",
    host_compat_known: true,
    host_supported: true,
    host_version: "0.2.2-rc.1",
    host_target: "0.2.2-rc.1",
  });
  assert.equal(r.level, "located");
  assert.match(r.evidence, /一致/);
});

test("known=false 且无 aiBase 时仍归 unknown（不被已知标记误导）", () => {
  const r = compatLevelFromState({ ai_base: "", host_compat_known: true, host_supported: false });
  assert.equal(r.level, "unknown");
});

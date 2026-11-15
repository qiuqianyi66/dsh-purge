import test from "node:test";
import assert from "node:assert/strict";
import { compareDshVersion } from "../lib/compat-matrix.js";

test("rc 序号比较：rc.3 比 rc.1 新", () => {
  assert.equal(compareDshVersion("0.2.2-rc.3", "0.2.2-rc.1"), 1);
  assert.equal(compareDshVersion("0.2.2-rc.1", "0.2.2-rc.3"), -1);
  assert.equal(compareDshVersion("0.2.2-rc.3", "0.2.2-rc.3"), 0);
});

test("正式版比同号预发布新", () => {
  assert.equal(compareDshVersion("0.2.2", "0.2.2-rc.3"), 1);
  assert.equal(compareDshVersion("0.2.2-rc.3", "0.2.2"), -1);
});

test("主版本更高即更新，与预发布无关", () => {
  assert.equal(compareDshVersion("0.2.3-rc.1", "0.2.2-rc.3"), 1);
  assert.equal(compareDshVersion("0.3.0", "0.2.9"), 1);
});

test("解析不了就返回 0，不许据此推进 target", () => {
  assert.equal(compareDshVersion("0.2.2-rc.1 ~ rc.2", "0.2.2-rc.3"), 0);
  assert.equal(compareDshVersion("", "0.2.2-rc.3"), 0);
});

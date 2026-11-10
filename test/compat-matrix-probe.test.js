import { test } from "node:test";
import assert from "node:assert/strict";
import { probeCompatMatrixRow } from "../lib/compat-matrix.js";

const baseState = {
  host_version: "0.2.2-rc.1",
  plugin_version: "1.1.84-rc1",
  host_target: "0.2.2-rc.1",
  ai_base: "D:\\DeepSeek Harness\\resources\\app\\dsh\\node_modules\\@deepseek-ai",
};

test("located：实测 supported 且与静态矩阵一致", () => {
  const row = probeCompatMatrixRow(baseState, {
    level: "located",
    evidence: "宿主 0.2.2-rc.1 与适配目标一致",
  });
  assert.equal(row.status, "supported");
  assert.equal(row.level, "located");
  assert.equal(row.dsh, "0.2.2-rc.1");
  assert.equal(row.matrix_match.same, true);
  assert.equal(row.matrix_match.staticStatus, "supported");
});

test("kernel-only：不冒充 supported，与静态行冲突时 same=false", () => {
  const row = probeCompatMatrixRow(baseState, {
    level: "kernel-only",
    evidence: "已定位宿主，但宿主版本未能解析比对",
  });
  assert.equal(row.status, "unknown");
  assert.equal(row.matrix_match.same, false);
  assert.match(row.note, /不能下适配结论/);
});

test("unsupported：非目标宿主直接判 unsupported", () => {
  const state = { ...baseState, host_version: "0.2.1-rc.x" };
  const row = probeCompatMatrixRow(state, {
    level: "unsupported",
    evidence: "宿主 0.2.1-rc.x 不在适配目标 0.2.2-rc.1",
  });
  assert.equal(row.status, "unsupported");
  assert.equal(row.matrix_match.same, true); // 静态行同样登记 unsupported
});

test("unknown：未定位宿主时 matrix_match 为 null", () => {
  const state = { ...baseState, host_version: "", ai_base: "" };
  const row = probeCompatMatrixRow(state, {
    level: "unknown",
    evidence: "未定位到宿主安装目录",
  });
  assert.equal(row.status, "unknown");
  assert.equal(row.dsh, "unknown");
  assert.equal(row.matrix_match, null);
});

test("宿主不在矩阵里：只给探测行，不伪造静态登记", () => {
  const state = { ...baseState, host_version: "9.9.9" };
  const row = probeCompatMatrixRow(state, {
    level: "unsupported",
    evidence: "宿主 9.9.9 不在适配目标内",
  });
  assert.equal(row.matrix_match, null);
  assert.equal(row.status, "unsupported");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { targetFiles } from "../lib/core.js";

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-scope-"));
  const resources = path.join(root, "resources");
  const app = path.join(resources, "app");
  const aiBase = path.join(app, "dsh", "node_modules", "@deepseek-ai");
  fs.mkdirSync(aiBase, { recursive: true });
  fs.mkdirSync(path.join(app, "lib"), { recursive: true });
  fs.writeFileSync(path.join(app, "lib", "main.js"), "// shell\n", "utf8");
  return { root, resources, app, aiBase };
}

test("桌面壳路径只跟随自己的 resources/app，不跨树", () => {
  const a = makeTree();
  const b = makeTree();
  const filesA = targetFiles(a.aiBase, a.root);
  assert.equal(path.normalize(filesA["desktop-shell"]), path.normalize(path.join(a.app, "lib", "main.js")));
  assert.notEqual(path.normalize(filesA["desktop-shell"]), path.normalize(path.join(b.app, "lib", "main.js")));
});

test("非 resources/app 布局（隔离包/源码树）不挂真实桌面壳", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-purge-scope-"));
  const aiBase = path.join(root, "node_modules", "@deepseek-ai");
  fs.mkdirSync(aiBase, { recursive: true });
  const files = targetFiles(aiBase, root);
  assert.ok(!files["desktop-shell"], "非桌面 resources/app 布局不得挂桌面壳");
});

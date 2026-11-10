// 用 asar 原始件修复 4 个偏差 bak、补建 2 个缺失 bak；只写 .bak，不碰载体本体。
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const asarPath = "D:/DeepSeek Harness/resources/app.asar";
const fd = fs.openSync(asarPath, "r");
const b1 = Buffer.alloc(8); fs.readSync(fd, b1, 0, 8, 0);
const headerPickleSize = b1.readUInt32LE(4);
const b2 = Buffer.alloc(8); fs.readSync(fd, b2, 0, 8, 8);
const headerSize = b2.readUInt32LE(4);
const hb = Buffer.alloc(headerSize); fs.readSync(fd, hb, 0, headerSize, 16);
const header = JSON.parse(hb.toString("utf8"));
const dataStart = 8 + headerPickleSize;
function findNode(rel) {
  let node = header;
  for (const p of rel.split("/")) {
    if (!node.files || !node.files[p]) return null;
    node = node.files[p];
  }
  return node;
}
function readAsarFile(rel) {
  const node = findNode(rel);
  if (!node || node.files) return null;
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataStart + Number(node.offset));
  return buf;
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const hostRoot = "D:/DeepSeek Harness/resources/app";
const repair = [
  "dsh/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml",
  "dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js",
  "dsh/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js",
  "dsh/node_modules/@deepseek-ai/dsh-user-approval/lib/types/index.js",
  "dsh/node_modules/@deepseek-ai/dsh-fs-sandbox/lib/index.js",
  "dsh/node_modules/@deepseek-ai/dsh-sandbox-local/lib/index.js",
];
for (const rel of repair) {
  const pristine = readAsarFile(rel);
  if (!pristine) throw new Error("asar 缺件: " + rel);
  const carrierPath = path.join(hostRoot, rel);
  const bakPath = carrierPath + ".dshpurge.bak";
  // 安全校验：载体本体必须与原始件不同（确为已打补丁状态），否则停止并报错。
  const carrier = fs.readFileSync(carrierPath);
  if (sha(carrier) === sha(pristine)) throw new Error("载体与原始件相同，停止: " + rel);
  fs.writeFileSync(bakPath, pristine);
  const verify = fs.readFileSync(bakPath);
  if (sha(verify) !== sha(pristine)) throw new Error("写后校验失败: " + rel);
  console.log("已修复/补建: " + rel + " (" + pristine.length + " 字节)");
}
fs.closeSync(fd);

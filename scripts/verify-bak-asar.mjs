// 门5 asar 复核：从 app.asar 取 6 个原始件，与现存 .dshpurge.bak 逐字节比对。
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const asarPath = "D:/DeepSeek Harness/resources/app.asar";
const fd = fs.openSync(asarPath, "r");
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, 0);
const headerPickleSize = sizeBuf.readUInt32LE(4);
const sizeBuf2 = Buffer.alloc(8);
fs.readSync(fd, sizeBuf2, 0, 8, 8);
const headerSize = sizeBuf2.readUInt32LE(4);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 16);
const header = JSON.parse(headerBuf.toString("utf8"));
const dataStart = 8 + headerPickleSize;
console.log("asar 顶层条目：" + Object.keys(header.files).join(", "));

function findNode(rel) {
  const parts = rel.split("/");
  let node = header;
  for (const p of parts) {
    if (!node.files || !node.files[p]) return null;
    node = node.files[p];
  }
  return node;
}
function readAsarFile(rel) {
  const node = findNode(rel);
  if (!node || node.files) return null;
  const offset = Number(node.offset);
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataStart + offset);
  return buf;
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const hostRoot = "D:/DeepSeek Harness/resources/app";
const targets = [
  ["user-approval", "dsh/node_modules/@deepseek-ai/dsh-user-approval/lib/types/index.js"],
  ["user-approval-code", "dsh/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js"],
  ["fs-sandbox", "dsh/node_modules/@deepseek-ai/dsh-fs-sandbox/lib/index.js"],
  ["sandbox-local", "dsh/node_modules/@deepseek-ai/dsh-sandbox-local/lib/index.js"],
  ["base", "dsh/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml"],
  ["system-prompt", "dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js"],
];

for (const [key, rel] of targets) {
  const pristine = readAsarFile(rel);
  if (!pristine) { console.log(key + ": asar 内未找到 " + rel); continue; }
  const diskPath = path.join(hostRoot, rel);
  const bakPath = diskPath + ".dshpurge.bak";
  const bak = fs.existsSync(bakPath) ? fs.readFileSync(bakPath) : null;
  const cur = fs.existsSync(diskPath) ? fs.readFileSync(diskPath) : null;
  const sameBak = bak && sha(bak) === sha(pristine);
  const curDiffers = cur && sha(cur) !== sha(pristine);
  console.log(
    key + ": bak=" + (bak ? (sameBak ? "与原始件一致" : "不一致!") : "缺失") +
    "; 当前本体=" + (cur ? (curDiffers ? "与原始件有差异(符合已打补丁)" : "与原始件相同(异常)") : "缺失") +
    "; 原始件 " + pristine.length + " 字节"
  );
}
fs.closeSync(fd);

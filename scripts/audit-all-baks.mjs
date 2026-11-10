// 全量 bak 审计：把 hostRoot 下所有 .dshpurge.bak 与 asar 原始件逐一核对。
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

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp, out);
    else if (ent.name.endsWith(".dshpurge.bak")) out.push(fp);
  }
}
const baks = [];
walk(path.join(hostRoot, "dsh"), baks);
let ok = 0, differ = 0, noPristine = 0;
const problems = [];
for (const bakPath of baks) {
  const rel = path.relative(hostRoot, bakPath).replace(/\\/g, "/").replace(/\.dshpurge\.bak$/, "");
  const pristine = readAsarFile(rel);
  if (!pristine) { noPristine++; continue; }
  if (sha(fs.readFileSync(bakPath)) === sha(pristine)) ok++;
  else { differ++; problems.push(rel); }
}
console.log("bak 总数=" + baks.length + " 与原始件一致=" + ok + " 不一致=" + differ + " asar无对应件=" + noPristine);
for (const p of problems) console.log("不一致: " + p);
fs.closeSync(fd);

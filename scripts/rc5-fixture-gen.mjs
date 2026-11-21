#!/usr/bin/env node
/**
 * rc.5 宿主锚点 fixture 生成器：把目标版本真实宿主里「补丁锚定的那几段」固化成 JSON，
 * 供 test/anchor-rc5.test.js 当作不可漂移的参照物。
 *
 * 为什么不在测试里手写片段：手写片段一旦与真实宿主不符，测试会「全绿地撒谎」——
 * 这正是社区维护版 patch-anchors 测试注释里点名的隐形失败模式（optional 补丁失配仍报已打）。
 * 所以 fixture 必须从真宿主机械提取，可重跑复现。
 *
 * 用法：
 *   node scripts/rc5-fixture-gen.mjs                从默认隔离树生成
 *   node scripts/rc5-fixture-gen.mjs --check        只校验 fixture 是否与宿主一致
 *   node scripts/rc5-fixture-gen.mjs --stage <dir>  指定隔离树根
 *   node scripts/rc5-fixture-gen.mjs --version <v>  版本（默认 0.2.2-rc.5）
 * 退出码：0 一致/已生成；1 --check 有差异；2 宿主缺失
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const VERSION = val("--version", "0.2.2-rc.5");
const STAGE = path.resolve(val("--stage", path.join(ROOT, "..", ".tmp", `host-${VERSION}`)));
const aiBase = path.join(STAGE, "resources", "app", "dsh", "node_modules", "@deepseek-ai");
const OUT = path.join(ROOT, "fixtures", `host-anchors-${VERSION}.json`);
const CHECK = argv.includes("--check");

if (!fs.existsSync(aiBase)) {
  console.error(`隔离树不存在：${aiBase}\n先跑：node scripts/audit-next.mjs --version ${VERSION}`);
  process.exit(2);
}

const read = (rel) => fs.readFileSync(path.join(aiBase, rel), "utf8");
const lines = (rel) => read(rel).split(/\r?\n/);

/** 按行号取「含关键词的若干行」，不做模糊匹配：找不到就报错，绝不静默产出一个空 fixture。 */
function pick(rel, needles) {
  const all = lines(rel);
  const out = [];
  for (const needle of needles) {
    const hit = all.findIndex((l) => l.includes(needle));
    if (hit < 0) throw new Error(`${rel} 里找不到锚点「${needle}」——上游可能已改文案`);
    out.push(all[hit]);
  }
  return out.join("\n");
}

/** 从 base 组合切出某行 `section: |` 的块标量正文。按缩进边界切，不用正则猜。 */
function blockScalar(rel, rowId, key) {
  const all = lines(rel);
  const rowAt = all.findIndex((l) => l.trim() === `- id: ${rowId}`);
  if (rowAt < 0) throw new Error(`${rel} 没有 ${rowId} 行`);
  const rowIndent = all[rowAt].search(/\S/);
  const keyAt = all.findIndex((l, i) => i > rowAt && l.trim() === `${key}: |`);
  if (keyAt < 0) throw new Error(`${rowId} 没有 ${key}: | 块`);
  const keyIndent = all[keyAt].search(/\S/);
  if (all.slice(rowAt + 1, keyAt).some((l) => l.trim() && l.search(/\S/) <= rowIndent)) {
    throw new Error(`${rowId} 的 ${key} 不在该行内，缩进解析失败`);
  }
  const body = [];
  for (let i = keyAt + 1; i < all.length; i++) {
    const l = all[i];
    if (!l.trim()) {
      body.push("");
      continue;
    }
    if (l.search(/\S/) <= keyIndent) break;
    body.push(l);
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  const strip = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  return body.map((l) => (l.trim() ? l.slice(strip) : "")).join("\n");
}

/** 从某行起、到某行止的连续窗口（含首尾）。`extra` 是终点之后再多带的行数。 */
function lineWindow(rel, startNeedle, endNeedle, extra = 0) {
  const all = lines(rel);
  const start = all.findIndex((l) => l.includes(startNeedle));
  if (start < 0) throw new Error(`${rel} 里找不到窗口起点「${startNeedle}」`);
  const end = all.findIndex((l, i) => i > start && l.includes(endNeedle));
  if (end < 0) throw new Error(`${rel} 里找不到窗口终点「${endNeedle}」`);
  return all.slice(start, Math.min(all.length, end + 1 + extra)).join("\n");
}

function build() {
  const toolFs = "dsh-tool-fs/lib/index.js";
  const baseYml = "dsh-base/cordis.patch.yml";
  const planMode = "dsh-plan-mode/lib/index.js";
  const sysPrompt = "dsh-system-prompt/lib/index.js";

  const fixture = {
    _note: "由 scripts/rc5-fixture-gen.mjs 从真实宿主提取，禁止手改。改锚点请改脚本并重跑。",
    version: VERSION,
    generatedAt: new Date().toISOString().slice(0, 10),
    toolFs: {
      // #22 的三个目标常量（默认值）与 Config schema 行
      consts: pick(toolFs, [
        "const READ_MAX_LINE_LENGTH =",
        "const READ_MAX_BYTES =",
        "const READ_LIMIT =",
      ]),
      schema: pick(toolFs, [
        "readLimit: z.number().default(READ_LIMIT)",
        "readMaxLineLength: z.number().default(READ_MAX_LINE_LENGTH)",
        "readMaxBytes: z.number().default(READ_MAX_BYTES)",
      ]),
    },
    base: {
      // #7 / #8 的目标行（base 组合里的 sandbox-policy mode 与 approval policy）
      sandboxMode: pick(baseYml, ["mode: !!js process.env.DSH_PERMISSION_MODE"]),
      approvalPolicy: pick(baseYml, ["policy: !!js \"(process.env.DSH_PERMISSION_MODE"]),
      // #63 的目标整段
      planSection: blockScalar(baseYml, "plan-mode", "section"),
    },
    planMode: {
      // #63 的另一类载体：plan-mode 服务的 section 注册（确认正文来自 config.section）
      sectionRegistration: pick(planMode, ['name: "plan:policy"', "return this.selectedActive"]),
    },
    systemPrompt: {
      // #40 的唯一非 optional 正则锚点：assemble 里 waterfall 之后的分支与返回对象。
      // 它跨越 12 行，任何一行改动都会让正则失配 —— 正是最该被 pin 的地方。
      assemble: lineWindow(
        sysPrompt,
        'const transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble"',
        "contexts: runtimeContextSuppressed ?",
        2,
      ),
    },
  };
  return fixture;
}

let built;
try {
  built = build();
} catch (e) {
  console.error(`提取失败：${String((e && e.message) || e)}`);
  process.exit(2);
}
const body = `${JSON.stringify(built, null, 2)}\n`;
const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";

if (CHECK) {
  // 只比内容，不比 generatedAt（否则每天都红）
  let same = false;
  try {
    const a = JSON.parse(existing);
    const b = JSON.parse(body);
    delete a.generatedAt;
    delete b.generatedAt;
    same = JSON.stringify(a) === JSON.stringify(b);
  } catch {
    same = false;
  }
  console.log(same ? `fixture 与 ${VERSION} 宿主一致` : `fixture 与 ${VERSION} 宿主不一致，需重跑生成`);
  process.exit(same ? 0 : 1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body, "utf8");
console.log(`已生成 ${OUT}`);
console.log(`  toolFs consts ${built.toolFs.consts.split("\n").length} 行 / schema ${built.toolFs.schema.split("\n").length} 行`);
console.log(`  planSection ${built.base.planSection.length} 字符`);

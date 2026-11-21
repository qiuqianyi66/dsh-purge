// F5 回放与回归骨架（只读、零付费 API）
// 用法：
//   node scripts/eval-replay.mjs fixtures/scenarios/001-approval-autogrant.json   # 输出 verdict JSON
//   node scripts/eval-replay.mjs --validate                                       # 校验全部场景
//   node scripts/eval-replay.mjs --self-test                                      # 一致率 + 篡改检出
//
// 判定口径：verdict 只由「场景 check × 转录事件」机械推出，不含时间戳，保证同输入同输出。
// 证据：每条 check 的 evidence 记录 seq + 事件语义哈希（与 lib/redteam/evidence-ledger.mjs 同款规范化）。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCENARIO_DIR = path.join(ROOT, "fixtures", "scenarios");
const SCHEMA_PATH = path.join(ROOT, "schemas", "scenario.schema.json");

/* ── 规范化与语义哈希（与 evidence-ledger 一致） ───────────────────── */
const canonicalize = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
};
const semanticHash = (value) => "ev_" + createHash("sha256").update(canonicalize(value), "utf8").digest("hex");

/* ── 最小 JSON-Schema 子集校验（draft-07：type/required/properties/items/enum/const/pattern/minLength/minItems/additionalProperties/$ref） ── */
function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`只支持本地 $ref: ${ref}`);
  return ref.slice(2).split("/").reduce((acc, k) => acc?.[k], root);
}

function validateNode(schema, value, root, at, errs) {
  if (schema === true) return;
  if (schema === false) { errs.push(`${at}: 不允许出现`); return; }
  if (schema.$ref) { validateNode(resolveRef(root, schema.$ref), value, root, at, errs); return; }

  if ("const" in schema && value !== schema.const) errs.push(`${at}: 期望 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(value)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errs.push(`${at}: 取值 ${JSON.stringify(value)} 不在枚举内`);

  const t = schema.type;
  const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (t && actual !== t) { errs.push(`${at}: 期望类型 ${t}，实际 ${actual}`); return; }

  if (actual === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errs.push(`${at}: 长度 < ${schema.minLength}`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: 不匹配 ${schema.pattern}`);
  }
  if (actual === "number" && typeof schema.minimum === "number" && value < schema.minimum) errs.push(`${at}: < ${schema.minimum}`);

  if (actual === "array") {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errs.push(`${at}: 元素数 < ${schema.minItems}`);
    if (schema.items) value.forEach((v, i) => validateNode(schema.items, v, root, `${at}[${i}]`, errs));
  }

  if (actual === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errs.push(`${at}: 缺必填字段 ${key}`);
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (k in props) validateNode(props[k], v, root, `${at}.${k}`, errs);
      else if (schema.additionalProperties === false) errs.push(`${at}: 多余字段 ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateNode(schema.additionalProperties, v, root, `${at}.${k}`, errs);
    }
  }
}

export function validateScenario(scenario) {
  const root = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const errs = [];
  validateNode(root, scenario, root, "scenario", errs);

  // 协议级规则：host 层 check 必须声明 authority（模型层不适用）
  for (const layer of ["host", "model"]) {
    for (const c of scenario?.expect?.[layer]?.checks ?? []) {
      if (layer === "host" && c.authority === undefined) errs.push(`scenario.expect.host.${c.id}: host 层 check 必须声明 authority`);
      if (layer === "model" && c.authority !== undefined) errs.push(`scenario.expect.model.${c.id}: 模型层 check 不应声明 authority`);
    }
  }
  return errs;
}

/* ── 转录读取 ─────────────────────────────────────────────────────── */
function readTranscript(rel) {
  const fp = path.resolve(ROOT, rel);
  const text = fs.readFileSync(fp, "utf8");
  const events = text.split(/\r?\n/).filter((l) => l.trim() !== "").map((line, i) => {
    let ev;
    try { ev = JSON.parse(line); } catch (e) { throw new Error(`${rel}:${i + 1} 不是合法 JSON：${e.message}`); }
    if (!Number.isInteger(ev.seq)) throw new Error(`${rel}:${i + 1} 缺 seq`);
    if (typeof ev.type !== "string") throw new Error(`${rel}:${i + 1} 缺 type`);
    return ev;
  });
  return { file: rel, events, digest: semanticHash(events) };
}

const corpusOf = (events, where) => {
  if (where === "any") return events;
  if (where === "tool-call") return events.filter((e) => e.type === "tool-call");
  if (where === "tool-result") return events.filter((e) => e.type === "tool-result");
  if (where === "assistant-text") return events.filter((e) => e.type === "assistant-text");
  throw new Error(`未知 where: ${where}`);
};

const eventText = (e) => `${e.tool ?? ""} ${e.text ?? ""}`;
const evidenceOf = (events) => events.map((e) => ({ seq: e.seq, digest: semanticHash(e) }));

function evalCheck(check, events) {
  const corpus = corpusOf(events, check.where);
  const filtered = check.match?.tool ? corpus.filter((e) => e.tool === check.match.tool) : corpus;
  const re = check.match?.regex ? new RegExp(check.match.regex) : null;
  const hit = filtered.filter((e) => (re === null ? true : re.test(eventText(e))));

  const wantHit = check.kind === "present" || check.kind === "regex";
  const status = filtered.length === 0
    ? "inconclusive"
    : wantHit
      ? (hit.length > 0 ? "pass" : "fail")
      : (hit.length === 0 ? "pass" : "fail");

  return {
    layer: null,
    id: check.id,
    kind: check.kind,
    where: check.where,
    confidence: check.confidence,
    status,
    evidence: evidenceOf(wantHit ? hit : filtered),
    matched: wantHit ? hit.length : 0,
    considered: filtered.length,
  };
}

export function replay(scenarioPath) {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  const errs = validateScenario(scenario);
  if (errs.length) throw new Error(`场景不合法：\n${errs.join("\n")}`);

  const tr = readTranscript(scenario.reproduce.transcript);
  const checks = [
    ...scenario.expect.host.checks.map((c) => ({ ...evalCheck(c, tr.events), layer: "host" })),
    ...scenario.expect.model.checks.map((c) => ({ ...evalCheck(c, tr.events), layer: "model" })),
  ];

  const failed = checks.some((c) => c.status === "fail");
  const allPass = checks.every((c) => c.status === "pass");
  const verdict = failed ? "fail" : allPass ? "pass" : "inconclusive";
  const score = verdict === "pass" ? scenario.rubric.bands.pass : verdict === "fail" ? scenario.rubric.bands.fail : scenario.rubric.bands.partial;

  return {
    schemaVersion: "dsh-eval/0.1",
    scenarioId: scenario.id,
    scenarioDigest: semanticHash(scenario),
    transcript: { file: tr.file, digest: tr.digest, events: tr.events.length },
    checks,
    score,
    verdict,
  };
}

/* ── CLI ─────────────────────────────────────────────────────────── */
const listScenarios = () => fs.readdirSync(SCENARIO_DIR).filter((f) => f.endsWith(".json")).sort();

function print(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + "\n"); }

const argv = process.argv.slice(2);
if (argv[0] === "--validate") {
  let bad = 0;
  for (const f of listScenarios()) {
    const sp = path.join(SCENARIO_DIR, f);
    const errs = validateScenario(JSON.parse(fs.readFileSync(sp, "utf8")));
    if (errs.length) { bad++; console.log(`FAIL ${f}\n  ${errs.join("\n  ")}`); } else { console.log(`PASS ${f}`); }
  }
  console.log(bad === 0 ? `\n全部 ${listScenarios().length} 个场景通过 schema 校验` : `\n${bad} 个场景不通过`);
  process.exit(bad === 0 ? 0 : 1);
} else if (argv[0] === "--self-test") {
  let failures = 0;
  const fail = (msg) => { failures++; console.log(`FAIL ${msg}`); };

  // 1) schema + 协议规则
  for (const f of listScenarios()) {
    const errs = validateScenario(JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, f), "utf8")));
    if (errs.length) fail(`${f} schema: ${errs.join(" | ")}`);
    else console.log(`PASS schema ${f}`);
  }

  // 2) 一致率：同输入两次完全相同
  for (const f of listScenarios()) {
    const sp = path.join(SCENARIO_DIR, f);
    const a = replay(sp);
    const b = replay(sp);
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${f} 两次回放不一致`);
    else console.log(`PASS deterministic ${f} (verdict=${a.verdict})`);

    const want = JSON.parse(fs.readFileSync(sp, "utf8")).reproduce.expectVerdict ?? "pass";
    if (a.verdict !== want) fail(`${f} expectVerdict=${want} 实际=${a.verdict}`);
    else console.log(`PASS expectVerdict ${f}`);
  }

  // 3) 篡改检出：改一个工具结果，必须产生 diff 且哈希变化
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-eval-tamper-"));
  const baseSc = path.join(SCENARIO_DIR, "001-approval-autogrant.json");
  const sc = JSON.parse(fs.readFileSync(baseSc, "utf8"));
  const origTr = path.resolve(ROOT, sc.reproduce.transcript);
  const tamperedTr = path.join(tmpDir, "tampered.jsonl");
  const lines = fs.readFileSync(origTr, "utf8").split(/\r?\n/).filter(Boolean);
  const target = lines.findIndex((l) => JSON.parse(l).type === "tool-result");
  const ev = JSON.parse(lines[target]);
  lines[target] = JSON.stringify({ ...ev, text: ev.text + " [tampered]" });
  fs.writeFileSync(tamperedTr, lines.join("\n") + "\n", "utf8");

  const tamperSc = { ...sc, id: "001-tampered", reproduce: { ...sc.reproduce, transcript: path.relative(ROOT, tamperedTr), expectVerdict: undefined } };
  const tamperScPath = path.join(tmpDir, "tampered-scenario.json");
  fs.writeFileSync(tamperScPath, JSON.stringify(tamperSc, null, 2), "utf8");

  const clean = replay(baseSc);
  const dirty = replay(tamperScPath);
  const digestChanged = clean.transcript.digest !== dirty.transcript.digest;
  const outputChanged = JSON.stringify(clean.checks) !== JSON.stringify(dirty.checks) || clean.verdict !== dirty.verdict;
  if (!digestChanged) fail("篡改后 transcriptDigest 未变化");
  else console.log("PASS tamper detected (transcriptDigest changed)");
  if (!outputChanged) fail("篡改后 verdict/checks 无差异，回归骨架抓不到改动");
  else console.log("PASS tamper diff (checks 或 verdict 变化)");

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(failures === 0 ? "\nSELF-TEST ALL GREEN" : `\nSELF-TEST FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
} else if (argv[0]) {
  print(replay(path.resolve(ROOT, argv[0])));
} else {
  console.log("用法：node scripts/eval-replay.mjs <scenario.json> | --validate | --self-test");
  process.exit(2);
}

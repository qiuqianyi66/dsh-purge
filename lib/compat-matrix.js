/**
 * F10 兼容矩阵单一事实来源（compat matrix）。
 *
 * 每一行对应一个 DSH（宿主）版本与本插件版本的适配结论：
 * - `dsh`：宿主版本（精确或范围说明）
 * - `plugin`：对应插件版本；`"unknown"` 表示未在当前矩阵登记可运行版本
 * - `status`：`supported`（已适配）/ `legacy`（旧线，指向 Releases）/ `unsupported`（非本版本目标）
 * - `note`：面向 README 的说明
 *
 * README 适配表由 `scripts/gen-compat-readme.mjs` 从本文件生成；
 * 发版前测试核对 `package.json` 的 `dshTarget` 与矩阵 `current` 行一致，过时条目标 unknown 而非保留旧承诺。
 */

/** 当前插件版本对应的目标宿主版本（必须与 package.json dshTarget 一致）。 */
export const COMPAT_CURRENT = {
  dsh: "0.2.2-rc.1",
  plugin: "1.1.84-rc1",
  status: "supported",
  note: "含 #82 单行锚点修复与新布局的路径分区/aiBase 处理",
};

/** 历史与非目标版本行；status 见上方类型说明。 */
export const COMPAT_MATRIX = [
  COMPAT_CURRENT,
  {
    dsh: "0.2.1-rc.x",
    plugin: "unknown",
    status: "unsupported",
    note: "不是本版本目标；到 [Releases](https://github.com/qiuqianyi66/dsh-purge/releases) 选对应旧标签",
  },
  {
    dsh: "0.2.0-rc.2",
    plugin: "1.1.40+",
    status: "legacy",
    note: "旧线，见 [Releases](https://github.com/qiuqianyi66/dsh-purge/releases)",
  },
  {
    dsh: "0.1.7",
    plugin: "1.1.39-",
    status: "legacy",
    note: "旧线（含 rc.1 / rc.2），在 [Releases](https://github.com/qiuqianyi66/dsh-purge/releases) 选对应标签",
  },
];

/** 从矩阵取出当前行（status=supported 的那条）。 */
export function currentCompatEntry() {
  return COMPAT_MATRIX.find((e) => e.status === "supported") || COMPAT_CURRENT;
}

/**
 * 校验矩阵内部一致性：
 * - 恰好一条 supported 行；
 * - 每行 dsh/plugin/status 字段合法；
 * - legacy/unsupported 行不允许把 plugin 写成当前版本。
 * 返回 { ok, errors }。
 */
export function validateCompatMatrix() {
  const errors = [];
  const supported = COMPAT_MATRIX.filter((e) => e.status === "supported");
  if (supported.length !== 1) {
    errors.push(`supported 行应为 1 条，实际 ${supported.length}`);
  }
  for (const e of COMPAT_MATRIX) {
    if (!e.dsh || typeof e.dsh !== "string") errors.push("存在缺 dsh 字段的行");
    if (!e.plugin || typeof e.plugin !== "string") errors.push(`行 ${e.dsh} 缺 plugin 字段`);
    if (!["supported", "legacy", "unsupported"].includes(e.status)) {
      errors.push(`行 ${e.dsh} status 非法：${e.status}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

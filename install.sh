#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE=""

# 1) DSH 桌面版内置 Node（macOS 路径）
for cand in \
  "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node" \
  "$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"; do
  if [ -x "$cand" ]; then NODE="$cand"; break; fi
done

# 2) PATH
if [ -z "$NODE" ] && command -v node >/dev/null 2>&1; then NODE="$(command -v node)"; fi

if [ -z "$NODE" ]; then
  echo
  echo "[dsh-purge] 没找到 Node。请先安装 Node.js 18+，或先打开一次 DeepSeek Harness。"
  echo
  exit 1
fi

echo
echo "dsh-purge 一键安装"
echo "  Node: $NODE"
echo
set +e
"$NODE" "$ROOT/bin/dsh-purge.js" --install "$@"
CODE=$?
set -e
echo
if [ "$CODE" -ne 0 ]; then
  echo "[dsh-purge] 安装没有完成。上面的原因已翻译成人话；详细步骤见 README 第 4 节。"
else
  echo "[dsh-purge] 安装流程结束。DSH 重启后，会话标题旁会出现 dsh-purge 按钮。"
fi
exit "$CODE"

#!/usr/bin/env bash
# 把本仓库安装为 DSH 技能：~/.dsh/skills/wan3-video-prime
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${DSH_HOME:-$HOME/.dsh}/skills/wan3-video-prime"
mkdir -p "$DEST"
cp -R "$HERE/SKILL.md" "$HERE/scripts" "$HERE/references" "$DEST/"
echo "已安装到 $DEST"
echo "下一步：新开一个 DSH 会话，然后运行 node \"$DEST/scripts/wan_prime.mjs\" check"

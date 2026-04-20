#!/usr/bin/env bash
# Usage: gen_asset.sh <out_path> <prompt> [aspect_ratio] [speed]
# Requires IDEOGRAM_API_KEY in env.
set -euo pipefail

OUT="$1"
PROMPT="$2"
AR="${3:-1x1}"
SPEED="${4:-DEFAULT}"

if [ -z "${IDEOGRAM_API_KEY:-}" ]; then
  echo "IDEOGRAM_API_KEY not set" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

RESP=$(curl -sS -X POST https://api.ideogram.ai/v1/ideogram-v3/generate \
  -H "Api-Key: $IDEOGRAM_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "prompt=$PROMPT" \
  -F "aspect_ratio=$AR" \
  -F "rendering_speed=$SPEED" \
  -F "magic_prompt=OFF")

URL=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',[{}])[0].get('url',''))")

if [ -z "$URL" ]; then
  echo "No URL in response:" >&2
  echo "$RESP" >&2
  exit 2
fi

curl -sS -L -o "$OUT" "$URL"
ls -la "$OUT"

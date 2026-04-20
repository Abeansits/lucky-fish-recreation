#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export IDEOGRAM_API_KEY=$(security find-generic-password -s ideogram-api-key -w)

STYLE="thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, centered circular badge medallion shape, fills about 80% of frame, cartoon sticker icon, solid pure white background, no text, no words, no letters, no logo, no drop shadow"

gen() {
  local file="$1"; local subject="$2"; local detail="$3"
  local prompt="chunky storybook achievement badge, ${subject}, ${detail}, ${STYLE}"
  [ -f "assets/badges/${file}.png" ] && { echo "skip: $file"; return 0; }
  ./scripts/gen_asset.sh "assets/badges/${file}.png" "$prompt" 1x1 DEFAULT
}

gen firstLegendary "a golden trophy medallion" "big shiny gold trophy cup, victory feel, ornamental" &
gen firstMythic "a glowing magenta-pink gemstone medallion" "magical pink-violet gem with radiating sparkle, mythic rare feel" &
gen firstShiny "a bright yellow sparkle star medallion" "twinkling golden starburst, shiny sparkle feel" &
gen albumComplete "an open book medallion with bookmark" "open storybook with purple and gold ribbon bookmark, fish sparkle inside" &
gen pondMaster "a wave and crown medallion" "ocean wave with small floating crown, turquoise cyan and gold, regal pond master feel" &
wait

echo "badges done"
ls assets/badges/

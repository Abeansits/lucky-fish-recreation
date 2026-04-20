#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export IDEOGRAM_API_KEY=$(security find-generic-password -s ideogram-api-key -w)

STYLE="thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, centered single object diagonal composition, fills about 80% of frame, cartoon sticker icon, solid pure white background, no scene, no text, no drop shadow, no paper texture"

gen() {
  local file="$1"; local subject="$2"; local detail="$3"
  local prompt="chunky storybook fishing rod icon, ${subject}, ${detail}, ${STYLE}"
  [ -f "assets/rods/${file}.png" ] && { echo "skip: $file"; return 0; }
  ./scripts/gen_asset.sh "assets/rods/${file}.png" "$prompt" 1x1 DEFAULT
}

gen basic "a simple wooden stick fishing rod" "rough bark-brown wood, plain fishing line with small silver hook, very humble and basic look, kid-drawn charm" &
gen lucky "a fishing rod with a green four-leaf clover charm tied to the handle" "polished wood handle, bright green clover decoration, gold line, gentle magical sparkle" &
gen hunter "a targeting fishing rod with a red-and-white bullseye target symbol on the handle" "dark wood, red-white target ornament, sharp tip, sporty advanced look" &
gen legend "a golden star-topped fishing rod, legendary tier" "rich gold handle, glowing yellow star ornament on top, ornamental golden line, strong heroic feel" &
wait

gen moonlit "a silvery moonlit fishing rod with a crescent moon ornament" "deep midnight blue and silver gradient handle, glowing crescent moon charm, starry magical feel, mythic tier ornamental detail" &
gen starcatcher "a cosmic starcatcher fishing rod with a radiant golden-pink star at its tip" "violet and magenta gradient cosmic handle, radiating star with sparkles, rich mythic ornamental detail, feels like the rarest reward rod" &
wait

echo "rods done"
ls assets/rods/

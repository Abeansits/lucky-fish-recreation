#!/usr/bin/env bash
# Generate remaining fish assets in parallel batches of 5.
set -euo pipefail
cd "$(dirname "$0")/.."

export IDEOGRAM_API_KEY=$(security find-generic-password -s ideogram-api-key -w)

STYLE="thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, rounded chunky shapes, centered single full-body creature in 3/4 side view facing right, fills about 80% of frame, cartoon icon, solid pure white background, no scene, no seabed, no water, no props, no text, no drop shadow, no paper texture"

gen() {
  local file="$1"; local species="$2"; local detail="$3"
  local prompt="chunky storybook ${species} sticker illustration, ${detail}, ${STYLE}"
  if [ -f "assets/fish/${file}.png" ]; then
    echo "skip: ${file} exists"
    return 0
  fi
  ./scripts/gen_asset.sh "assets/fish/${file}.png" "$prompt" 1x1 DEFAULT
}

# Common (simple, low detail)
gen herring  "herring fish"  "slim silver body with bluish-green back" &
gen sardine  "sardine fish"  "shiny silver body with subtle blue stripe" &
gen guppy    "guppy fish"    "tiny round bright orange body with fan tail" &
gen minnow   "minnow fish"   "small tan-olive body with dark dorsal line" &
wait

gen perch    "perch fish"    "yellow-green body with bold dark vertical bars" &
gen sunfish  "sunfish bluegill" "round flat deep body, blue-green back, orange belly" &

# Uncommon (moderate detail)
gen bass     "bass fish"     "olive-green body, big mouth, subtle darker side blotches" &
gen trout    "rainbow trout" "olive back, pink-magenta horizontal band, spotted pattern" &
wait

gen snapper  "red snapper fish" "bright red-orange body, mild fin detail" &
gen clownfish "clownfish" "bright orange body with three bold white bands and black outlines, classic Nemo look" &

# Rare (richer detail)
gen tuna     "bluefin tuna"  "metallic deep blue back, silver belly, sleek pointed fins" &
gen swordfish "swordfish" "long pointed sword bill, deep blue body, sleek silver belly" &
wait

gen angelfish "tropical angelfish" "tall triangular body, vivid yellow and blue bands, long trailing fins, slightly ornate" &

# Legendary (ornamental detail, hint of magic)
gen bluewhale "blue whale" "massive friendly blue whale, soft blue-gray gradient, tiny dorsal fin, spout puff above, mildly ornamental" &
gen kraken   "kraken octopus" "large purple kraken sea monster with curled tentacles, golden eyes, ornamental mythic feel" &
gen mermaid  "mermaid" "friendly smiling mermaid with teal fish tail, flowing red hair, golden shell top, kid-friendly, ornamental" &
wait

# Mythic (richest detail, strong magical aura cue within the style)
gen giantsquid "giant squid" "enormous deep red-orange giant squid with ten curling tentacles, massive eye, magical mythic aura with rich detail" &
gen turtle   "ancient sea turtle" "wise ancient sea turtle with patterned emerald shell, mossy barnacles, gentle face, magical mythic aura, richer detail" &
wait

echo "batch complete"
ls assets/fish/ | wc -l

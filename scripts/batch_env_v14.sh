#!/usr/bin/env bash
# V14 environment art — generates pond/sky ambient assets in parallel via Ideogram.
# Idempotent: skips any PNG that already exists. Run cutout.py after to strip backgrounds.
set -euo pipefail
cd "$(dirname "$0")/.."

export IDEOGRAM_API_KEY=$(security find-generic-password -s ideogram-api-key -w)

STYLE="chunky storybook kid-friendly cartoon sticker illustration, thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, rounded chunky shapes, centered single subject filling about 75% of frame, solid pure white background, no scene, no props, no text, no drop shadow, no paper texture"

gen() {
  local file="$1"; local subject="$2"; local detail="$3"; local ar="${4:-1x1}"
  local prompt="${subject} sticker illustration, ${detail}, ${STYLE}"
  if [ -f "assets/env/${file}.png" ]; then
    echo "skip: ${file} exists"
    return 0
  fi
  echo "gen: ${file}"
  ./scripts/gen_asset.sh "assets/env/${file}.png" "$prompt" "$ar" DEFAULT
}

# Underwater flora / decor
gen seaweed     "tall aquatic seaweed plant"   "two or three bright green kelp-style fronds curving slightly, chunky leaves, simple base, kid-friendly cartoon" &
gen coral       "coral reef cluster"           "vivid pink and coral-orange branching coral, rounded chunky shapes, a few soft white highlights, kid-friendly cartoon" &
gen rock_small  "smooth underwater pebble"     "grey-blue rounded stone with subtle highlights, a tiny green algae tuft on top, chunky cartoon" &
wait

gen rock_medium "underwater boulder"           "large grey-brown cartoon rock, rounded oval shape, a few moss patches, kid-friendly cartoon" &
gen island      "tiny cartoon island"          "small rounded green hill with one chunky tree on top, sandy shore at the base, kid-friendly cartoon, wide low silhouette" "16x9" &
gen ripple      "water ripple rings"           "three concentric thin white-and-pale-blue ripple rings on a pond surface, top-down view, soft painterly, no water around them (transparent feel)" &
wait

# Ambient water life
gen bgfish_big   "large friendly background fish" "chubby deep-blue and silver fish, side profile facing right, calm eyes, slightly larger tail, cartoon sticker" &
gen bgfish_med   "medium tropical background fish" "green-and-yellow striped cartoon fish, side profile facing right, simple fins, cartoon sticker" &
gen shark_bg     "ambient cartoon shark silhouette" "friendly grey cartoon shark, closed smile, side profile facing right, subtle lighter belly, not scary, kid-friendly sticker" &
wait

# Sky tier
gen bird         "small flying cartoon bird"    "cute chunky cartoon songbird mid-flight, wings spread, blue-and-white plumage, small black dot eye, side profile facing right" &
gen sun          "painterly cartoon sun"        "warm golden sun with rounded rays, cheerful closed-eye smile, soft orange-yellow gradient, kid-friendly cartoon sticker" &
gen moon          "painterly cartoon crescent moon" "creamy pale-yellow crescent moon, sleepy closed-eye smile, a tiny star next to it, kid-friendly cartoon sticker" &
wait

gen airplane     "small cartoon prop airplane"  "red-and-white two-seater propeller plane, side profile facing right, rounded chunky shape, spinning propeller at the nose, kid-friendly cartoon sticker" &
wait

echo "---"
echo "Done generating. Running cutout.py to transparent-bg all assets/env/*.png..."
python3 scripts/cutout.py assets/env/*.png || true
echo "Cutout done."
ls -la assets/env/

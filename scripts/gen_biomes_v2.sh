#!/usr/bin/env bash
# Regenerate 4 biome PNGs with transparent sky region (top 32% pure white).
# Designed to layer over the game's procedural sky so sun/moon/birds/clouds
# stay visible above the painted waterline.
#
# Runs serially to avoid the codex parallel race documented in scripts/README.md.
# Each call ~3-5 min at quality=high; total ~15-20 min.
set -uo pipefail
cd "$(dirname "$0")/.."

LOG="/tmp/gen_biomes_v2.log"
: > "$LOG"
echo "[start] $(date)" | tee -a "$LOG"

gen_biome() {
  local name="$1"
  local subject="$2"
  local target="assets/env/biome_${name}.png"

  echo "" | tee -a "$LOG"
  echo "=== [$(date +%H:%M:%S)] generating ${name} ===" | tee -a "$LOG"

  # Snapshot existing session dirs so we can identify ours after.
  local pre
  pre=$(ls ~/.codex/generated_images/ 2>/dev/null | sort -u | tr '\n' '|')

  local prompt
  prompt=$(cat <<EOF
Generate a single 1536x1024 wide-format PNG image using the image_gen tool. Pass quality: "high" (not low or medium).

COMPOSITION (precise — must follow exactly):
- The image is divided horizontally by a waterline at exactly 32% from the top of the image (around y=327 of 1024).
- TOP 32% (above-water region): SOLID PURE WHITE BACKGROUND (#FFFFFF), fully blank — NO clouds, NO sun, NO moon, NO birds, NO painted sky color, NO gradient. Just clean pure white. The game will replace this with its own animated sky.
- Foreground scenery silhouettes (mountains, palm canopy, icebergs, trees) MAY extend upward INTO the white sky region from below the waterline. Their outlines must read clearly against the white. If a silhouette reaches the very top of the image, cut it cleanly at the top edge. The white sky AROUND silhouettes must stay PURE WHITE.
- BOTTOM 68% (underwater region): the painted underwater scene. Subtle ripple/highlight at the very top of the water. Soft caustic light beams. Painted seabed/floor at the bottom edge.

CONTENT RULES (strict):
- ABSOLUTELY NO living creatures of any kind: NO fish, NO birds, NO crocodiles, NO monkeys, NO penguins, NO whales, NO insects, NO faces, NO eyes. Only flora, terrain, and geology.
- All elements should look static. Seaweed, kelp, lily pads are allowed (they read as gentle-swaying plants).
- Style: chunky storybook kid-friendly cartoon, thick near-black outlines, flat cel-gradient fills, saturated friendly Club Penguin–style colors, soft painted depth, no realistic rendering, no paper texture.

BIOME: ${name}
${subject}

After image_gen returns, save the PNG to ${target} in the current working directory by:
1. Find your generated file with: ls -t ~/.codex/generated_images/*/*.png | head -1
2. Copy it: cp <that-path> ${target}

Report the absolute path of the saved file. Do not run anything else.
EOF
)

  codex exec --full-auto "$prompt" >>"$LOG" 2>&1
  local rc=$?
  echo "[$(date +%H:%M:%S)] codex exit=$rc" | tee -a "$LOG"

  # Defensive fallback: if codex didn't actually copy, find the new session dir
  # (the one that wasn't in $pre) and copy from it ourselves.
  if [ ! -f "$target" ] || [ "$(stat -f %m "$target" 2>/dev/null || echo 0)" -lt "$(date +%s -v-10M 2>/dev/null || echo 0)" ]; then
    local new_dir
    new_dir=$(ls -t ~/.codex/generated_images/ 2>/dev/null | grep -vFx "${pre//|/$'\n'}" | head -1)
    if [ -n "$new_dir" ]; then
      local new_png
      new_png=$(ls -t ~/.codex/generated_images/"$new_dir"/*.png 2>/dev/null | head -1)
      if [ -n "$new_png" ]; then
        cp "$new_png" "$target"
        echo "[fallback] copied $new_png -> $target" | tee -a "$LOG"
      fi
    fi
  fi

  if [ -f "$target" ]; then
    echo "[ok] $target ($(stat -f %z "$target") bytes)" | tee -a "$LOG"
  else
    echo "[FAIL] $target missing" | tee -a "$LOG"
  fi
}

gen_biome "coral" 'Above-water silhouettes (poking up into the upper white sky region): a couple of small rocky atoll outcrops with a few palm-frond tips, mostly open sky. Underwater scene: vibrant tropical coral reef — pink branching coral, orange brain coral, purple fan coral of varied sizes; swaying green and yellow kelp fronds; pale anemone clusters; scattered conch and clam shells; smooth white sandy floor with small ripple patterns; crystalline turquoise-blue water with soft caustic light rays from above.'

gen_biome "arctic" 'Above-water silhouettes (poking up into the upper white sky region): chunky snow-capped iceberg peaks of varied heights spread across the horizon, plus a couple of distant pale glacial mountains. Underwater scene: pale teal-blue cold water; large submerged ice shelves with cracked translucent edges and frost detail; smooth round dark pebbles on the floor; sparse frosty pale-green seaweed clumps; soft pale caustic light beams.'

gen_biome "sunset" 'Above-water silhouettes (poking up into the upper white sky region): a small weathered wooden dock with a few posts on one side, a tiny rocky island with a single silhouetted pine tree, distant rolling hills on the far side. Underwater scene: warm amber and pink reflective water near the surface deepening to plum-purple below; large round lily pads floating on the surface; tall reed clusters along the bottom; smooth river stones; soft warm caustic light filtering down.'

gen_biome "jungle" 'Above-water silhouettes (poking up into the upper white sky region): lush palm canopy hanging from off-screen trees on the left and right edges, a few vine-draped tree trunk silhouettes mid-frame, mossy boulders. Underwater scene: emerald-green murky water; twisted submerged tree roots; dense kelp ribbons swaying; scattered river stones with patches of moss; round lily pads on the surface; dappled jungle light filtering down through the canopy above.'

echo "" | tee -a "$LOG"
echo "[done] $(date)" | tee -a "$LOG"
ls -la assets/env/biome_*.png | tee -a "$LOG"

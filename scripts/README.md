# Asset generation

All pond stickers (fish, rods, badges, decorations) share one visual style:

> chunky storybook kid-friendly cartoon sticker illustration, thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, rounded chunky shapes, centered single object filling ~80% of frame, solid pure white background, no scene, no props, no text, no drop shadow, no paper texture

Two pipelines exist. **Default to Codex CLI for new/one-off assets.** Use Ideogram only when regenerating a whole batch at once.

---

## Codex CLI (recommended for new assets)

Uses the `image_gen` tool available inside `codex exec`. Authenticates via your ChatGPT login (`codex login`). No API key needed.

```sh
codex exec --full-auto 'Generate a single PNG image and save it to assets/decorations/ducky.png in the current working directory.

Style: chunky storybook kid-friendly cartoon sticker illustration, thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, rounded chunky shapes, centered single object, fills about 80% of frame, solid pure white background, no scene, no water, no props, no text, no drop shadow, no paper texture. 1024x1024 square.

Subject: a classic yellow rubber ducky bath toy, orange beak, black dot eye, cheerful smile, slight 3/4 angle.

After saving, do not run anything else. Report the absolute path.'
```

Then flood-fill the white background to transparent:

```sh
python3 scripts/cutout.py assets/decorations/ducky.png
```

### Parallel-batch gotcha (⚠ bitten by this)

Running 4+ `codex exec` calls in parallel to generate a set **will race**. Each codex session dumps its PNG into `~/.codex/generated_images/<session-id>/`, and naive "copy the newest file" logic across tasks ends up grabbing the same file multiple times — duplicated assets, missing ones.

Options:

1. **Run serially** (2–3 min per image, but safe). Simplest.
2. **Run parallel but let Codex copy directly using its own session path** — tell the agent in the prompt to use the image it just generated in its own session dir, not "find newest". Works, more prompt tuning.
3. **Run parallel, fix manually** — if you already did this, check `~/.codex/generated_images/*/` and match by timestamp/visual inspection, then re-copy.

If you're doing >2 assets at once, just run serially. The 6–8 min wait is worth not having to manually untangle duplicated copies.

---

## Ideogram (bulk regenerates)

For a whole rod/fish set at once. Requires `IDEOGRAM_API_KEY` in macOS Keychain under service `ideogram-api-key`:

```sh
security add-generic-password -s ideogram-api-key -a "$USER" -w
```

Then:

```sh
./scripts/batch_fish.sh      # 24 fish in parallel batches of 4–5
./scripts/batch_rods.sh      # 6 rods
./scripts/batch_badges.sh    # milestone badges
python3 scripts/cutout.py assets/<dir>/*.png
```

Each `gen()` call in the batch scripts is idempotent — if the target PNG already exists, it skips.

---

## cutout.py

Flood-fills the outer white background to `alpha=0` via a 4-corner BFS. The sticker's own dark outline separates outer white from any internal whites, so internal whites (e.g. eye highlights) are preserved.

```sh
python3 scripts/cutout.py assets/fish/tuna.png   # single file
python3 scripts/cutout.py assets/fish/*.png      # whole dir
```

Threshold lives at the top of `cutout.py` (`WHITE_THRESHOLD = 215`). Ideogram emits outer bg in the 233–236 gray range; Codex emits closer to pure 255. Both are well above the threshold.

---

## Style consistency

After generating a new asset, **compare side by side with an existing one** (open both in Preview / a browser) before committing. If outline weight, saturation, or framing drift noticeably, re-roll the prompt. The style alignment is what makes the pond feel cohesive.

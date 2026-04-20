# Lucky Fish — Production Note

## Tech chosen

**Vanilla JS + HTML + CSS. Procedural Web Audio for UI/cast/shiny; four original MP3 files for catch tiers + eating. No build step, no dependencies, no backend.**

Zero-install, zero-framework, runs from `file://` or any static server. CSS handles every animation, DOM handles every layout.

## How to run

```sh
open index.html                   # simplest
# or
python3 -m http.server 8000      # then http://localhost:8000
```

No install, no network, no keys. Works from file://.

---

## V6 changes (this iteration)

Extending the same "Soft-Playful-Juiced" direction. Scope: notification pacing tiers, 2× fish catalog, visible water surface + sky zone + taller pond.

### 1. Notification tiers

V5 held every notification for roughly the same length. V6 introduces three tiers:

- **Regular (2s)** — routine catches, eating, double catches.
- **Big event (5s)** — first-catch of a species, rod unlock, daily gift reveal, non-headline milestones.
- **Banner (dismiss-on-tap)** — headline moments: first shiny, first legendary, album complete. These get a glowing gold pulsing card with a `✕` close button. Any click dismisses. Safety-timeout at 30s so stale banners don't pile up across long sessions.

Single `NOTIF_HOLD = { regular, big, banner }` constant keyed from every call site — clear intent, easy to retune.

### 2. Fish catalog 2× expansion (9 → 20 species)

- **Common (3 → 7)**: Anchovy · Herring · Sardine · Guppy · Minnow · Perch · Sunfish
- **Uncommon (2 → 5)**: Mackerel · Bass · Trout · Snapper · Clownfish
- **Rare (2 → 4)**: Salmon · Tuna · Swordfish · Angelfish
- **Legendary (2 → 4)**: Great White Shark · Blue Whale · Kraken · Mermaid

Per-species tier weight (40/30/20/10) preserved as dad requested; the weight is now spread across more species within each tier, which keeps the overall tier probabilities close to the original (50/27/14.5/7.3%). Rod unlock gates still feel the same — rare & legendary counts don't change per-cast, just the "which species landed" grows more varied. Album completion target is now 20 species instead of 9, which meaningfully stretches the long-session goal.

Pictographs: every species uses one of 🐟 / 🐠 / 🐡 / 🦈 / 🐋 / 🐙 / 🧜 with per-species `hue-rotate` CSS filters so same-emoji species read as distinct colors. No new asset files added.

### 3. Air/water split (the biggest visual change)

Direction picked via Codex consult: **stickerish water line** (not painterly, not anime, not foamy — "chunky, kid-readable, matches V5 sticker language"). Above-surface ambient set: **☁️ cloud + 🦋 dragonfly + 🌳 far-bank tree** (Codex explicitly rejected passive lily pad + duck — they promoted them to surface *decorations*).

Implementation:
- **`--surface-y: 32%`** CSS custom property on `.pond` = strict "where the water line lives" contract (per Codex's cleanup note). Every surface-aware element reads from this one variable.
- **Sky zone** (0 → surface-y): soft blue gradient, hosts drifting emoji clouds (2 at start, slow lateral drift 28-50s) and an occasional dragonfly (1-at-a-time, ~1-in-50-tick spawn chance).
- **Far bank** (bottom of sky zone): a CSS radial-gradient green silhouette + 🌳 emoji tree. Grounds the horizon as a *place*, not just a color break.
- **Water surface** (`<svg>` SVG at the surface-y line): chunky white sticker band with scalloped wave peaks, ~16px tall. Mostly static — just a ±6px lateral drift over 14s so it feels alive without competing with the cast ripple.
- **Water zone** (surface-y → 100%): existing cyan-to-deep-blue gradient, light rays now correctly start *at the surface* and refract down (V5 had them across the whole pond), bubbles capped to rise only in the lower 2/3 of the water zone so they never pierce the surface, ambient fish confined to 40-90% vertical.

Surface decorations moved to a new `#surface-decorations` layer (z-index 3, above the water-surface SVG): **Rubber Ducky and Lily Pad now float ON the surface line** instead of bobbing underwater. Gem, Mermaid-deco, and Sea Dragon stay submerged. Surface decos use a slower, gentler bob keyframe (3.6s) versus underwater (2.6s).

**Surface break on cast** — per Codex: when the cast fires, a small dark oval "notch" element appears at the surface point, scales open for ~420ms then fades, selling the visible disruption without a full fluid simulation. Lives under the droplet spray in the z-stack so droplets fly over the break.

### 4. Taller pond + responsive cap

- Aspect ratio was `16/10` — now `16/13` (Codex ruled 16/15 as too square, risked cramped horizontal play). Gives real sky breathing room while staying kid-tablet-friendly.
- `max-height: 72vh` cap so tall desktop viewports don't let the pond eat the whole screen and push Cast-button below the fold.

### What Codex explicitly cut this round

Per the "don't stack ambient motions" rule:
- Rolling foam caps on the surface line
- Autonomous duck AI / pathfinding (ducky stays a bobbing decoration)
- Multi-layer parallax sky stack (single sky gradient + one bank silhouette only)
- Water surface reflections / refractions
- Day/night tint cycle
- Water caustic patterns (noted "good effect, wrong window")
- Multiple ripple variants (kept one + one droplet burst, already well-tuned)

---

## V1-V5 mechanics (preserved, untouched)

All prior code paths intact:
- **V1**: core loop, rods, tiers, species, per-tier buffs, ambient fish, cast beat, tier-distinct audio.
- **V2**: rod unlock ladder, Pokédex album, localStorage, daily first-cast gift, first-catch celebrations, Next Goal strip, first-legendary + album-complete milestones, fish swim direction fix.
- **V3**: 🫧 Pearls currency, Pond Shop with 5 decorations, 1/500 shinies with shimmer arpeggio + album star badge, Eat-All press-and-hold + flying-fish cascade, First Shiny + Pond Master milestones.
- **V4**: original MP3s wired, cast suspense reel, legendary sequence (hit-stop + shake + confetti waves + slowmo + 🏆 banner), shiny full-screen shimmer sweep, squash-on-press buttons, bubbles, light rays.
- **V5**: slot-reel alignment fix (pre-pick winner + `offsetTop`-based translate), Settings/⚙️ FAB + sounds toggle + double-confirm reset with 3s countdown, sticker-panel chrome, gold 3D game-logo title, enhanced multi-ring cast ripple + droplet spray, edge flora (seaweed + coral).

## Spec deviations (cumulative)

- LocalStorage (V2 dad-approved), forward-migrates each version.
- Rods start locked (V2 dad-requested).
- Tier weights / buff values / durations unchanged at baseline; V6 spreads them across more species per tier without changing the authored numbers.
- Pearls, shinies, decorations, eat-all (V3 dad-requested).
- Juice pass + audio files (V4 dad-requested).
- Settings/reset + UI chrome + pond edge flora + enhanced ripple (V5 dad-requested).
- Notification tiers + catalog 2× + sky zone + surface line + taller pond + surface break (V6 dad-requested).
- Mythic tier + two endgame rods + custom generated art (V6.5/V7 dad-requested).
- Tackle bag + achievements panel + legendary-banner lag fix + Today's Star bonus (V8 dad-requested).

## V8 — Tackle bag, achievements, polish, kid-magic bonus

Four items. First three were dad's playtest feedback; the fourth was an overnight "creative freedom" bonus midflight'd with Codex before shipping.

### 1. Tackle bag (compact rod picker)

- Removed the always-on left rod panel (ate ~25% of viewport horizontally). Board dropped from 3 cols to 2 cols: Pond | Catches.
- Header gains a **🎒 Tackle Bag chip** showing the currently selected rod icon + name. Tap → modal with the full 6-rod grid (unlock progress preserved). Select → closes modal.
- Pro: far more room for pond + catches; current rod still visible at a glance in the header.
- Trade-off: rods behind one tap instead of visible — acceptable given the header chip keeps the current rod in view.

### 2. Achievements panel

- Added a **🏆 trophy FAB** bottom-right above the shop FAB. Opens a new modal listing 14 achievements with status + progress bars.
- Catalog promotes existing silent milestones (firstLegendary/firstMythic/firstShiny/albumComplete/pondMaster) into a visible goal list and adds: First Cast · Catch 10/50/200 · First Uncommon · First Rare · Shiny Hunter (5 shinies) · Full Tackle Bag (all rods) · Pearl Collector (500 pearls).
- Unlocked rows sort to the top with a gold gradient bg + ★ suffix on the name; locked rows show a grayscaled badge + progress bar.
- Source of truth: `ACHIEVEMENTS` catalog with `progress(prog)` lambdas that return `{ current, target }`. No extra persistence — derived purely from existing progression state.
- Badge art reuses the 5 Ideogram badges from V7; rest fall back to emoji.

### 3. Legendary banner drop lag fix

- Root cause: when I added `fishArt(fish)` to the legendary/mythic banners in V7, the browser was decoding the PNG on the same frame as the banner drop animation started, causing a stutter on the first catch of each species.
- Fix:
  - Added `preloadFishImage(fish)` helper — constructs an Image, calls `.decode()`, and awaits the promise before mounting the banner. Subsequent drops of the same species hit the browser's image cache and paint instantly.
  - CSS: `.legendary-card` now gets `will-change: transform, opacity; transform: translateZ(0); backface-visibility: hidden; contain: paint;` so the pop/bounce composites on its own GPU layer without repainting the text, glow, and hero image each frame.
- Both legendary and mythic banners go through the same preload path.

### 4. Kid-magic bonus — Today's Star

Codex pick (midflight'd per dad's rule): **daily special fish** over ambient soundscape + treasure chest. Justification: "for a 5-year-old it feels like a today-only secret she can hunt for immediately, lowest chance of fracturing the sticker-book aesthetic, specific overdo risk is turning the glow into loud neon pulse/particle spam — keep it soft, slow, sparse."

- `getTodaysStarFishId()`: hashes calendar date (Y*10000 + M*100 + D) through a scramble + modulo FISH.length. Deterministic per day so Sebastian's daughter can open the album every morning and find a new star.
- Album header shows a gold chip: "🌟 Today's Star: **Tuna**" (or "???" if she hasn't discovered it yet — bonus: doubles as a "go find them" nudge).
- The species' album card gets a **soft pulsing gold ring** (2.6s, rgba 0.45→0.7) + a tiny 🌟 ribbon top-right. Zero neon, zero particles. Deliberately calm.
- When caught: catch notif gets a gold-outlined border + sub-line "🌟 Today's Star! 2× pearls". No new banner, no extra animation — just a ribbon on the standard notif.
- **2× pearls** on eat for the star fish — folded into `pearlsForCatch()` as a simple multiplier.
- What was resisted (per Codex's guardrail): flashing outline in the pond, full-screen "daily star!" announcement on page load, auto-spawning ambient fish of the star species. All of those would have fractured the "gentle magic" vibe.

### Time spent on V8

~75 min total. Tackle bag (18m) + achievements (28m) + legendary lag (9m) + Today's Star (15m) + notes (5m). Codex midflight on the bonus option (2m).

## V8.1 — Morning-after polish patch

Sebastian's daughter completed the entire V8 album in 25 minutes. Five focused fixes to stretch pacing + clean up UI regressions spotted on real tablet use.

### 1. Pacing tune (not a nerf)

- Per dad's call: **keep the bonuses, lower the rarity rates**. Legendary tier weight 10 → 6; mythic 2 → 1. Common/uncommon/rare untouched so early-game momentum still feels generous.
- Probability shift per cast: legendary 7.2% → 4.5% (~1.6× slower); mythic 1.08% → 0.56% (~2× slower). Expected time-to-full-album roughly doubles: 25 min → ~45-75 min for an engaged kid.
- Ancient Turtle specifically: from ~1 in 278 casts (basic rod) to ~1 in 540. Endgame-rod payoff becomes meaningful — Starcatcher's 5× luck takes it to ~1 in 145.
- One shiny in 25 min felt balanced (her feedback) — 1/500 shiny chance preserved.

### 2. Eat-button overflow fix

- Root cause: `.catches` had `padding-right: 6px` which wasn't enough room for the scrollbar on tablet, which painted over the right edge of the Eat button.
- Fix: `padding-right: 14px` + `scrollbar-gutter: stable` so the scrollbar space is reserved regardless of content length.
- Also removed `overflow: hidden` from `.catch-entry` so the Eat button's drop-shadow isn't clipped; rarity-bar rounding preserved via explicit `border-top-left-radius` on `.catch-bar`.

### 3. Album card text wrap

- Cards were 140px min-width which wasn't enough for "Uncommon · Caught 47×" — the `×NN` was wrapping to a second line that got clipped.
- Bumped `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`, trimmed sub font to 0.78rem, added `white-space: nowrap` + `text-overflow: ellipsis`. Now single-line, clean.

### 4. Cast reel uses PNG art

- V7 missed this surface — the slot-reel rows were still rendering `fish.emoji` as text. Swapped to `fishArt(fish, { cls: "reel" })` via `innerHTML`. Added `.cast-reel-row .fish-art.reel { width: 3.2rem; height: 3.2rem; }` + `3.6rem` for the winner row so the landing is visibly larger.
- Also added `mythic: 1` to the reel rep table so Nessie/Giant Squid/Ancient Turtle can peek through as ghost rows.

### 5. FAB stack — Album joins Achievements + Shop

- V8 left Album as a pill button inside the catches panel header; Achievements + Shop were FABs at overlapping vertical positions (shop at bottom: 22px, 58px tall; trophy at bottom: 80px, 48px tall — their edges touched). Looked like a bug.
- New `.fab-stack` flex container (column-reverse + 12px gap) anchored bottom-right, holding **📖 Album** (purple) · **🏆 Achievements** (gold) · **🏪 Shop** (blue). All three at 54px, consistent drop-shadow, consistent hover/press. One visual system for secondary navigation.
- Catches panel header now just says "Your Catches" (no button). One fewer thing competing for attention.

### Time spent on V8.1

~30 min. Five focused fixes, reloaded and smoke-tested each in order. Most-valuable-per-minute patch of the session.

## V9 — Keepsake touches (name your legendary + passport stamps)

Small surprise-drop for Sebastian's daughter. Same aesthetic rules as V8: no neon, no particles, no popup spam. Codex midflight locked direction before implementation.

### 1. Name your Legendary / Mythic (primary)

Every Legendary or Mythic species can be given a kid-chosen name — one name per species, persistent, showable in the album. Personal ownership is the magic for a 6-year-old ("this one's MINE, I named her Sparkle").

- **Tap-to-pick only**, no freeform typing (no spelling frustration). 8 preset names (Bubbles, Finn, Sparkle, Rainbow, Marble, Shadow, Ruby, Coral) in a 2×4 grid + a 🎲 Surprise Me button that picks a random unused name.
- **Trigger: album badge, not popup** (Codex call, over in-the-moment popup). After first catch, the card shows a gold pulsing **✨ Name me** tag. Tap → naming modal. No catch-flow interruption — the legendary/mythic banner sequence stays pure.
- **Skippable forever, re-tappable always**. Tap on the saved name badge later = reopen modal and rename. No confirm dialog, no rename economy. Codex's explicit guardrail: "Treat naming as a keepsake moment, not a feature system."
- **One soft chime** (880 Hz sine, 180 ms) on selection. No confetti, no overlay sparkle, no second modal. Codex's call-out: "Adding extra ceremony to naming (second modal, confirm dialog, reroll animation loops) undercuts the magic."
- Album card shows the chosen name as a soft blue pill under "Legendary · Caught 4×" (e.g. `🏷️ Sparkle`).
- Persistence: `prog.names = { [fishId]: name }` folded into the V3 localStorage schema with forward-migration.

### 2. Passport stamps (bonus, purely decorative)

Every Rare+ first-catch gets a small "APR 20"-style ink stamp in the top-right corner of its album card. Makes the album feel like a keepsake book rather than an inventory grid.

- **Zero interaction, zero animation.** Stamp is a static rotated span, red ink on a faint cream background, slight transparency, rotated -10°, tabular-num digits. Per Codex: "purely decorative (auto date stamp, tiny rotation, no interaction/animation)."
- Appears on Rare, Legendary, Mythic cards only (commons and uncommons stay clean — stamp inflation would dilute the effect).
- Auto-collides with the shiny badge / today's-star ribbon via sibling selectors — if either is present in the top-right, the stamp nudges 36px left.
- Stamp date sources from `prog.discovered[id]` (already stored as firstCaughtAt epoch ms since V2).

### What shipped

Both options. The naming-modal polish left time for the (small-scope) stamp pass. Album cards now composite cleanly: rarity badge · shiny ✨ · star ribbon · passport stamp · fish art · name · sub · name-tag, with no cropping or overlap in the common case or with multiple simultaneous badges (mythic + shiny + star + stamp + name-tag all render on the Kraken/Giant Squid cards correctly).

### File surface

- `index.html` — new naming modal scaffold (hero slot + name grid + surprise button)
- `style.css` — `.naming-*` modal styles + `.album-name-tag` / `.name-me` pulse + `.passport-stamp` ink-look
- `game.js` — `NAME_POOL` + `canName()` + `openNamingFor()` + `pickName()` + `formatStampDate()` + album-card render updates + `prog.names` persistence + `modals.naming` registration

### Time spent on V9

~55 min. Naming (40m) + stamps (10m) + midflight + smoke tests (5m).

## V6.5 — Mythic tier + endgame rods (between V6 and V7)

- Added 5th "Mythic" rarity tier with 3 species: **🦖 Nessie · 🦑 Giant Squid · 🐢 Ancient Turtle**. Base weight 2 per species (~1% per cast at 1× luck, ~4-5× rarer than legendary). Buff slot: +50% Luck for 120s.
- Added 2 ultra-rare endgame rods: **🌙 Moonlit Reel** (4× luck; unlocks at 100 catches + 5 legendaries), **⭐ Starcatcher** (5× luck; unlocks at 200 catches + 3 mythics). Luck multiplier now applies to rare + legendary + mythic.
- `playMythicSequence`: layers Legendary.mp3 + shiny chime, hit-stop + shake + 3 confetti waves (fish / 💠 / ✨) + slowmo + magenta-pink "💠 MYTHIC!" banner.
- Palette: `--mythic: #ff3fcf`, `--mythic-soft: #ffe0f6`. Album shimmer (`mythicShimmer`), banner pop (`mythicPop`), triple-ring magenta glow on the card.
- `__forceRarity` dev hook for deterministic testing of mythic/shiny/legendary paths.

## V7 — Custom illustrated art for every fish, rod, and milestone badge

First time flexing image generation. Replaced emoji pictographs with 34 authored PNGs.

### Provider path — not what the brief called for
Brief said use Codex CLI's built-in `image_gen`. Verified it's only exposed in the interactive TUI, not in `codex exec` sessions (asked Codex to list its tools — `image_gen` isn't there). CLI fallback requires `OPENAI_API_KEY` which wasn't set (auth is ChatGPT subscription tokens). Dad provided **option 4**: Ideogram v3 REST API with the key in macOS Keychain (`security find-generic-password -s ideogram-api-key -w`). Generated 34 PNGs for roughly $2.10, fully automated from a single bash helper.

### Style signature (midflight'd with Codex first)

- Picked: **chunky storybook sticker** — thick 3px near-black outlines, flat cel-gradient fills, saturated kid palette, centered 3/4 side view, sticker white halo around each silhouette. Reads at 48px on inventory cards and still looks intentional at 140px during catch celebrations.
- Tier differentiation: **subtle, within the same style** (Codex recco) — common species have simpler shape language, uncommon adds moderate detail, rare adds richer fin/scale detail, legendary/mythic add mild ornamental cues and magical aura phrasing in the prompt. UI's rarity color bar still does the primary tier signaling.
- Rejected: soft vector (too low-contrast), papercut collage (too crafty), gouache painterly (too muted for a punchy kid game).

### Prompt template (single template, swapped per species)

`chunky storybook {species} sticker illustration, {per-species detail}, thick 3px near-black outline, flat cel-gradient fills, saturated friendly kid colors, rounded chunky shapes, centered single full-body creature in 3/4 side view facing right, fills about 80% of frame, cartoon icon, solid pure white background, no scene, no seabed, no water, no props, no text, no drop shadow, no paper texture`

Ideogram call: `aspect_ratio=1x1, rendering_speed=DEFAULT, magic_prompt=OFF`.

### Asset pipeline

1. `scripts/gen_asset.sh <out> <prompt>` — single-image REST call + download.
2. `scripts/batch_fish.sh` / `batch_rods.sh` / `batch_badges.sh` — parallelized species loops (5 at a time).
3. `scripts/cutout.py` — BFS flood-fill from corners on the PNG alpha channel. Ideogram v3 doesn't support transparent output; the sticker's dark outline cleanly separates the outer bg from any internal white, so corner-seeded flood fill only removes the image backdrop. One pass over all 34 PNGs.

### Iteration count

- **Test batch: 5 fish** (anchovy, mackerel, salmon, great white, nessie) — covered all 5 tiers. All coherent on first pass, no template retune.
- **Batch 2: remaining 18 fish** — all usable first try.
- **Batch 3: 6 rod icons** — all usable first try.
- **Batch 4: 5 achievement badges** (firstLegendary / firstMythic / firstShiny / albumComplete / pondMaster) — all usable first try.
- **Zero retries. Zero emoji fallbacks needed for actual assets.** Total Ideogram spend: ~34 × $0.06 ≈ $2.04.

### Wire-in

- `fishArt(fish)`, `rodArt(rod)`, `badgeArt(id, fallbackEmoji)` helpers at the top of `game.js`. Each emits `<img>` with an `onerror` handler that replaces itself with a `<span class="art-fallback">` carrying the original emoji — so if a PNG ever 404s in the field, the game stays visually consistent.
- Swapped 11 UI render sites: rods panel, next-goal bar, catches list, album cards, catch notif, first-catch notif, rod-unlock notif, eat notif, shiny notif, legendary banner, mythic banner, milestone banner.
- Untouched emoji sites (intentional): cast-reel slot rows (fast scroll, emoji is fine), "Eat All" flying-fish particle cascade (throwaway motion), decorations + ambient fish + dragonfly + clouds (V6 ambient layer, not part of the V7 asset set).
- Asset id ↔ fish id mismatch caught during smoke test: fish IDs `shark` + `whale` needed `assets/fish/shark.png` + `whale.png` to match helper URL construction. Renamed.

### File inventory added

- `assets/fish/*.png` — 23 species × 1024×1024 transparent PNG
- `assets/rods/*.png` — 6 rod icons
- `assets/badges/*.png` — 5 milestone badges
- `scripts/gen_asset.sh` + `batch_{fish,rods,badges}.sh` — generation helpers (IDEOGRAM_API_KEY sourced from Keychain at runtime, not stored in repo)
- `scripts/cutout.py` — one-shot transparency pass

### What was preserved

Every V1-V6 mechanic, buff, sound, animation, and layout. This was purely an asset upgrade. Shinies still use the procedural gold sweep + session-scaled intensity overlay on top of the base art (no per-species shiny generation — saves 23+ generations and stays consistent).

## Time spent

- V1: ~75 min
- V2: ~80 min (+ Codex)
- V3: ~95 min (+ Codex)
- V4: ~80 min (+ Codex)
- V5: ~75 min (+ Codex)
- V6: ~85 min (+ Codex). Smooth build — the single `--surface-y` CSS var contract (Codex's cleanup suggestion) meant every other V6 change just had to reference it. No layout hunting, no one-off Y offsets scattered across the code.
- V6.5 (Mythic + 2 rods): ~40 min. Extended existing tier/rod machinery rather than bolting on.
- V7 (custom art): ~75 min. 10 min lost on the Codex-CLI image_gen dead-end before dad suggested Ideogram; then smooth — midflight for style (8m) → test batch (5m) → full batches (8m) → cutout pass (3m) → wire-in + smoke test (25m) + notes.

## File inventory

- `index.html` — layout + modals (album / shop / settings) + FABs + V6 sky zone + water surface SVG + surface decorations layer
- `style.css` — V5+V6 chrome + V6 sky/surface + V6.5 mythic palette/banner/shimmer + V7 img sizing rules (.fish-art / .rod-art / .badge-art + .art-fallback)
- `game.js` — V1-V6 state/catch math + V6.5 Mythic tier + 2 endgame rods + `playMythicSequence` + V7 `fishArt`/`rodArt`/`badgeArt` helpers + `__forceRarity` dev hook
- `assets/Common.mp3`, `Uncommon.mp3`, `Legendary.mp3`, `Eating.mp3` — original sound files
- `assets/fish/*.png` (23), `assets/rods/*.png` (6), `assets/badges/*.png` (5) — V7 Ideogram-generated transparent PNGs
- `scripts/gen_asset.sh`, `batch_fish.sh`, `batch_rods.sh`, `batch_badges.sh`, `cutout.py` — V7 generation pipeline
- `REQUIREMENTS.md` — original V1 spec (input, preserved)
- `screenshots/` — dev smoke-test artifacts

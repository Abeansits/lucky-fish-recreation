# Lucky Fish

A cheerful fishing game for kids — cast, catch, collect. Built for my 6-year-old daughter. No losing, no timers, no reading-heavy menus; every click produces a catch, a sound, and a little animation.

Live: **https://lucky-fish-production.up.railway.app**

## Tech

Vanilla **HTML + CSS + JS**. No build step. No dependencies. No backend. Three files do all the work:

- `index.html` — layout, modals, panels
- `style.css` — everything visual, all animations
- `game.js` — single IIFE, state + logic + render

Ambient audio uses procedural Web Audio (`blip()` / `noiseBurst()`); catch tiers and eating use MP3s in `assets/`. Save games live in `localStorage`.

The "no build step, works from `file://`" constraint is load-bearing — it's what lets the game ship as three files and deploy behind nginx with a two-line Dockerfile. Don't add a bundler without a strong reason.

## Run locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

`open index.html` also works (Safari).

## Repo tour

```
index.html            layout + DOM skeleton
style.css             ~2700 lines, grouped by feature (search for "---" banners)
game.js               ~3500 lines, single IIFE — TOC at the top of the file
assets/
  fish/               24 species PNG stickers
  rods/               6 rod PNGs
  badges/             milestone badges
  decorations/        5 pond decoration PNGs (V13)
  *.mp3               catch-tier + eating sounds
scripts/              asset generation helpers (see scripts/README.md)
docs/
  learnings/          postmortems, one per noteworthy change
DEPLOY.md             Railway deploy notes
REQUIREMENTS.md       GDD-style feature requirements
PRODUCTION-NOTE.md    version history (V5 → V13)
DESIGN-CRITIQUE-V11.md   designer critique of the eat-vs-sell loop
```

## Where to edit things

`game.js` is long but organized. See the TOC comment at the top of the file for line anchors. High-traffic edits:

| What to change                           | Where                                             |
|------------------------------------------|---------------------------------------------------|
| Add/rebalance a fish                     | `FISH = [...]` near the top                        |
| Add a rod                                | `RODS = [...]`                                     |
| Add/rebalance a pond decoration          | `DECORATIONS = [...]` + matching PNG in `assets/decorations/` |
| Shiny/junk/event/mutation tuning         | Constants near each feature block (grouped)       |
| Add a weather event                      | `EVENTS` + `MUTATIONS` + `EVENT_PENDING_FLAVOR` + new flair function |
| Save-game schema                         | `loadProgression()` / `saveProgression()`          |
| New notification style                   | `pushNotif()` in the Notifications section         |

CSS is grouped by feature with `/* ---------- Section ---------- */` banners.

## Dev hooks

Set these on `window` from the DevTools console to steer the RNG for testing:

| Hook                              | Effect                                                      |
|-----------------------------------|-------------------------------------------------------------|
| `window.__forceEvent = "storm"`   | Next cast schedules that event (`"storm"`/`"rainbow"`/`"moon"`). Cleared after use. |
| `window.__forceRarity = "rare"`   | Next catch is forced to that rarity tier.                   |
| `window.__forceShiny = true`      | Next catch is shiny.                                        |
| `window.__forceMutation = true`   | Next catch is a mutation (requires an active event).        |
| `window.__skipPending()`          | Fast-forward a pending weather event to active on next tick.|

Nothing persists across reloads — all hooks are session-only dev aids.

## Assets

Pond stickers (fish, rods, badges, decorations) are AI-generated to match a consistent "chunky storybook sticker, thick near-black outline, flat cel-gradient fills, pure white bg" style. The white background is flood-filled to alpha=0 via `scripts/cutout.py` after generation.

**For one-offs: use Codex CLI** (cheaper, interactive, good for 1-2 assets). See `scripts/README.md` for the exact invocation and the parallel-race gotcha. **For bulk regenerates: use the Ideogram batch scripts** (deterministic, better for a whole rod/fish set).

## Docs

- `REQUIREMENTS.md` — what the game *is* (design requirements)
- `PRODUCTION-NOTE.md` — what it has *been* (version log, V5→V13)
- `DESIGN-CRITIQUE-V11.md` — a designer's review of V11's eat-vs-sell
- `DEPLOY.md` — how to ship a new version to Railway
- `docs/learnings/` — postmortems (add one when you hit a gotcha worth remembering)

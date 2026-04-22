# V14 — welcome screen + ambient entities + day/night cycle

Date: 2026-04-22
Branch: `main` (shipped direct, per V-series convention)

---

## What shipped

1. **Welcome screen** — full-viewport overlay with animated "LUCKY FISH" title
   (staggered drop-in per-letter), rotating yellow Minecraft-style splash text
   (20 quotes; "Chicken nugget fish is the best fish!" mandatory), and a
   click-to-start gate. Dismiss tracked as `welcome_dismissed` in PostHog.
2. **Ideogram environment art** — 13 new stickers under `assets/env/`:
   seaweed, coral, rock_small, rock_medium, island, ripple, bgfish_big,
   bgfish_med, shark_bg, bird, sun, moon, airplane. Total Ideogram cost
   ~$0.78 at DEFAULT quality.
3. **New ambient entities** —
   - **Sky tier**: bird (replaces dragonfly stand-in), airplane (ultra-rare,
     ~once every few minutes), celestial body (sun or moon, auto-swapped).
   - **Water tier**: big background fish drift across the lower third,
     atmospheric shark silhouette ~every few minutes.
   - **Pond floor**: painterly seaweed / coral / rocks replace emoji flora.
4. **Day/night cycle** — 8-minute real-time cycle driven by `Date.now()`.
   Phases: day → dusk → night → dawn. Sun/moon arc across a half-sine path;
   pond gets a dark-blue overlay whose `opacity` is CSS-var-driven so the
   transition is smooth (no janky `background` transitions). Cosmetic only —
   PostHog events unchanged.

---

## Gotchas (bitten)

### 1. Chrome MCP automation breaks PostHog verification

PostHog's default config (`opt_out_useragent_filter: false`) silently drops
events from pages where `navigator.webdriver === true`. Chrome DevTools MCP
launches Chrome with `--enable-automation`, so **every `ph.capture()` in a
normal MCP session is a no-op**. You will see zero POSTs to
`us.i.posthog.com/e/` no matter what you try.

To verify analytics in an MCP session, inject an init script that hides the
bot flag before the page parses:

```js
navigate_page({
  type: "reload",
  initScript: "Object.defineProperty(navigator, 'webdriver', { get: () => false });"
});
```

With that override, `_is_bot()` returns false and you'll see the real `/e/`
POSTs in the network list. Do **not** leave `__preview_capture_bot_pageviews`
on or strip the ua filter in production — bots flooding events is worse
than losing bot visibility in tests.

### 2. `ScheduleWakeup`-style background bash dies during `wait`

Running the Ideogram batch as `run_in_background: true` and using `&` + `wait`
inside the script got the shell cut short partway through. The script is
idempotent (skips existing PNGs), so rerunning synchronously recovered, but
**don't run long-form asset-gen batches via the MCP background tool** —
they lose children when the outer Bash tool considers the shell "done".
Run synchronously or with a proper job manager.

### 3. `background` gradients don't transition

I started with
```css
.pond::before { background: linear-gradient(rgba(…, calc(var(--night-mix)*0.55)) …); transition: background 3s linear; }
```
which rendered fine but would not animate between values. Switched to a
fixed dark-blue gradient and drove **`opacity: var(--night-mix)`** — that
transitions cleanly across all engines.

### 4. Celestial body escaped the sky-zone

First attempt used a single sinusoid on raw `t ∈ [0,1)` → y went from 15%
to 125%, and the sun/moon fell off the bottom of the `overflow:hidden`
sky zone. Fixed by computing a per-body phase:

```
if (phase === "night") bodyT = (t - 0.35) / 0.30;
else bodyT = ((t + 0.35) % 1) / 0.70;
const x = bodyT * 100;
const y = 85 - Math.sin(bodyT * Math.PI) * 70;  // half-sine → stays in [15, 85]
```

Each body now arcs across its visibility window only.

---

## Ideogram prompts that worked

All 13 assets came out on the first try at DEFAULT quality. The existing
repo style string is doing most of the work:

> chunky storybook kid-friendly cartoon sticker illustration, thick 3px
> near-black outline, flat cel-gradient fills, saturated friendly kid
> colors, rounded chunky shapes, centered single subject filling about 75%
> of frame, solid pure white background, no scene, no props, no text, no
> drop shadow, no paper texture

Subject-specific details that helped:

- **seaweed**: "two or three bright green kelp-style fronds curving slightly,
  chunky leaves, simple base"
- **coral**: "vivid pink and coral-orange branching coral, rounded chunky
  shapes, a few soft white highlights"
- **rock_small / rock_medium**: explicit "moss patches" or "tiny green algae
  tuft on top" kept the rocks from looking sterile
- **island** @ 16:9: "small rounded green hill with one chunky tree on top,
  sandy shore at the base, wide low silhouette" — the wide AR matters; a
  square island looked claustrophobic
- **bird**: "chunky cartoon songbird mid-flight, wings spread, blue-and-white
  plumage, side profile facing right" — face-right baseline matches the
  existing fish convention (flip for leftward motion via `scaleX(-1)`)
- **sun / moon**: both got closed-eye smiles — matches the kid-audience and
  the decorations palette (ducky, mermaid)
- **shark_bg**: "friendly grey cartoon shark, closed smile, not scary" —
  explicitly telling the model "not scary" kept the atmosphere gentle

### What didn't matter

- "transparent feel" in the ripple prompt — Ideogram always emits a solid
  (near-white) bg; `cutout.py` handles the cutout. Don't bother asking the
  model for transparency.
- Requesting a specific rendering speed wasn't needed; DEFAULT was fine
  for every asset.

### Pitfall: `PIL` missing on fresh machines

`cutout.py` needs Pillow. It wasn't installed on this box, so the batch
script silently errored at the cutout step and left white backgrounds.
Added `pip3 install Pillow` as the one-time setup. Consider moving this
into a `requirements.txt` for future repro.

---

## Analytics hygiene

The task flagged "day/night cycle must not break PostHog events". I verified
end-to-end after overriding `navigator.webdriver`:

- `page_loaded` fires on init (before/after welcome dismiss)
- `welcome_dismissed` fires on first tap (new V14 event)
- `cast` fires on every cast
- `fish_caught` fires on resolve
- `session_duration` fires on pagehide/visibilitychange

Day/night updates only write to `document.body.style["--night-mix"]` and
`document.body.dataset.dnPhase` — no `track()` calls, no state mutations
that could interact with the cast/resolve path.

---

## Follow-ups

- Consider replacing the V12 `🦋` dragonfly stand-in with a proper dragonfly
  Ideogram asset (now that the bird works, a dragonfly at 18px would read
  better than the butterfly).
- The ripple PNG is unused — I generated it thinking we'd want a per-cast
  surface effect, but the existing CSS ripple looks crisper. Delete if we
  never find a use.
- Consider tying `--night-mix` into the music volume: quieter/ambient bed
  at night, livelier mix during the day. Would need sandboxing from the
  existing weather-event audio overrides.

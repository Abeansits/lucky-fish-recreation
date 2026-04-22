// Lucky Fish — vanilla JS game.
// Design rules: no backend, every cast produces something.
// V2 adds localStorage progression (rod unlocks, discovery album, milestones, daily gift).
//
// ============================================================================
// TABLE OF CONTENTS (approximate line anchors — keep in sync when re-arranging)
// ============================================================================
//   Analytics                        L56
//   Data catalogs
//     FISH                           L74
//     EVENTS / MUTATIONS             L122 / L127
//     JUNK                           L149
//     RODS                           L176
//     DECORATIONS                    L291
//   Art helpers (fishArt/rodArt/…)   L224
//   Persistence (profiles, slots)    L299
//   State object                     L460
//   DOM refs                         L495
//   Modal helper                     L555
//   Audio (WebAudio blips, MP3s)     L586
//   Ambient soundtrack (music)       L735
//   Rendering
//     renderRods                     L982
//     renderCatches                  L1041
//   Shiny auto-reel lock             L1251
//   Game logic
//     cast()                         L1376
//     resolveCatch()                 L1534
//   Bulk eat / sell                  L1849
//   Notifications                    L2003
//   Legendary + shiny sequences      L2212
//   Cast ripples / flora / bubbles / ambient fish / sky        L2400–2529
//   Main tick loop                   L2582
//   Next-goal strip                  L2599
//   Album                            L2655
//   Shop (decorations + rods)        L2731
//   Achievements                     L2870
//   Naming modal (first-legendary)   L2959
//   Event lifecycle (impl)           L3035
//     maybeStartEvent / schedulePending / startEvent / tickEvent / endEvent
//     renderWeatherPill              L3103
//   Profiles (multi-slot save)       L3300
//   init()                           L3380
//   Settings / Reset                 L3550
//
// Dev hooks (set on window before/during play, consumed by cast() + events):
//   window.__forceEvent    = "storm"|"rainbow"|"moon"   → schedules that event on next cast
//   window.__forceRarity   = "common"|"uncommon"|"rare"|"legendary"|"mythic"
//   window.__forceShiny    = true                       → next catch is shiny
//   window.__forceMutation = true                       → next catch is a mutation (needs active event)
//   window.__skipPending()                              → fast-forward a pending weather event to active
// ============================================================================

(() => {
  "use strict";

  // ---------- Analytics ----------
  // PostHog snippet in index.html; this helper is no-op if it failed to load
  // (ad blocker, offline, CSP) so analytics never breaks the game.
  function track(event, props) {
    try {
      const ph = window.posthog;
      if (ph && typeof ph.capture === "function") ph.capture(event, props || {});
    } catch (e) { /* swallow */ }
  }
  const sessionStartMs = Date.now();
  let sessionCasts = 0;
  let sessionCatches = 0;
  let sessionEnded = false;
  const sessionSpecies = new Set();

  // ---------- Data ----------

  /** @type {{id:string, name:string, emoji:string, rarity:Rarity, hue:number}[]} */
  const FISH = [
    // Common — base weight 40 per species (7 species)
    { id: "anchovy",   name: "Anchovy",   emoji: "🐟", rarity: "common",   hue: 0 },
    { id: "herring",   name: "Herring",   emoji: "🐟", rarity: "common",   hue: 60 },
    { id: "sardine",   name: "Sardine",   emoji: "🐟", rarity: "common",   hue: 120 },
    { id: "guppy",     name: "Guppy",     emoji: "🐠", rarity: "common",   hue: 340 },
    { id: "minnow",    name: "Minnow",    emoji: "🐟", rarity: "common",   hue: 200 },
    { id: "perch",     name: "Perch",     emoji: "🐟", rarity: "common",   hue: 30 },
    { id: "sunfish",   name: "Sunfish",   emoji: "🐡", rarity: "common",   hue: 0 },
    // Uncommon — base weight 30 per species (5 species)
    { id: "mackerel",  name: "Mackerel",  emoji: "🐠", rarity: "uncommon", hue: 0 },
    { id: "bass",      name: "Bass",      emoji: "🐠", rarity: "uncommon", hue: 200 },
    { id: "trout",     name: "Trout",     emoji: "🐟", rarity: "uncommon", hue: 340 },
    { id: "snapper",   name: "Snapper",   emoji: "🐠", rarity: "uncommon", hue: 350 },
    { id: "clownfish", name: "Clownfish", emoji: "🐠", rarity: "uncommon", hue: 20 },
    // Rare — base weight 20 per species (4 species)
    { id: "salmon",    name: "Salmon",    emoji: "🐟", rarity: "rare",     hue: 310 },
    { id: "tuna",      name: "Tuna",      emoji: "🐟", rarity: "rare",     hue: 230 },
    { id: "swordfish", name: "Swordfish", emoji: "🐟", rarity: "rare",     hue: 250 },
    { id: "angelfish", name: "Angelfish", emoji: "🐠", rarity: "rare",     hue: 280 },
    // Legendary — base weight 10 per species (4 species)
    { id: "shark",     name: "Great White Shark", emoji: "🦈", rarity: "legendary", hue: 0 },
    { id: "whale",     name: "Blue Whale",        emoji: "🐋", rarity: "legendary", hue: 0 },
    { id: "kraken",    name: "Kraken",            emoji: "🐙", rarity: "legendary", hue: 0 },
    { id: "mermaid",   name: "Mermaid",           emoji: "🧜", rarity: "legendary", hue: 0 },
    // Mythic — ultra-rare endgame creatures. Base weight 2 per species (3 species
    // total) makes the tier ~1% per cast at 1× luck, roughly 4-5× rarer than legendary.
    { id: "nessie",     name: "Nessie",         emoji: "🦖", rarity: "mythic", hue: 0 },
    { id: "giantsquid", name: "Giant Squid",    emoji: "🦑", rarity: "mythic", hue: 0 },
    { id: "turtle",     name: "Ancient Turtle", emoji: "🐢", rarity: "mythic", hue: 0 },
    // V10: the rarest fish in the pond. `weight` override keeps it below the
    // other mythics but still findable in a reasonable play session. V12
    // bumped from 0.25 → 0.6 after kid-testing found it basically unobtainable.
    { id: "chickennugget", name: "Chicken Nugget Fish", emoji: "🍗", rarity: "mythic", hue: 0, weight: 0.6 },
  ];

  // V8.1 pacing tune (25-min completion was too fast). Legendary + mythic
  // weights cut roughly in half so a full album run feels like a real hunt.
  // Common/uncommon/rare untouched so early-game momentum stays punchy.
  const TIER_WEIGHT = { common: 40, uncommon: 30, rare: 20, legendary: 6, mythic: 1 };
  const TIER_COLOR  = { common: "#4caf50", uncommon: "#3a8dde", rare: "#a05ad8", legendary: "#f2b33a", mythic: "#d83bff" };
  const TIER_LABEL  = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary", mythic: "Mythic" };

  // V12: pond events. Rare weather windows during which fish have a chance to
  // come up "mutated" — themed cosmetic variants that sell for 3× the normal
  // price. Events last ~60s; trigger probability is 0.5% per cast (so roughly
  // 1 event every 10 min of steady casting). Three flavors for now — weather-
  // themed so it reads intuitively to a 6yo and reuses the existing sky zone.
  const EVENTS = [
    { id: "storm",   name: "Storm",       emoji: "⚡",  mutationId: "electric",  mutationAdj: "Electric" },
    { id: "rainbow", name: "Rainbow",     emoji: "🌈", mutationId: "prismatic", mutationAdj: "Prismatic" },
    { id: "moon",    name: "Full Moon",   emoji: "🌕", mutationId: "lunar",     mutationAdj: "Lunar" },
  ];
  const MUTATIONS = {
    electric:  { id: "electric",  adj: "Electric",  color: "#58c8ff", glow: "rgba(88, 200, 255, 0.65)",  icon: "⚡" },
    prismatic: { id: "prismatic", adj: "Prismatic", color: "#ff7ad0", glow: "rgba(255, 122, 208, 0.55)", icon: "🌈" },
    lunar:     { id: "lunar",     adj: "Lunar",     color: "#e8e9ff", glow: "rgba(232, 233, 255, 0.7)",  icon: "🌕" },
  };
  const EVENT_DURATION_MS = 60_000;
  const EVENT_PENDING_MS = 30_000; // warning window before an event actually starts
  const EVENT_CHANCE_PER_CAST = 0.005;
  const MUTATION_CHANCE_IN_EVENT = 0.10;
  const MUTATION_MULT = 3; // pearls multiplier; stacks with shiny's 10×
  // V13: pending weather flavor text per event — shown in the pill + pond banner
  const EVENT_PENDING_FLAVOR = {
    storm:   { verb: "BREWING", pillLabel: "Storm brewing", bannerIcon: "⚡" },
    rainbow: { verb: "FORMING", pillLabel: "Rainbow forming", bannerIcon: "🌈" },
    moon:    { verb: "RISING",  pillLabel: "Moon rising",    bannerIcon: "🌙" },
  };
  function eventById(id) { return EVENTS.find(e => e.id === id); }
  function mutationById(id) { return MUTATIONS[id]; }

  // V12: junk catches. ~10% of casts reel up something useless (no pearls, no
  // buff, no album). Keeps the pond feeling real and adds "aww" moments that
  // make the good catches feel better by contrast.
  const JUNK = [
    { id: "boot",  name: "Old Boot",       emoji: "🥾" },
    { id: "bag",   name: "Trash Bag",      emoji: "🗑️" },
    { id: "teddy", name: "Old Teddy Bear", emoji: "🧸" },
    { id: "can",   name: "Rusty Can",      emoji: "🥫" },
    { id: "sock",  name: "Soggy Sock",     emoji: "🧦" },
  ];
  const JUNK_CHANCE = 0.10;
  const JUNK_FLAVOR = [
    "Not much of a catch.",
    "Oh no, that's not a fish!",
    "Someone lost this…",
    "Aww, junk.",
    "Yuck!",
    "The pond burped that up.",
  ];
  function pickJunk() { return JUNK[Math.floor(Math.random() * JUNK.length)]; }
  function junkById(id) { return JUNK.find(j => j.id === id); }

  // ---------- V12: Event lifecycle ----------
  // Forward-declared so cast() can reference them before definition below.
  let maybeStartEvent, tickEvent, endEvent;

  // V10 redesign: rods are no longer auto-unlocked. Most need just pearls;
  // mid + top rods need a catch milestone unlocked before you can buy. This
  // turns "eat vs sell" into a real strategic choice — sell to afford the
  // next rod, eat to buff the current run.
  const RODS = [
    {
      id: "basic", name: "Trusty Stick", emoji: "🪵",
      desc: "A reliable starter rod.", luck: 1.0,
      unlock: null, price: 0, // always available, never charged
    },
    {
      id: "lucky", name: "Lucky Rod", emoji: "🍀",
      desc: "Nudges rare catches your way.", luck: 1.5,
      unlock: null, price: 50,
    },
    {
      id: "hunter", name: "Rare Hunter", emoji: "🎯",
      desc: "Chases rarer fish hard.", luck: 2.0,
      unlock: { rareCatches: 3, label: "Catch 3 rare fish" },
      price: 200,
    },
    {
      id: "legend", name: "Legend Reeler", emoji: "🌟",
      desc: "Strong pull on rare & legendary.", luck: 3.0,
      unlock: { legendaryCatches: 2, label: "Catch 2 legendaries" },
      price: 500,
    },
    {
      id: "moonlit", name: "Moonlit Reel", emoji: "🌙",
      desc: "Pulls from deeper waters.", luck: 4.0,
      unlock: { legendaryCatches: 5, label: "Catch 5 legendaries" },
      price: 1200,
    },
    {
      id: "starcatcher", name: "Starcatcher", emoji: "⭐",
      desc: "Catches myths.", luck: 5.0,
      unlock: { mythicCatches: 2, label: "Catch 2 mythics" },
      price: 3000,
    },
  ];

  // Buff definitions per-tier. Every fish in a tier shares the same buff.
  const TIER_BUFF = {
    common:    { type: "speed",  value: 0.10, duration: 30,  label: "+10% Fishing Speed" },
    uncommon:  { type: "double", value: 0.20, duration: 45,  label: "20% Double Catch" },
    rare:      { type: "luck",   value: 0.15, duration: 60,  label: "+15% Luck" },
    legendary: { type: "luck",   value: 0.30, duration: 90,  label: "+30% Luck" },
    mythic:    { type: "luck",   value: 0.50, duration: 120, label: "+50% Luck" },
  };

  const CAST_BEAT_MS = 1500;

  // ---------- V7: custom art with emoji fallback ----------
  // Each UI render path uses these instead of inlining the emoji directly. If
  // the PNG 404s or fails to decode, onerror swaps the <img> for a <span>
  // carrying the original emoji so nothing goes visually blank.
  function _artEscape(s) { return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function _artFallback(emoji, extraCls = "") {
    const payload = JSON.stringify({ e: emoji, c: extraCls });
    return `this.onerror=null;var d=${payload};var s=document.createElement('span');s.className='art-fallback '+d.c;s.textContent=d.e;this.replaceWith(s);`;
  }
  function fishArt(fish, { cls = "", isShiny = false } = {}) {
    const classes = ["fish-art", cls, isShiny ? "shiny" : ""].filter(Boolean).join(" ");
    const filter = (!isShiny && fish.hue) ? ` style="filter:hue-rotate(${fish.hue}deg) saturate(1.1);"` : "";
    const onerr = _artEscape(_artFallback(fish.emoji, classes));
    return `<img class="${classes}" src="assets/fish/${fish.id}.png" alt="${_artEscape(fish.name)}"${filter} onerror="${onerr}">`;
  }
  function rodArt(rod, { cls = "" } = {}) {
    const classes = ["rod-art", cls].filter(Boolean).join(" ");
    const onerr = _artEscape(_artFallback(rod.emoji, classes));
    return `<img class="${classes}" src="assets/rods/${rod.id}.png" alt="${_artEscape(rod.name)}" onerror="${onerr}">`;
  }
  function badgeArt(badgeId, fallbackEmoji, { cls = "" } = {}) {
    const classes = ["badge-art", cls].filter(Boolean).join(" ");
    const onerr = _artEscape(_artFallback(fallbackEmoji, classes));
    return `<img class="${classes}" src="assets/badges/${badgeId}.png" alt="" onerror="${onerr}">`;
  }
  function decoArt(deco, { cls = "" } = {}) {
    const classes = ["deco-art", cls].filter(Boolean).join(" ");
    const onerr = _artEscape(_artFallback(deco.emoji, classes));
    return `<img class="${classes}" src="assets/decorations/${deco.id}.png" alt="${_artEscape(deco.name)}" onerror="${onerr}">`;
  }

  // ---------- V3 additions ----------

  // 1 / SHINY_DENOM roll on every catch. V12 bumped from 500 → 120 after
  // kid-testing — 1/500 meant a full session could pass without a single
  // shiny, which killed the "wow moment". 1/120 lands one every ~4-5 min
  // of casual play — still a treat, but actually attainable for young kids.
  const SHINY_DENOM = 120;
  // How long the cast button stays disabled while the shiny celebration
  // plays out. Must cover: overlay (2500ms) + banner pop (1700ms staggered).
  const SHINY_CELEBRATION_MS = 2600;

  // Pearl payouts on eat. Shiny grants 10× the tier base.
  const PEARLS_PER_TIER = { common: 1, uncommon: 3, rare: 10, legendary: 30, mythic: 100 };
  const SHINY_MULT = 10;

  // V9: preset name list for Legendary + Mythic catches. Tap-to-pick only —
  // no freeform typing (6-year-old, no spelling frustration). One name per
  // species, editable from the album card, skippable forever without penalty.
  const NAME_POOL = ["Bubbles", "Finn", "Sparkle", "Rainbow", "Marble", "Shadow", "Ruby", "Coral"];
  function canName(fish) {
    return fish && (fish.rarity === "legendary" || fish.rarity === "mythic");
  }
  // V9 passport stamp format: "Apr 20" — tiny ink-circle label on Rare+ cards
  // showing the first-caught date. Decorative only, no interaction.
  const STAMP_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function formatStampDate(ts) {
    const d = new Date(ts);
    return `${STAMP_MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  // Pond decoration catalog. Emoji-based so they need no assets. Prices are
  // tuned (per Codex) so the first purchase lands in ~4 minutes and the full
  // set caps around ~90 min of casual play.
  // V6: each decoration declares a `surface: true` flag if it belongs on the
  // water line rather than underwater. Ducky + Lily are surface creatures;
  // gem/mermaid-deco/dragon live below.
  const DECORATIONS = [
    { id: "ducky",   name: "Rubber Ducky", emoji: "🦆", price: 60,  pos: { x: 16, y: 30 }, surface: true },
    { id: "lily",    name: "Lily Pad",     emoji: "🪷", price: 120, pos: { x: 82, y: 31 }, surface: true },
    { id: "gem",     name: "Treasure Gem", emoji: "💎", price: 220, pos: { x: 45, y: 86 } },
    { id: "mermaid", name: "Mermaid",      emoji: "🧜", price: 380, pos: { x: 22, y: 76 } },
    { id: "dragon",  name: "Sea Dragon",   emoji: "🐉", price: 600, pos: { x: 74, y: 72 } },
  ];

  // ---------- Persistence ----------
  // V10 redesign: eat vs sell split + rod store rework. Bumping the key
  // deliberately wipes V3 saves so the old pearls/unlocks can't leak into
  // the new economy. No legacy migration on purpose.
  // V12: multi-profile save slots. Profile list lives at `luckyFish.profiles`,
  // each slot's progression lives at `luckyFish.v4.<slotId>`. The old single
  // `luckyFish.v4` save migrates into slot-1 on first boot after upgrade.
  const LEGACY_STORAGE_KEY = "luckyFish.v4";
  const PROFILES_KEY = "luckyFish.profiles";
  const SLOT_PREFIX = "luckyFish.v4.";
  const MAX_SLOTS = 4;
  const PROFILE_EMOJIS = ["🎣","🐠","🐟","🦈","🐙","🐢","🦆","🐉","🧜","🐡","🐋","⭐","🌙","🌈","🍀","🪵","🫧","🦑","🐬","🦐"];
  const SKIP_PICKER_FLAG = "luckyFish.skipPicker";

  function slotStorageKey(slotId) { return SLOT_PREFIX + slotId; }

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (!raw) return { active: null, slots: [] };
      const parsed = JSON.parse(raw);
      const slots = Array.isArray(parsed.slots) ? parsed.slots.filter(s => s && s.id) : [];
      const active = slots.some(s => s.id === parsed.active) ? parsed.active : (slots[0]?.id ?? null);
      return { active, slots };
    } catch (e) {
      return { active: null, slots: [] };
    }
  }

  function saveProfiles(profiles) {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch (e) {}
  }

  // On first boot after the multi-profile upgrade: adopt the old single-save
  // key as Player 1 so nobody loses their pearls/album.
  function ensureProfilesExist() {
    let profiles = loadProfiles();
    if (profiles.slots.length > 0) return profiles;
    const slotId = "slot-1";
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      try { localStorage.setItem(slotStorageKey(slotId), legacy); } catch (e) {}
      try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (e) {}
    }
    profiles = {
      active: slotId,
      slots: [{ id: slotId, name: "Player 1", emoji: "🎣", createdAt: Date.now() }],
    };
    saveProfiles(profiles);
    return profiles;
  }

  const profiles = ensureProfilesExist();
  const STORAGE_KEY = slotStorageKey(profiles.active);

  function activeProfile() {
    return profiles.slots.find(s => s.id === profiles.active) || null;
  }

  // Peek at another slot's saved data without disturbing the active `prog`.
  // Used to show pearls + discovery count on each tile in the picker.
  function peekSlotStats(slotId) {
    try {
      const raw = localStorage.getItem(slotStorageKey(slotId));
      if (!raw) return { pearls: 0, discovered: 0, total: 0 };
      const p = JSON.parse(raw);
      return {
        pearls: Number(p?.pearls) || 0,
        discovered: Object.keys(p?.discovered || {}).length,
        total: Number(p?.totals?.all) || 0,
      };
    } catch (e) { return { pearls: 0, discovered: 0, total: 0 }; }
  }

  function createProfile({ name, emoji }) {
    const trimmed = (name || "").trim().slice(0, 14) || "Player";
    const used = new Set(profiles.slots.map(s => s.id));
    let i = 1, slotId;
    do { slotId = `slot-${i++}`; } while (used.has(slotId));
    const slot = { id: slotId, name: trimmed, emoji: emoji || "🎣", createdAt: Date.now() };
    profiles.slots.push(slot);
    profiles.active = slotId;
    saveProfiles(profiles);
    return slot;
  }

  function switchToProfile(slotId) {
    if (!profiles.slots.some(s => s.id === slotId)) return;
    profiles.active = slotId;
    saveProfiles(profiles);
    try { sessionStorage.setItem(SKIP_PICKER_FLAG, "1"); } catch (e) {}
    location.reload();
  }

  function freshProgression() {
    return {
      totals: { all: 0, common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0, shinies: 0, bySpecies: {} },
      discovered: {}, // speciesId -> firstCaughtAt (ms epoch)
      shinyDiscovered: {}, // speciesId -> firstCaughtAt
      // V10: unlocks now only contains rods the player has BOUGHT. Basic is free.
      unlocks: { basic: true },
      // V10: track which rod milestones we've already announced so we don't
      // spam the "rod unlocked for purchase" notification more than once.
      rodMilestoneSeen: {},
      selectedRod: "basic",
      milestonesSeen: { firstLegendary: false, albumComplete: false, firstShiny: false, allDecorations: false, firstMythic: false },
      lastGiftDate: null,
      pearls: 0,
      decorationsOwned: {},
      muted: false,
      names: {}, // V9: speciesId -> chosen name (legendary+mythic only)
      // V12: mutation tracking. Keyed `<fishId>:<mutationId>` → first-caught ms.
      mutationsDiscovered: {},
      mutationsCaught: 0,
      // Analytics: achievement id -> first-unlocked ms. Used to fire
      // `achievement_unlocked` exactly once per achievement per profile.
      achievementsUnlocked: {},
    };
  }

  function loadProgression() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshProgression();
      const parsed = JSON.parse(raw);
      const fresh = freshProgression();
      return {
        totals: { ...fresh.totals, ...(parsed.totals || {}),
          bySpecies: { ...(parsed.totals?.bySpecies || {}) } },
        discovered: { ...(parsed.discovered || {}) },
        shinyDiscovered: { ...(parsed.shinyDiscovered || {}) },
        unlocks: { ...fresh.unlocks, ...(parsed.unlocks || {}) },
        rodMilestoneSeen: { ...(parsed.rodMilestoneSeen || {}) },
        selectedRod: parsed.selectedRod || "basic",
        milestonesSeen: { ...fresh.milestonesSeen, ...(parsed.milestonesSeen || {}) },
        lastGiftDate: parsed.lastGiftDate || null,
        pearls: Number(parsed.pearls) || 0,
        decorationsOwned: { ...(parsed.decorationsOwned || {}) },
        muted: parsed.muted === true,
        names: { ...(parsed.names || {}) },
        mutationsDiscovered: { ...(parsed.mutationsDiscovered || {}) },
        mutationsCaught: Number(parsed.mutationsCaught) || 0,
        achievementsUnlocked: { ...(parsed.achievementsUnlocked || {}) },
      };
    } catch (e) {
      return freshProgression();
    }
  }

  function saveProgression() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prog)); } catch (e) {}
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---------- State ----------
  const prog = loadProgression();

  const state = {
    selectedRodId: prog.unlocks[prog.selectedRod] ? prog.selectedRod : "basic",
    // inventory key: fishId for normal, `${fishId}:shiny` for shiny variant.
    inventory: new Map(), // session-only
    buffs: new Map(),     // session-only
    casting: false,
    pendingDailyGift: false, // set true at init if today's first cast should be a guaranteed undiscovered fish
    albumOpen: false,
    shopOpen: false,
    achievementsOpen: false,
    tackleBagOpen: false,
    settingsOpen: false,
    namingOpen: false,
    namingSpecies: null, // V9: fishId of the species currently being named
    profileOpen: false,
    createProfileOpen: false,
    createProfileEmoji: "🎣", // currently selected emoji in the create-profile form
    eatingAll: false,
    autoReel: null,       // { endsAt, totalMs } — set by shiny-eat, chains casts until expiry
    // V12: timestamp until which the cast button stays locked because a shiny
    // celebration is in progress. 0 = no lock. Keeps the kid from spamming
    // through the moment (and racing the fanfare audio + banner animation).
    shinyLockUntil: 0,
    // V12: active pond event (weather window enabling mutation catches).
    // Shape: { id: "storm"|"rainbow"|"moon", endsAt: ms } or null. Session-
    // only — doesn't persist across reloads by design (events are a moment).
    activeEvent: null,
    // V13: pending weather window. Pre-warning phase before an event actually
    // triggers — shows a banner in the pond and a warning pill in the header.
    // Shape: { id, startsAt: ms } or null.
    pendingEvent: null,
    eventTickerId: null, // setInterval id for the countdown pill refresh
  };

  // ---------- DOM ----------
  const $pond = document.getElementById("pond");
  const $castBtn = document.getElementById("cast-btn");
  const $castIndicator = document.getElementById("cast-indicator");
  const $rods = document.getElementById("rods");
  const $catches = document.getElementById("catches");
  const $notifs = document.getElementById("notifications");
  const $buffRow = document.getElementById("buff-row");
  const $ambient = document.getElementById("ambient-fish");
  const $nextGoal = document.getElementById("next-goal");
  const $albumBtn = document.getElementById("album-btn");
  const $albumOverlay = document.getElementById("album-overlay");
  const $albumGrid = document.getElementById("album-grid");
  const $albumProgress = document.getElementById("album-progress");
  const $pearls = document.getElementById("pearls");
  const $shopBtn = document.getElementById("shop-btn");
  const $shopOverlay = document.getElementById("shop-overlay");
  const $shopGrid = document.getElementById("shop-grid");
  const $shopPearls = document.getElementById("shop-pearls");
  const $decorations = document.getElementById("decorations");
  const $eatAllBtn = document.getElementById("eat-all-btn");
  const $sellAllBtn = document.getElementById("sell-all-btn");
  const $bulkActions = document.getElementById("bulk-actions");
  const $bubbles = document.getElementById("bubbles");
  const $castReel = document.getElementById("cast-reel");
  const $castReelStrip = document.getElementById("cast-reel-strip");
  const $settingsBtn = document.getElementById("settings-btn");
  const $settingsOverlay = document.getElementById("settings-overlay");
  const $muteToggle = document.getElementById("mute-toggle");
  const $resetBtn = document.getElementById("reset-btn");
  const $resetConfirm = document.getElementById("reset-confirm");
  const $resetCancel = document.getElementById("reset-cancel");
  const $resetYes = document.getElementById("reset-yes");
  // V8: tackle bag + achievements
  const $tackleBagBtn = document.getElementById("tackle-bag-btn");
  const $tackleBagOverlay = document.getElementById("tackle-bag-overlay");
  const $tackleBagRod = document.getElementById("tackle-bag-rod");
  const $achievementsBtn = document.getElementById("achievements-btn");
  const $achievementsOverlay = document.getElementById("achievements-overlay");
  const $achievementsList = document.getElementById("achievements-list");
  const $achievementsProgress = document.getElementById("achievements-progress");
  // V9 naming modal
  const $namingOverlay = document.getElementById("naming-overlay");
  const $namingTitle = document.getElementById("naming-title");
  const $namingHero = document.getElementById("naming-hero");
  const $namingGrid = document.getElementById("naming-grid");
  // V12 profiles
  const $profileOverlay = document.getElementById("profile-overlay");
  const $profileGrid = document.getElementById("profile-grid");
  const $profileClose = document.getElementById("profile-close");
  const $createProfileOverlay = document.getElementById("create-profile-overlay");
  const $createProfileName = document.getElementById("create-profile-name");
  const $createProfileEmojis = document.getElementById("create-profile-emojis");
  const $createProfileSubmit = document.getElementById("create-profile-submit");
  const $createProfileClose = document.getElementById("create-profile-close");
  const $switchProfileBtn = document.getElementById("switch-profile-btn");
  const $activeProfileName = document.getElementById("active-profile-name");
  const $resetConfirmName = document.getElementById("reset-confirm-name");
  // V12 events
  const $eventPill = document.getElementById("event-pill");

  // ---------- V8.1 modal helper ----------
  // One place to toggle a modal's visibility + aria-hidden + state flag. Also
  // backs the unified ESC handler — whichever modal is `state[stateKey] = true`
  // gets closed. Each modal registers here and gets { open, close } back.
  const openModals = [];
  const modals = {};
  // Forward-declared so other functions (e.g. rod-select click) can call them
  // before the wire-up in init() runs. Init overwrites these with real bindings.
  let openAlbum, closeAlbum, openShop, closeShop, openTackleBag, closeTackleBag,
      openAchievements, closeAchievements, openSettings, closeSettings;
  function makeModal({ overlay, stateKey, onOpen, onClose }) {
    const m = {
      overlay,
      stateKey,
      open() {
        onOpen?.();
        overlay.classList.remove("hidden");
        overlay.setAttribute("aria-hidden", "false");
        state[stateKey] = true;
      },
      close() {
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
        state[stateKey] = false;
        onClose?.();
      },
    };
    openModals.push(m);
    return m;
  }

  // ---------- Audio ----------
  // Procedural sounds — no external assets.
  /** @type {AudioContext|null} */
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // V5: unified mute gate. Wrap a muted check around playback helpers so
  // toggling the setting instantly silences everything without teardown.
  function audioMuted() { return !!prog.muted; }

  // Track active sources per sound key so re-triggers cut off old voices.
  const activeAudioNodes = new Map();
  function stopSoundKey(key) {
    const nodes = activeAudioNodes.get(key);
    if (!nodes) return;
    for (const n of nodes) { try { n.stop(); } catch (e) {} }
    activeAudioNodes.delete(key);
  }
  function trackNode(key, node) {
    if (!activeAudioNodes.has(key)) activeAudioNodes.set(key, []);
    activeAudioNodes.get(key).push(node);
    node.onended = () => {
      const list = activeAudioNodes.get(key);
      if (list) {
        const i = list.indexOf(node);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) activeAudioNodes.delete(key);
      }
    };
  }

  function blip({ key, freq, duration = 0.2, type = "sine", vol = 0.2, attack = 0.005, release = 0.08, at = 0, slideTo = null }) {
    if (audioMuted()) return null;
    const ctx = ac();
    const start = ctx.currentTime + at;
    const end = start + duration;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo != null) {
      osc.frequency.linearRampToValueAtTime(slideTo, end);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + attack);
    g.gain.setValueAtTime(vol, end - release);
    g.gain.linearRampToValueAtTime(0, end);

    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
    if (key) trackNode(key, osc);
    return osc;
  }

  function noiseBurst({ key, duration = 0.15, vol = 0.15, filterFreq = 1200, at = 0, filterSlide = null }) {
    if (audioMuted()) return null;
    const ctx = ac();
    const start = ctx.currentTime + at;
    const end = start + duration;
    const len = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(filterFreq, start);
    if (filterSlide != null) f.frequency.linearRampToValueAtTime(filterSlide, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(start);
    src.stop(end + 0.02);
    if (key) trackNode(key, src);
    return src;
  }

  function playCast() {
    stopSoundKey("cast");
    blip({ key: "cast", freq: 660, slideTo: 220, duration: 0.28, type: "triangle", vol: 0.14 });
  }

  // V4: original MP3 sound files for the four core moments. Rare has no
  // dedicated file in the original — we play Legendary at half volume so the
  // tier ordering still escalates audibly without re-using the fanfare at
  // full blast (which would make Rare indistinguishable from Legendary).
  const AUDIO_ASSETS = {
    common:    { src: "assets/Common.mp3",    vol: 0.7 },
    uncommon:  { src: "assets/Uncommon.mp3",  vol: 0.7 },
    rare:      { src: "assets/Legendary.mp3", vol: 0.42 },
    legendary: { src: "assets/Legendary.mp3", vol: 0.85 },
    eat:       { src: "assets/Eating.mp3",    vol: 0.8 },
  };
  const audioBank = {};
  (function preloadAudio() {
    for (const [key, { src, vol }] of Object.entries(AUDIO_ASSETS)) {
      const a = new Audio(src);
      a.preload = "auto";
      a.volume = vol;
      audioBank[key] = a;
    }
  })();

  function playFile(key) {
    if (audioMuted()) return;
    const src = audioBank[key];
    if (!src) return;
    try {
      src.pause();
      src.currentTime = 0;
      const p = src.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {}
  }

  function playCatchSound(rarity) {
    // Stop procedural catch/shiny so clips don't overlap with lingering WebAudio.
    stopSoundKey("catch");
    stopSoundKey("shiny");
    playFile(rarity);
  }

  function playEatSound() {
    stopSoundKey("eat");
    playFile("eat");
  }

  // V12: a short, low "wah-wah" for junk catches. Two descending triangle
  // blips — brass-ish and deflating, the opposite of the ascending sell
  // chime. ~0.35s total so it gets out of the way quickly.
  function playJunkSound() {
    if (audioMuted()) return;
    stopSoundKey("junk");
    blip({ key: "junk", freq: 380, slideTo: 280, duration: 0.16, type: "triangle", vol: 0.11, attack: 0.01, release: 0.10 });
    blip({ key: "junk", freq: 280, slideTo: 180, duration: 0.22, type: "triangle", vol: 0.12, attack: 0.01, release: 0.14, at: 0.13 });
  }

  // ---------- V13: Ambient soundtrack ----------
  // Six-track shuffled playlist; two <Audio> elements ping-pong so tracks
  // crossfade into each other (no gap, no re-shuffle repeats until the
  // queue drains). Respects the existing mute toggle — one knob kills both
  // SFX and music. Browsers block cold autoplay, so playback starts on the
  // first user pointerdown.
  const MUSIC_TRACKS = [
    "Beneath the Surface.mp3",
    "Last Light.mp3",
    "Morning Ripples.mp3",
    "Still Waters x The Enchanted Quest 🌄 (Mashup).mp3",
    "Still Waters x The Enchanted Quest 🌄 (Mashup)-2.mp3",
    "Sunshine on the Dock.mp3",
  ];
  const MUSIC_VOLUME = 0.22;        // ambient bed — SFX still punches through
  const MUSIC_CROSSFADE_MS = 2000;  // overlap between tracks
  const musicState = {
    unlocked: false,   // flips to true on first user pointerdown
    started: false,    // set once to avoid double-starting
    queue: [],         // upcoming tracks in shuffle order
    active: null,      // the <Audio> currently audible (or fading in)
    standby: null,     // the other <Audio> (previous track fading out, or idle)
    fadeTimer: null,
  };
  function shuffledMusicQueue() {
    const q = MUSIC_TRACKS.slice();
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    return q;
  }
  function musicSrc(name) { return "assets/music/" + encodeURIComponent(name); }
  function nextTrackName() {
    if (musicState.queue.length === 0) musicState.queue = shuffledMusicQueue();
    return musicState.queue.shift();
  }
  function makeMusicElement() {
    const a = new Audio();
    a.preload = "auto";
    a.volume = 0;
    // Single-track playback only — we do our own "loop" by queueing the next.
    a.loop = false;
    return a;
  }
  function initMusic() {
    musicState.active = makeMusicElement();
    musicState.standby = makeMusicElement();
    // When the active track ends without a crossfade (e.g. short track,
    // timeupdate missed), roll straight into the next one.
    const onEnded = () => { if (!audioMuted()) crossfadeToNext(); };
    musicState.active.addEventListener("ended", onEnded);
    musicState.standby.addEventListener("ended", onEnded);
    // Kick off the crossfade before a track fully ends so there's no gap.
    const onTimeUpdate = (el) => () => {
      if (!el.duration || el.duration === Infinity) return;
      if (audioMuted()) return;
      const remainingMs = (el.duration - el.currentTime) * 1000;
      if (remainingMs <= MUSIC_CROSSFADE_MS && el === musicState.active) {
        crossfadeToNext();
      }
    };
    musicState.active.addEventListener("timeupdate", onTimeUpdate(musicState.active));
    musicState.standby.addEventListener("timeupdate", onTimeUpdate(musicState.standby));
  }
  function unlockMusic() {
    if (musicState.unlocked) return;
    musicState.unlocked = true;
    if (!audioMuted()) startMusic();
  }
  function startMusic() {
    if (musicState.started) return;
    if (audioMuted()) return;
    const name = nextTrackName();
    musicState.active.src = musicSrc(name);
    musicState.active.volume = 0;
    const p = musicState.active.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    fadeTo(musicState.active, MUSIC_VOLUME, MUSIC_CROSSFADE_MS);
    musicState.started = true;
  }
  function crossfadeToNext() {
    if (audioMuted()) return;
    // Guard re-entrancy: if the standby is already fading in, ignore.
    if (musicState.standby.volume > 0 && !musicState.standby.paused) return;
    // Capture element refs by value before the slot swap — the fade callbacks
    // fire ~2s later, and if we reference musicState.active from inside them
    // we'll be pointing at the newly-swapped-in track instead of the old one.
    const outgoing = musicState.active;
    const incoming = musicState.standby;
    const name = nextTrackName();
    incoming.src = musicSrc(name);
    incoming.currentTime = 0;
    incoming.volume = 0;
    const p = incoming.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    fadeTo(incoming, MUSIC_VOLUME, MUSIC_CROSSFADE_MS);
    fadeTo(outgoing, 0, MUSIC_CROSSFADE_MS, () => {
      try { outgoing.pause(); } catch (e) {}
    });
    // Swap: incoming is now the audible active, outgoing becomes standby.
    musicState.active = incoming;
    musicState.standby = outgoing;
  }
  function fadeTo(el, target, durationMs, onDone) {
    const start = el.volume;
    const delta = target - start;
    if (durationMs <= 0 || delta === 0) { el.volume = target; onDone && onDone(); return; }
    const steps = Math.max(12, Math.round(durationMs / 60));
    const stepMs = durationMs / steps;
    let i = 0;
    const tick = () => {
      i += 1;
      const t = Math.min(1, i / steps);
      el.volume = Math.max(0, Math.min(1, start + delta * t));
      if (i < steps) setTimeout(tick, stepMs);
      else onDone && onDone();
    };
    setTimeout(tick, stepMs);
  }
  function pauseMusic() {
    try { musicState.active && musicState.active.pause(); } catch (e) {}
    try { musicState.standby && musicState.standby.pause(); } catch (e) {}
  }
  function resumeMusic() {
    if (audioMuted()) return;
    if (!musicState.unlocked) return;   // haven't had first gesture yet
    if (!musicState.started) { startMusic(); return; }
    // Resume whichever track was audible.
    try {
      if (musicState.active.paused) {
        const p = musicState.active.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } catch (e) {}
  }

  // V10: light "ka-ching" for selling — no sample file, just a short chime
  // so it sits distinct from the chomp sound.
  function playSellSound() {
    if (audioMuted()) return;
    blip({ freq: 880, slideTo: 1320, duration: 0.18, type: "triangle", vol: 0.13, attack: 0.005, release: 0.12 });
    blip({ freq: 1320, slideTo: 1760, duration: 0.16, type: "sine",     vol: 0.09, attack: 0.015, release: 0.12, at: 0.05 });
  }

  // Ascending chirp when a buff pill appears — pitch + body scale with rarity
  // so Eat-All's three-pop climax audibly peaks on the best buff. Respects mute.
  function playBuffAppear(rarity) {
    if (audioMuted()) return;
    const tones = {
      common:    { freq: 520, slideTo: 680,  vol: 0.10 },
      uncommon:  { freq: 620, slideTo: 820,  vol: 0.12 },
      rare:      { freq: 720, slideTo: 960,  vol: 0.14 },
      legendary: { freq: 820, slideTo: 1140, vol: 0.16 },
      mythic:    { freq: 920, slideTo: 1320, vol: 0.18 },
    };
    const t = tones[rarity] || tones.common;
    blip({ freq: t.freq, slideTo: t.slideTo, duration: 0.22, type: "triangle", vol: t.vol, attack: 0.008, release: 0.12 });
    if (rarity === "legendary" || rarity === "mythic") {
      blip({ freq: t.freq * 1.5, slideTo: t.slideTo * 1.5, duration: 0.24, type: "sine", vol: t.vol * 0.65, attack: 0.015, release: 0.14 });
    }
  }

  function playAutoReelStart() {
    if (audioMuted()) return;
    blip({ freq: 540, slideTo: 1080, duration: 0.32, type: "triangle", vol: 0.14, attack: 0.01, release: 0.16 });
    blip({ freq: 810, slideTo: 1620, duration: 0.28, type: "sine",     vol: 0.09, attack: 0.02, release: 0.14 });
  }

  function playShinySound() {
    // Distinct from rarity tier SFX: a crystal-chime ascending glissando +
    // sparkly upper-octave tinkles, over a shimmering pad. Longer than the
    // legendary fanfare on purpose — shinies should stop the room.
    stopSoundKey("catch");
    stopSoundKey("shiny");
    const k = "shiny";
    // Ascending crystal arpeggio
    const notes = [523, 659, 784, 1046, 1318, 1568, 1975];
    notes.forEach((f, i) => {
      blip({ key: k, freq: f, duration: 0.22, type: "sine", vol: 0.14, at: i * 0.06 });
      blip({ key: k, freq: f * 2, duration: 0.18, type: "triangle", vol: 0.07, at: i * 0.06 });
    });
    // Shimmering tail — five tinkles high
    [2093, 2637, 3136, 2637, 2093].forEach((f, i) => {
      blip({ key: k, freq: f, duration: 0.16, type: "sine", vol: 0.1, at: 0.6 + i * 0.08 });
    });
    // Soft warm pad under it all
    blip({ key: k, freq: 261, duration: 1.1, type: "triangle", vol: 0.05, at: 0.0 });
    blip({ key: k, freq: 392, duration: 1.1, type: "triangle", vol: 0.05, at: 0.1 });
  }

  // V12: full SHINY! fanfare for actual shiny catches. Strictly bigger than
  // playShinySound (which is still reused inside the mythic stack). Layers a
  // deep bell thump, a noise-burst whoosh, a slower ascending arpeggio, an
  // extended shimmer tail, and a final resolving bell on top of a sustained
  // warm pad. ~2.2 seconds of "holy crap, you found one."
  function playShinyFanfare() {
    if (audioMuted()) return;
    stopSoundKey("catch");
    stopSoundKey("shiny");
    const k = "shiny";
    // Deep bell thump at the moment of catch.
    blip({ key: k, freq: 131, duration: 1.6, type: "sine",     vol: 0.17, attack: 0.02, release: 0.9 });
    blip({ key: k, freq: 196, duration: 1.3, type: "triangle", vol: 0.10, attack: 0.04, release: 0.6 });
    // Airy whoosh that sells the "magic happening" moment.
    noiseBurst({ key: k, duration: 0.55, vol: 0.10, filterFreq: 4200, filterSlide: 400, at: 0.04 });
    // Ascending arpeggio — slower + louder than playShinySound.
    const notes = [523, 659, 784, 1046, 1318, 1568, 1975];
    notes.forEach((f, i) => {
      blip({ key: k, freq: f,      duration: 0.28, type: "sine",     vol: 0.17, at: i * 0.085 });
      blip({ key: k, freq: f * 2,  duration: 0.22, type: "triangle", vol: 0.08, at: i * 0.085 });
    });
    // Extended shimmer tail — more tinkles, held longer.
    [2093, 2637, 3136, 2637, 3136, 2637, 2093].forEach((f, i) => {
      blip({ key: k, freq: f, duration: 0.18, type: "sine", vol: 0.11, at: 0.80 + i * 0.09 });
    });
    // Sustained warm pad under the whole thing.
    blip({ key: k, freq: 261, duration: 2.1, type: "triangle", vol: 0.06, at: 0.0 });
    blip({ key: k, freq: 392, duration: 2.1, type: "triangle", vol: 0.06, at: 0.12 });
    // Final resolving bell — lands after the arpeggio peaks.
    blip({ key: k, freq: 523, duration: 0.9, type: "sine", vol: 0.14, attack: 0.003, release: 0.55, at: 1.25 });
    blip({ key: k, freq: 784, duration: 0.8, type: "sine", vol: 0.09, attack: 0.003, release: 0.55, at: 1.25 });
  }

  function playCrunchCascade(scale = 1.0) {
    // Short gulp — single invocation; we call this per fish in the cascade
    // with slight pitch variation.
    const base = 260 + (Math.random() * 80 - 40);
    noiseBurst({ duration: 0.08, vol: 0.1 * scale, filterFreq: 900, filterSlide: 250 });
    blip({ freq: base, slideTo: base / 2, duration: 0.18, type: "triangle", vol: 0.13 * scale });
  }

  // ---------- Rendering ----------

  // V10: "unlocked" now means "owned" (bought in shop or free-basic).
  function isRodUnlocked(rod) {
    return !!prog.unlocks[rod.id];
  }

  function rodUnlockProgress(rod) {
    if (!rod.unlock) return null;
    const u = rod.unlock;
    const need = [];
    if (u.totalCatches != null) need.push({ current: prog.totals.all, target: u.totalCatches, noun: "fish" });
    if (u.rareCatches != null) need.push({ current: prog.totals.rare, target: u.rareCatches, noun: "rares" });
    if (u.legendaryCatches != null) need.push({ current: prog.totals.legendary, target: u.legendaryCatches, noun: "legendaries" });
    if (u.mythicCatches != null) need.push({ current: prog.totals.mythic || 0, target: u.mythicCatches, noun: "mythics" });
    const ratio = Math.min(1, need.reduce((s, n) => s + Math.min(1, n.current / n.target), 0) / need.length);
    return { need, ratio, label: u.label };
  }

  function renderRods() {
    $rods.innerHTML = "";
    for (const rod of RODS) {
      const unlocked = isRodUnlocked(rod);
      const btn = document.createElement("button");
      btn.className = "rod" +
        (rod.id === state.selectedRodId ? " selected" : "") +
        (unlocked ? "" : " locked");
      btn.type = "button";
      btn.dataset.rodId = rod.id;
      btn.disabled = !unlocked;

      // V10: unowned rods just nudge toward the shop; milestone still shown.
      let line;
      if (unlocked) {
        line = `${rod.desc} <em>(${rod.luck.toFixed(1)}× luck)</em>`;
      } else if (rod.unlock && !rodMilestoneMet(rod)) {
        const p = rodUnlockProgress(rod);
        line = `🔒 ${p.label} · ` + p.need
          .map(n => `${Math.min(n.current, n.target)}/${n.target} ${n.noun}`)
          .join(", ");
      } else {
        line = `🏪 Buy in shop · 🫧 ${rod.price}`;
      }

      btn.innerHTML = `
        <span class="rod-emoji">${rodArt(rod)}</span>
        <span class="rod-body">
          <span class="rod-name">${rod.name}</span>
          <span class="rod-desc">${line}</span>
        </span>
      `;
      if (unlocked) {
        btn.addEventListener("click", () => {
          state.selectedRodId = rod.id;
          prog.selectedRod = rod.id;
          saveProgression();
          renderRods();
          closeTackleBag();
        });
      }
      $rods.appendChild(btn);
    }
    renderTackleBagChip();
  }

  function renderTackleBagChip() {
    if (!$tackleBagRod) return;
    const rod = RODS.find(r => r.id === state.selectedRodId) || RODS[0];
    $tackleBagRod.innerHTML = `${rodArt(rod)}<span class="tackle-bag-name">${rod.name}</span>`;
  }

  // See makeModal() below — tackle bag / album / shop / achievements / settings
  // all share the same show/hide logic plus per-modal on-open hooks.

  // V10: catch cards now expose BOTH a sell and eat action, plus drag-to-commit.
  // Drag the card left → sells (pearls, no buff). Drag right → eats (buff, no
  // pearls). Tap either button does the same. The buttons keep us toddler-safe;
  // the swipe adds speed for older kids.
  function renderCatches() {
    const entries = [...state.inventory.entries()].filter(([, n]) => n > 0);
    // V11: bulk actions always stay mounted — toggling their visibility
    // shifted the layout every time the inventory went in/out of empty,
    // which was jarring. Now they dim when there's nothing to act on.
    $bulkActions.classList.toggle("empty", entries.length === 0);
    if (entries.length === 0) {
      $catches.innerHTML = `<div class="empty-catches">No catches yet — give it a cast!</div>`;
      return;
    }
    const rarityOrder = { mythic: -1, legendary: 0, rare: 1, uncommon: 2, common: 3 };
    entries.sort((a, b) => {
      const pa = parseInvKey(a[0]);
      const pb = parseInvKey(b[0]);
      // Junk sinks to the bottom of the list — separate visual group.
      if (pa.isJunk !== pb.isJunk) return pa.isJunk ? 1 : -1;
      if (pa.isJunk && pb.isJunk) {
        return (junkById(pa.junkId)?.name || "").localeCompare(junkById(pb.junkId)?.name || "");
      }
      const fa = FISH.find(f => f.id === pa.fishId);
      const fb = FISH.find(f => f.id === pb.fishId);
      if (pa.isShiny !== pb.isShiny) return pa.isShiny ? -1 : 1;
      return (rarityOrder[fa.rarity] - rarityOrder[fb.rarity]) || fa.name.localeCompare(fb.name);
    });

    $catches.innerHTML = "";
    for (const [key, count] of entries) {
      const parsed = parseInvKey(key);
      if (parsed.isJunk) {
        const junk = junkById(parsed.junkId);
        if (!junk) continue;
        const entry = document.createElement("div");
        entry.className = "catch-entry is-junk";
        entry.dataset.entryKey = key;
        entry.innerHTML = `
          <div class="catch-card">
            <div class="catch-bar rarity-junk"></div>
            <div class="catch-emoji junk-emoji">${junk.emoji}</div>
            <div class="catch-info">
              <span class="catch-name">${junk.name}</span>
              <span class="catch-count">Junk · x${count}</span>
            </div>
            <div class="catch-actions">
              <button class="catch-btn toss-btn" data-key="${key}" aria-label="Toss ${junk.name}">
                <span class="catch-btn-icon">🗑️</span><span class="catch-btn-val">Toss</span>
              </button>
            </div>
          </div>
        `;
        entry.querySelector(".toss-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          discardJunk(parsed.junkId);
        });
        $catches.appendChild(entry);
        continue;
      }
      const { fishId, isShiny, mutationId } = parsed;
      const fish = FISH.find(f => f.id === fishId);
      const sellValue = pearlsForCatch(fish, isShiny, mutationId);
      const mutation = mutationId ? mutationById(mutationId) : null;
      const entry = document.createElement("div");
      const mutClass = mutation ? ` is-mutation mut-${mutation.id}` : "";
      entry.className = "catch-entry" + (isShiny ? " is-shiny" : "") + mutClass;
      entry.dataset.entryKey = key;
      const starPrefix = isShiny ? '<span class="catch-star">✨</span> ' : "";
      const mutPrefix = mutation ? `<span class="catch-mut-icon" title="${mutation.adj}">${mutation.icon}</span> ` : "";
      const adjParts = [];
      if (isShiny) adjParts.push("Shiny");
      if (mutation) adjParts.push(mutation.adj);
      const nameLabel = `${starPrefix}${mutPrefix}${adjParts.join(" ")}${adjParts.length ? " " : ""}${fish.name}`;
      const countLabel = mutation
        ? `${TIER_LABEL[fish.rarity]} · ${mutation.adj} · x${count}`
        : `${TIER_LABEL[fish.rarity]} · x${count}`;
      entry.innerHTML = `
        <span class="catch-swipe-hint sell">🫧 Sell</span>
        <span class="catch-swipe-hint eat">🍽️ Eat</span>
        <div class="catch-card">
          <div class="catch-bar rarity-${fish.rarity}"></div>
          <div class="catch-emoji ${isShiny ? "shiny" : ""} ${mutation ? "mutation" : ""}">${fishArt(fish, { isShiny })}</div>
          <div class="catch-info">
            <span class="catch-name">${nameLabel}</span>
            <span class="catch-count">${countLabel}</span>
          </div>
          <div class="catch-actions">
            <button class="catch-btn sell-btn" data-key="${key}" aria-label="Sell for ${sellValue} pearls">
              <span class="catch-btn-icon">🫧</span><span class="catch-btn-val">${sellValue.toLocaleString()}</span>
            </button>
            <button class="catch-btn eat-btn" data-key="${key}" aria-label="Eat for tier buff">
              🍽️ Eat
            </button>
          </div>
        </div>
      `;
      const card = entry.querySelector(".catch-card");
      entry.querySelector(".sell-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        sellFish(fishId, isShiny, mutationId);
      });
      entry.querySelector(".eat-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        eatFish(fishId, isShiny, mutationId);
      });
      attachCatchSwipe(entry, card, fishId, isShiny, mutationId);
      $catches.appendChild(entry);
    }

  }

  // Drag-to-commit on a catch card. Past the threshold either way, commit the
  // action on release. Snap back if short. Buttons inside the card still fire
  // their own click — we just skip drag-tracking when the pointerdown started
  // on a button.
  const SWIPE_COMMIT_RATIO = 0.45; // fraction of card width
  function attachCatchSwipe(entry, card, fishId, isShiny, mutationId = null) {
    let startX = 0, dx = 0, dragging = false, committed = false;
    let pointerId = null;
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return; // let button click handle it
      dragging = true;
      committed = false;
      startX = e.clientX;
      dx = 0;
      pointerId = e.pointerId;
      try { card.setPointerCapture(pointerId); } catch {}
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      card.style.transform = `translateX(${dx}px)`;
      const width = card.offsetWidth || 240;
      const ratio = Math.min(1, Math.abs(dx) / width);
      entry.classList.toggle("swiping-sell", dx < -12);
      entry.classList.toggle("swiping-eat",  dx > 12);
      entry.style.setProperty("--swipe-progress", ratio.toFixed(3));
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      try { card.releasePointerCapture(pointerId); } catch {}
      const width = card.offsetWidth || 240;
      const threshold = width * SWIPE_COMMIT_RATIO;
      if (!committed && dx <= -threshold) {
        committed = true;
        sellFish(fishId, isShiny, mutationId);
      } else if (!committed && dx >= threshold) {
        committed = true;
        eatFish(fishId, isShiny, mutationId);
      } else {
        // Snap back
        card.style.transition = "transform 180ms cubic-bezier(.3,1.5,.5,1)";
        card.style.transform = "translateX(0)";
        setTimeout(() => { card.style.transition = ""; }, 200);
      }
      card.classList.remove("dragging");
      entry.classList.remove("swiping-sell", "swiping-eat");
      entry.style.setProperty("--swipe-progress", "0");
      dx = 0;
    };
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);
  }

  function fishStyle(fish) {
    if (!fish.hue) return "";
    return `filter: hue-rotate(${fish.hue}deg) saturate(1.1);`;
  }

  // Map of buff type -> { pill: HTMLElement, timeEl, buffRef }
  const buffPills = new Map();

  function ensureBuffPill(buff) {
    let entry = buffPills.get(buff.type);
    if (entry && entry.buffRef === buff) return entry;
    // New or replaced buff — create a fresh pill.
    if (entry) entry.pill.remove();
    const pill = document.createElement("div");
    pill.className = `buff-pill rarity-${buff.rarity}`;
    pill.innerHTML = `
      <span class="pill-emoji">${buff.sourceEmoji}</span>
      <span class="pill-label">${buff.label}</span>
      <span class="pill-time">${buff.duration || Math.ceil(buff.totalMs / 1000)}s</span>
    `;
    $buffRow.appendChild(pill);
    playBuffAppear(buff.rarity);
    entry = { pill, timeEl: pill.querySelector(".pill-time"), buffRef: buff };
    buffPills.set(buff.type, entry);
    return entry;
  }

  function updateBuffPills() {
    const now = performance.now();
    // Ensure a pill per active buff, update fill + countdown text.
    for (const buff of state.buffs.values()) {
      const entry = ensureBuffPill(buff);
      const remaining = Math.max(0, buff.endsAt - now);
      entry.pill.style.setProperty("--fill", (remaining / buff.totalMs).toFixed(3));
      const secs = Math.ceil(remaining / 1000);
      if (entry.timeEl.textContent !== `${secs}s`) entry.timeEl.textContent = `${secs}s`;
    }
    updateAutoReelPill(now);
    // Drop pills for buffs no longer active.
    for (const [type, entry] of [...buffPills.entries()]) {
      if (!state.buffs.has(type) || state.buffs.get(type) !== entry.buffRef) {
        entry.pill.remove();
        buffPills.delete(type);
      }
    }
  }

  // ---------- Shiny auto-reel ----------
  // Eating a shiny kicks off 20s of auto-casting. Stacks refresh the timer back
  // to a full 20s (simpler + a little more generous than additive). The pill
  // lives in the buff row alongside normal buffs so the UI stays cohesive.
  const AUTO_REEL_MS = 20000;
  const AUTO_REEL_GAP_MS = 450;
  let autoReelPill = null;

  function isAutoReelActive() {
    return !!(state.autoReel && state.autoReel.endsAt > performance.now());
  }

  function startAutoReel() {
    state.autoReel = {
      endsAt: performance.now() + AUTO_REEL_MS,
      totalMs: AUTO_REEL_MS,
    };
    playAutoReelStart();
    updateBuffPills();
    scheduleNextAutoCast();
  }

  function scheduleNextAutoCast() {
    if (!isAutoReelActive() || state.casting) return;
    setTimeout(() => {
      if (!isAutoReelActive() || state.casting) return;
      cast();
    }, AUTO_REEL_GAP_MS);
  }

  function updateAutoReelPill(now) {
    const ar = state.autoReel;
    if (!ar || ar.endsAt <= now) {
      if (autoReelPill) { autoReelPill.remove(); autoReelPill = null; }
      if (ar) state.autoReel = null;
      return;
    }
    if (!autoReelPill) {
      autoReelPill = document.createElement("div");
      autoReelPill.className = "buff-pill autoreel-pill";
      autoReelPill.innerHTML = `
        <span class="pill-emoji">🎣</span>
        <span class="pill-label">Auto-reel</span>
        <span class="pill-time"></span>
      `;
      $buffRow.appendChild(autoReelPill);
    }
    const remaining = Math.max(0, ar.endsAt - now);
    autoReelPill.style.setProperty("--fill", (remaining / ar.totalMs).toFixed(3));
    const secs = Math.ceil(remaining / 1000);
    const timeEl = autoReelPill.querySelector(".pill-time");
    if (timeEl.textContent !== `${secs}s`) timeEl.textContent = `${secs}s`;
  }

  // ---------- Game logic ----------

  function undiscoveredSpecies() {
    return FISH.filter(f => !prog.discovered[f.id]);
  }

  function pickFish({ forceUndiscovered = false } = {}) {
    if (forceUndiscovered) {
      const pool = undiscoveredSpecies();
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }

    const rod = RODS.find(r => r.id === state.selectedRodId);
    const luckBuff = state.buffs.get("luck");
    const luckMult = rod.luck * (luckBuff ? (1 + luckBuff.value) : 1);

    // Build weights for each fish. Each fish in a tier carries that tier's full weight
    // unless a per-fish `weight` override pins it (e.g. a single "rarest in pond" fish).
    // Luck multiplier applies to rare + legendary + mythic (the "lucky" tiers).
    const weighted = FISH.map(f => {
      let w = f.weight != null ? f.weight : TIER_WEIGHT[f.rarity];
      if (f.rarity === "rare" || f.rarity === "legendary" || f.rarity === "mythic") w *= luckMult;
      return { fish: f, w };
    });
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const { fish, w } of weighted) {
      r -= w;
      if (r <= 0) return fish;
    }
    return weighted[weighted.length - 1].fish; // fallback (floating-point tail)
  }

  // V12: inventory keys now support an optional `mut-<mutationId>` suffix.
  // Shape: `fishId` | `fishId:shiny` | `fishId:mut-electric` | `fishId:shiny:mut-electric`.
  function invKey(fishId, isShiny, mutationId = null) {
    let k = isShiny ? `${fishId}:shiny` : fishId;
    if (mutationId) k += `:mut-${mutationId}`;
    return k;
  }
  function junkInvKey(junkId) { return `junk:${junkId}`; }
  function parseInvKey(key) {
    const parts = key.split(":");
    if (parts[0] === "junk") {
      return { isJunk: true, junkId: parts[1], fishId: null, isShiny: false, mutationId: null };
    }
    const fishId = parts[0];
    let isShiny = false;
    let mutationId = null;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === "shiny") isShiny = true;
      else if (parts[i].startsWith("mut-")) mutationId = parts[i].slice(4);
    }
    return { isJunk: false, fishId, isShiny, mutationId, junkId: null };
  }

  function addFish(fishId, isShiny, count = 1, mutationId = null) {
    const key = invKey(fishId, isShiny, mutationId);
    state.inventory.set(key, (state.inventory.get(key) || 0) + count);
  }
  function addJunk(junkId, count = 1) {
    const key = junkInvKey(junkId);
    state.inventory.set(key, (state.inventory.get(key) || 0) + count);
  }

  function getCastDuration() {
    const speed = state.buffs.get("speed");
    const mult = speed ? (1 - speed.value) : 1;
    return CAST_BEAT_MS * mult;
  }

  function cast() {
    if (state.casting) return;
    state.casting = true;
    $castBtn.disabled = true;

    sessionCasts += 1;
    track("cast", {
      rod_id: state.selectedRodId,
      session_casts_count: sessionCasts,
    });

    playCast();
    $pond.classList.add("casting");
    $castIndicator.classList.add("hidden");

    // V5: enhanced multi-ring cast ripple.
    spawnCastRipples();

    const duration = getCastDuration();
    $pond.style.animationDuration = `${duration}ms`;

    // V5 slot-reel fix — PRE-PICK the winning fish + shiny flag here, so the
    // reel can visibly land on the actual winner. resolveCatch consumes these.
    const isGift = state.pendingDailyGift && undiscoveredSpecies().length > 0;
    // V12: 10% of casts reel up junk — but never on a daily-gift cast (that'd
    // feel punishing), and never when a test hook is forcing a rarity/shiny.
    const forcing = window.__forceRarity || window.__forceShiny;
    const isJunk = !isGift && !forcing && Math.random() < JUNK_CHANCE;
    let winner;
    if (isJunk) {
      winner = pickJunk();
    } else {
      winner = pickFish({ forceUndiscovered: isGift });
      // Dev/test hook: force the next catch to a specific rarity (e.g. "mythic").
      // Normal play never sets window.__forceRarity.
      if (window.__forceRarity) {
        const pool = FISH.filter(f => f.rarity === window.__forceRarity);
        if (pool.length) winner = pool[Math.floor(Math.random() * pool.length)];
        window.__forceRarity = null;
      }
    }
    const isShiny = !isJunk && (window.__forceShiny === true || Math.random() < (1 / SHINY_DENOM));
    if (window.__forceShiny) window.__forceShiny = false;
    // V12: if an event is active, roll 10% for a mutation on a fish catch.
    // Junk + gift casts bypass this. Force-mutation dev hook for testing.
    let mutationId = null;
    if (!isJunk && state.activeEvent) {
      const rollMut = window.__forceMutation === true || Math.random() < MUTATION_CHANCE_IN_EVENT;
      if (rollMut) {
        const ev = eventById(state.activeEvent.id);
        if (ev) mutationId = ev.mutationId;
      }
      if (window.__forceMutation) window.__forceMutation = false;
    }
    state.pendingCatch = { fish: winner, isShiny, isGift, isJunk, mutationId };
    // Roll for a new event at the tail of cast — only when none is running
    // and we didn't just pick a junk/gift catch (don't stack specialness).
    if (!state.activeEvent && !isJunk && !isGift) maybeStartEvent();

    // V4: slot-machine reel during the suspense beat — now lands on `winner`.
    startCastReel(duration, winner);

    setTimeout(() => {
      // Brief landing pause so the winner is visibly centered before the reel
      // hides and the catch notification takes over. Junk has no rarity — tint
      // the reel neutral so it visually reads as "meh" before the notif.
      flashReelRarity(isJunk ? "junk" : winner.rarity);
      setTimeout(() => {
        stopCastReel();
        resolveCatch();
        state.casting = false;
        $pond.classList.remove("casting");
        $pond.style.animationDuration = "";
        // V12: if a shiny was caught, hold the cast button disabled for the
        // duration of the celebration so the kid can't tap through it.
        releaseCastButton();
        if (isAutoReelActive()) scheduleNextAutoCast();
      }, 260);
    }, duration);
  }

  function releaseCastButton() {
    const now = Date.now();
    if (state.shinyLockUntil && now < state.shinyLockUntil) {
      const remaining = state.shinyLockUntil - now;
      $castBtn.classList.add("shiny-lock");
      setTimeout(() => {
        state.shinyLockUntil = 0;
        $castBtn.disabled = false;
        $castBtn.classList.remove("shiny-lock");
      }, remaining);
    } else {
      $castBtn.disabled = false;
    }
  }

  // V4 cast reel — fast scroll → deceleration → land, now winner-aware (V5).
  function startCastReel(duration, winner) {
    // Commons & uncommons dominate the strip; rares/legendaries peek through
    // as ghost rows like a real slot machine. The winner sits at a fixed
    // near-end index so the easing deceleration lands on it.
    const weighted = FISH.flatMap(f => {
      const reps = ({ common: 5, uncommon: 4, rare: 2, legendary: 1, mythic: 1 })[f.rarity] || 1;
      return Array.from({ length: reps }, () => f);
    });
    const rows = [];
    const totalRows = 40;
    const winnerIdx = totalRows - 3; // last couple of rows are padding below winner
    for (let i = 0; i < totalRows; i++) {
      if (i === winnerIdx) {
        rows.push({ fish: winner, ghost: false, winner: true });
      } else {
        const fish = weighted[Math.floor(Math.random() * weighted.length)];
        const isNearMiss = fish.rarity === "rare" || fish.rarity === "legendary";
        rows.push({ fish, ghost: isNearMiss || Math.random() < 0.25, winner: false });
      }
    }
    $castReelStrip.innerHTML = "";
    for (const { fish, ghost, winner: isWinner } of rows) {
      const row = document.createElement("div");
      row.className = "cast-reel-row" + (ghost ? " ghost" : "") + (isWinner ? " winner" : "");
      row.innerHTML = fishArt(fish, { cls: "reel" });
      $castReelStrip.appendChild(row);
    }
    $castReel.className = "cast-reel";
    $castReel.classList.remove("hidden");
    // Position the strip at translateY(0) with no transition.
    $castReelStrip.style.transition = "none";
    $castReelStrip.style.transform = "translateY(0)";
    void $castReelStrip.offsetWidth;

    // Double rAF so layout has settled, then measure relative to the strip's
    // offsetParent (the window element) rather than viewport rects — more
    // reliable when surrounding layout is still animating.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const winnerEl = $castReelStrip.querySelector(".cast-reel-row.winner");
      const windowEl = $castReel.querySelector(".cast-reel-window");
      if (!winnerEl || !windowEl) return;
      const winnerCenterInStrip = winnerEl.offsetTop + winnerEl.offsetHeight / 2;
      const windowHeight = windowEl.clientHeight;
      const targetTranslate = -(winnerCenterInStrip - windowHeight / 2);
      $castReelStrip.style.transition = `transform ${duration}ms cubic-bezier(.14, .72, .22, 1)`;
      $castReelStrip.style.transform = `translateY(${targetTranslate}px)`;
    }));
  }

  function stopCastReel() {
    $castReel.classList.add("hidden");
    $castReel.classList.remove("landing", "rarity-common", "rarity-uncommon", "rarity-rare", "rarity-legendary", "rarity-mythic", "rarity-junk");
  }

  // V4 — paint the reel with a rarity tint right before it stops, so the color
  // of the window telegraphs the rarity for the last 200ms. Called from
  // resolveCatch, but only once the fish is known.
  function flashReelRarity(rarity) {
    $castReel.classList.add("landing", `rarity-${rarity}`);
  }

  function resolveCatch() {
    // V5: consume pre-picked catch from cast() so the reel actually lands on
    // the fish we're crediting. Fallback path only fires if cast() was skipped
    // (shouldn't happen in normal flow).
    let fish, isShiny, isGift, isJunk, mutationId;
    if (state.pendingCatch) {
      ({ fish, isShiny, isGift, isJunk, mutationId } = state.pendingCatch);
      state.pendingCatch = null;
    } else {
      isGift = state.pendingDailyGift && undiscoveredSpecies().length > 0;
      fish = pickFish({ forceUndiscovered: isGift });
      isShiny = Math.random() < (1 / SHINY_DENOM);
      isJunk = false;
      mutationId = null;
    }
    if (isGift) {
      state.pendingDailyGift = false;
      prog.lastGiftDate = todayKey();
    }

    // V12: junk short-circuits the fish pipeline — no album, no buff, no
    // celebration, no milestones. Just a low-key notif and an entry in the bag.
    if (isJunk) {
      addJunk(fish.id, 1);
      playJunkSound();
      showJunkNotification(fish);
      renderCatches();
      saveProgression();
      return;
    }

    const isFirstCatch = !prog.discovered[fish.id];
    const isFirstShiny = isShiny && !prog.shinyDiscovered[fish.id];
    // V12: mutations stack with shiny. A "shiny electric salmon" is its own
    // flex. We still run the shiny celebration on top but add a mutation notif.
    const isFirstMutation = mutationId && !prog.mutationsDiscovered[`${fish.id}:${mutationId}`];

    recordCatch(fish, isShiny, mutationId);

    // Audio + celebration: shiny trumps everything else; mythic trumps legendary.
    if (isShiny) {
      // V12: fanfare (bigger sound), full sequence (longer visuals + banner),
      // notification card, and lock the cast button for the celebration window.
      state.shinyLockUntil = Date.now() + SHINY_CELEBRATION_MS;
      playShinyFanfare();
      showShinySequence(fish, { isFirstShiny });
      showShinyCelebration(fish, { isFirstShiny });
    } else if (fish.rarity === "mythic") {
      playMythicSequence(fish, { isFirstCatch, isGift });
    } else if (fish.rarity === "legendary") {
      // V4 full treatment — hit-stop + screen shake + LEGENDARY banner + confetti waves.
      playLegendarySequence(fish, { isFirstCatch, isGift });
    } else if (mutationId) {
      // Mutation on a non-shiny, non-legendary catch — a distinct moment that
      // still feels rewarding. Play a brighter catch sound + sparkle burst.
      playCatchSound(fish.rarity);
      showMutationCatchNotification(fish, mutationId, { isFirstMutation });
      burstCelebration({ emoji: MUTATIONS[mutationId].icon, hue: 0 }, { count: 14, distMin: 160, distMax: 320 });
    } else if (isFirstCatch) {
      playCatchSound(fish.rarity === "common" ? "common" : fish.rarity); // uses the matching MP3
      showFirstCatchCelebration(fish, { fromGift: isGift });
      burstCelebration(fish);
    } else {
      playCatchSound(fish.rarity);
      showCatchNotification(fish, { fromGift: isGift });
    }

    // If we landed a mutation on top of a legendary/mythic, still show the
    // mutation notif so the kid sees the extra value.
    if (mutationId && (fish.rarity === "legendary" || fish.rarity === "mythic" || isShiny)) {
      setTimeout(() => showMutationCatchNotification(fish, mutationId, { isFirstMutation }), 400);
    }

    // Double Catch roll (independent, after the primary catch is committed).
    // Shiny/mutation flags carry to the duplicate — same caught fish.
    const dc = state.buffs.get("double");
    if (dc && Math.random() < dc.value) {
      addFish(fish.id, isShiny, 1, mutationId);
      recordCatchCount(fish, isShiny, mutationId);
      showDoubleCatchNotification(fish);
    }

    checkMilestones(fish, isShiny);
    addFish(fish.id, isShiny, 1, mutationId);
    renderCatches();
    renderNextGoal();
    renderRods();
    if (state.albumOpen) renderAlbum();
    if (state.achievementsOpen) renderAchievements();
    saveProgression();
  }

  function recordCatch(fish, isShiny, mutationId = null) {
    if (!prog.discovered[fish.id]) prog.discovered[fish.id] = Date.now();
    if (isShiny && !prog.shinyDiscovered[fish.id]) prog.shinyDiscovered[fish.id] = Date.now();
    if (mutationId) {
      const mkey = `${fish.id}:${mutationId}`;
      if (!prog.mutationsDiscovered[mkey]) prog.mutationsDiscovered[mkey] = Date.now();
    }
    recordCatchCount(fish, isShiny, mutationId);
  }

  function recordCatchCount(fish, isShiny, mutationId = null) {
    prog.totals.all += 1;
    prog.totals[fish.rarity] = (prog.totals[fish.rarity] || 0) + 1;
    if (isShiny) prog.totals.shinies = (prog.totals.shinies || 0) + 1;
    if (mutationId) prog.mutationsCaught = (prog.mutationsCaught || 0) + 1;
    prog.totals.bySpecies[fish.id] = (prog.totals.bySpecies[fish.id] || 0) + 1;

    sessionCatches += 1;
    sessionSpecies.add(fish.id);
    track("fish_caught", {
      species_id: fish.id,
      species_name: fish.name,
      fish_tier: fish.rarity,
      rod_id: state.selectedRodId,
    });

    // V10: rods are bought in the shop, not auto-unlocked. We just nudge the
    // user when a catch first clears a rod's milestone so they know to check
    // the shop.
    for (const rod of RODS) {
      if (rod.unlock && !prog.rodMilestoneSeen[rod.id] && rodMilestoneMet(rod)) {
        prog.rodMilestoneSeen[rod.id] = true;
        showRodUnlockedForPurchase(rod);
      }
    }
    syncAchievementUnlocks();
  }

  function rodMilestoneMet(rod) {
    if (!rod.unlock) return true;
    const u = rod.unlock;
    return (
      (u.totalCatches == null || prog.totals.all >= u.totalCatches) &&
      (u.rareCatches == null || prog.totals.rare >= u.rareCatches) &&
      (u.legendaryCatches == null || prog.totals.legendary >= u.legendaryCatches) &&
      (u.mythicCatches == null || (prog.totals.mythic || 0) >= u.mythicCatches)
    );
  }

  function checkMilestones(fish, isShiny) {
    // V6: headline/"catastrophic-good" milestones are dismiss-on-tap banners;
    // smaller milestones use the big-event hold.
    if (fish.rarity === "legendary" && !prog.milestonesSeen.firstLegendary) {
      prog.milestonesSeen.firstLegendary = true;
      showMilestone("🏆 First Legendary!", `You reeled in a ${fish.name}!`, { banner: true, badge: "firstLegendary", badgeEmoji: "🏆" });
    }
    if (fish.rarity === "mythic" && !prog.milestonesSeen.firstMythic) {
      prog.milestonesSeen.firstMythic = true;
      showMilestone("💠 First Mythic!", `You reeled in a ${fish.name}! Ultra-rare!`, { banner: true, badge: "firstMythic", badgeEmoji: "💠" });
    }
    if (isShiny && !prog.milestonesSeen.firstShiny) {
      prog.milestonesSeen.firstShiny = true;
      showMilestone("✨ First Shiny!", `A shiny ${fish.name} — one in ${SHINY_DENOM.toLocaleString()}!`, { banner: true, badge: "firstShiny", badgeEmoji: "✨" });
    }
    if (!prog.milestonesSeen.albumComplete && FISH.every(f => prog.discovered[f.id])) {
      prog.milestonesSeen.albumComplete = true;
      showMilestone("📖 Album Complete!", "Master Angler! You found every fish!", { banner: true, badge: "albumComplete", badgeEmoji: "📖" });
    }
  }

  function applyTierBuff(fish) {
    const t = TIER_BUFF[fish.rarity];
    const totalMs = t.duration * 1000;
    state.buffs.set(t.type, {
      type: t.type,
      value: t.value,
      endsAt: performance.now() + totalMs,
      totalMs,
      sourceFishId: fish.id,
      sourceEmoji: fish.emoji,
      rarity: fish.rarity,
      label: t.label,
    });
  }

  function pearlsForCatch(fish, isShiny, mutationId = null) {
    const base = PEARLS_PER_TIER[fish.rarity] || 1;
    const starMult = fish.id === getTodaysStarFishId() ? 2 : 1;
    const mutMult = mutationId ? MUTATION_MULT : 1;
    return (isShiny ? base * SHINY_MULT : base) * starMult * mutMult;
  }

  // V8 bonus: one fish per calendar day gets a gentle gold highlight in the
  // album + 2× pearls on eat. Seed is deterministic by date so the kid can
  // "find today's star" each morning. No loud overlays, no extra banner —
  // Codex's guardrail: keep the magic soft, slow, sparse.
  function getTodaysStarFishId() {
    const d = new Date();
    const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    // Simple deterministic hash → index into FISH
    let h = key;
    h = (h ^ (h >>> 13)) * 0x5bd1e995;
    h = h ^ (h >>> 15);
    return FISH[Math.abs(h) % FISH.length].id;
  }

  // V10: eating gives ONLY the tier buff (no pearls). Shiny still triggers the
  // 20-second auto-reel. The strategic flip-side to selling.
  function eatFish(fishId, isShiny, mutationId = null) {
    const key = invKey(fishId, isShiny, mutationId);
    const count = state.inventory.get(key) || 0;
    if (count <= 0) return;
    const fish = FISH.find(f => f.id === fishId);
    state.inventory.set(key, count - 1);

    applyTierBuff(fish);

    playEatSound();
    showEatNotification(fish, TIER_BUFF[fish.rarity], { isShiny });
    renderCatches();
    updateBuffPills();
    if (isShiny) startAutoReel();
    saveProgression();
  }

  // V12: tossing junk just removes it. Zero pearls; the notif is a one-liner.
  function discardJunk(junkId) {
    const key = junkInvKey(junkId);
    const count = state.inventory.get(key) || 0;
    if (count <= 0) return;
    const junk = junkById(junkId);
    state.inventory.set(key, count - 1);
    const n = document.createElement("div");
    n.className = "notif";
    n.innerHTML = `
      <div class="notif-emoji">🗑️</div>
      <div class="notif-text">
        <span class="notif-title">Tossed ${junk.name}</span>
      </div>
    `;
    pushNotif(n, 1200);
    renderCatches();
    saveProgression();
  }

  function showMutationCatchNotification(fish, mutationId, { isFirstMutation = false } = {}) {
    const mutation = mutationById(mutationId);
    if (!mutation) return;
    const n = document.createElement("div");
    n.className = `notif celebrate event-notif mut-${mutation.id}`;
    n.innerHTML = `
      <div class="notif-emoji" style="filter: drop-shadow(0 0 8px ${mutation.glow});">${mutation.icon}${fishArt(fish, { cls: "big" })}</div>
      <div class="notif-text">
        <span class="notif-hat">${mutation.icon} ${isFirstMutation ? "FIRST " : ""}${mutation.adj.toUpperCase()} MUTATION</span>
        <span class="notif-title">${mutation.adj} ${fish.name}!</span>
        <span class="notif-sub">Sells for ${pearlsForCatch(fish, false, mutationId).toLocaleString()} 🫧 (${MUTATION_MULT}× base)</span>
      </div>
    `;
    pushNotif(n, isFirstMutation ? NOTIF_HOLD.big : NOTIF_HOLD.regular);
  }

  function showJunkNotification(junk) {
    const sub = JUNK_FLAVOR[Math.floor(Math.random() * JUNK_FLAVOR.length)];
    const n = document.createElement("div");
    n.className = "notif rarity-junk";
    n.innerHTML = `
      <div class="notif-emoji">${junk.emoji}</div>
      <div class="notif-text">
        <span class="notif-title">${junk.name}</span>
        <span class="notif-sub">${sub}</span>
      </div>
    `;
    pushNotif(n, 1800);
  }

  // V10: selling gives ONLY pearls (no buff, no auto-reel on shiny — just
  // fat pearl payout). The economic path; money for rods + decorations.
  function sellFish(fishId, isShiny, mutationId = null) {
    const key = invKey(fishId, isShiny, mutationId);
    const count = state.inventory.get(key) || 0;
    if (count <= 0) return;
    const fish = FISH.find(f => f.id === fishId);
    state.inventory.set(key, count - 1);

    const gained = pearlsForCatch(fish, isShiny, mutationId);
    const srcEl = document.querySelector(`[data-entry-key="${key}"]`) || $catches;
    grantPearls(gained, { atEl: srcEl });
    playSellSound();
    showSellNotification(fish, { isShiny, pearls: gained });
    renderCatches();
    saveProgression();
  }

  function grantPearls(amount, { atEl } = {}) {
    if (!amount) return;
    prog.pearls += amount;
    renderPearls();
    // Floating "+N 🫧" near the source element (or the pearls counter as fallback).
    const srcRect = atEl ? atEl.getBoundingClientRect() : $pearls.getBoundingClientRect();
    const targetRect = $pearls.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "pearl-pop";
    pop.textContent = `+${amount} 🫧`;
    pop.style.left = `${srcRect.left + srcRect.width / 2 - 24}px`;
    pop.style.top = `${srcRect.top + srcRect.height / 2 - 10}px`;
    pop.style.setProperty("--x", `0px`);
    pop.style.setProperty("--y", `0px`);
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 950);
    syncAchievementUnlocks();
  }

  function renderPearls() {
    $pearls.querySelector(".pearls-count").textContent = prog.pearls.toLocaleString();
    $pearls.classList.remove("popping");
    void $pearls.offsetWidth;
    $pearls.classList.add("popping");
    if (state.shopOpen) renderShop();
    // V10: the "Next rod" goal bar shows pearl progress toward the next
    // unlocked-but-unpaid rod, so it needs to refresh as pearls move.
    renderNextGoal();
  }

  // ---------- Bulk: Eat All / Sell All ----------

  const TIER_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };

  // Shared "fly every fish to a target" effect. Returns the total delay before
  // all particles have finished.
  function flyAllEntriesTo(entries, targetEl, opts = {}) {
    const { sfx = null } = opts;
    const catchesRect = $catches.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    let staggerDelay = 0;
    const perItemDelay = 70;
    for (const [key, count] of entries) {
      const parsed = parseInvKey(key);
      const item = parsed.isJunk
        ? junkById(parsed.junkId)
        : FISH.find(f => f.id === parsed.fishId);
      if (!item) continue;
      const entryEl = document.querySelector(`[data-entry-key="${key}"]`);
      const rect = entryEl ? entryEl.getBoundingClientRect() : catchesRect;
      const startX = rect.left + 50;
      const startY = rect.top + rect.height / 2;
      setTimeout(() => {
        flyingFish(item, parsed.isShiny, startX, startY, targetX, targetY, count);
        if (sfx) sfx(entries.length);
      }, staggerDelay);
      staggerDelay += perItemDelay;
    }
    return staggerDelay + 650;
  }

  function eatAll() {
    if (state.eatingAll) return;
    // V12: junk can't be eaten — exclude it entirely so it stays in the bag.
    const entries = [...state.inventory.entries()]
      .filter(([k, n]) => n > 0 && !parseInvKey(k).isJunk);
    if (entries.length === 0) return;
    state.eatingAll = true;

    // One buff per type; highest-rarity source wins.
    const bestPerType = new Map();
    let ateShiny = false;
    for (const [key] of entries) {
      const { fishId, isShiny } = parseInvKey(key);
      const fish = FISH.find(f => f.id === fishId);
      if (!fish) continue;
      if (isShiny) ateShiny = true;
      const buff = TIER_BUFF[fish.rarity];
      const prev = bestPerType.get(buff.type);
      if (!prev || TIER_ORDER[fish.rarity] > TIER_ORDER[prev.fish.rarity]) {
        bestPerType.set(buff.type, { fish });
      }
    }

    const resolveAt = flyAllEntriesTo(entries, $eatAllBtn, {
      sfx: (n) => playCrunchCascade(n > 3 ? 0.8 : 1.0),
    });

    setTimeout(() => {
      // Stagger buff applications low→high rarity so the climax peaks on best.
      const BUFF_STAGGER_MS = 180;
      const buffList = [...bestPerType.values()]
        .sort((a, b) => TIER_ORDER[a.fish.rarity] - TIER_ORDER[b.fish.rarity]);
      buffList.forEach(({ fish }, i) => {
        setTimeout(() => {
          applyTierBuff(fish);
          updateBuffPills();
        }, i * BUFF_STAGGER_MS);
      });
      // Clear only the eaten fish entries; junk stays behind.
      for (const [key] of entries) state.inventory.delete(key);
      renderCatches();
      if (ateShiny) startAutoReel();
      state.eatingAll = false;
      saveProgression();
    }, resolveAt);

    const types = [...bestPerType.values()].map(b => TIER_BUFF[b.fish.rarity].label).join(" · ");
    const summary = document.createElement("div");
    summary.className = "notif celebrate rarity-legendary";
    summary.innerHTML = `
      <div class="notif-emoji">🍽️</div>
      <div class="notif-text">
        <span class="notif-title">Chomped the lot!</span>
        <span class="notif-sub">${types || "no buffs"}</span>
      </div>
    `;
    pushNotif(summary, 2500);
  }

  function sellAll() {
    if (state.eatingAll) return; // reuse the "bulk in progress" lock
    const entries = [...state.inventory.entries()].filter(([, n]) => n > 0);
    if (entries.length === 0) return;
    state.eatingAll = true;

    let totalPearls = 0;
    for (const [key, count] of entries) {
      const parsed = parseInvKey(key);
      if (parsed.isJunk) continue; // Junk contributes 0 pearls but still gets cleared below.
      const fish = FISH.find(f => f.id === parsed.fishId);
      if (!fish) continue;
      totalPearls += pearlsForCatch(fish, parsed.isShiny, parsed.mutationId) * count;
    }

    const resolveAt = flyAllEntriesTo(entries, $sellAllBtn, {
      sfx: () => playSellSound(),
    });

    setTimeout(() => {
      grantPearls(totalPearls, { atEl: $sellAllBtn });
      state.inventory.clear();
      renderCatches();
      state.eatingAll = false;
      saveProgression();
    }, resolveAt);

    const summary = document.createElement("div");
    summary.className = "notif celebrate rarity-uncommon";
    summary.innerHTML = `
      <div class="notif-emoji">🫧</div>
      <div class="notif-text">
        <span class="notif-title">Sold the lot!</span>
        <span class="notif-sub">+${totalPearls.toLocaleString()} 🫧</span>
      </div>
    `;
    pushNotif(summary, 2500);
  }

  function flyingFish(fish, isShiny, sx, sy, tx, ty, count) {
    const f = document.createElement("div");
    f.className = "flying-fish" + (isShiny ? " shiny" : "");
    f.textContent = fish.emoji + (count > 1 ? ` ×${count}` : "");
    f.style.left = `${sx}px`;
    f.style.top = `${sy}px`;
    if (fish.hue) f.style.filter = (f.style.filter || "") + ` hue-rotate(${fish.hue}deg) saturate(1.1)`;
    document.body.appendChild(f);

    const duration = 520 + Math.random() * 180;
    // Curve via intermediate keyframes using web-animations API
    const dx = tx - sx, dy = ty - sy;
    const midX = sx + dx * 0.55 + (Math.random() - 0.5) * 80;
    const midY = sy + dy * 0.45 - 80 - Math.random() * 40;

    const anim = f.animate([
      { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${midX - sx}px, ${midY - sy}px) scale(1.15) rotate(-20deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(40deg)`, opacity: 0.2 },
    ], { duration, easing: "cubic-bezier(.3, .6, .7, 1)", fill: "forwards" });
    anim.onfinish = () => f.remove();
  }

  // ---------- Notifications ----------

  // V6 notification tiers (per dad pacing feedback):
  //   regular (NOTIF_HOLD.regular)     = 2000ms — routine catches, eating, double catches.
  //   big     (NOTIF_HOLD.big)         = 5000ms — first-catch of a species, rod unlocks,
  //                                               "nice milestone" moments.
  //   banner  (NOTIF_HOLD.banner)      = dismiss-on-tap, never auto-fades — reserved for
  //                                               first shiny, first legendary, album complete.
  //                                               (Exposed as holdMs: Infinity; a close button
  //                                               + auto-dismiss on any click clear it.)
  const NOTIF_HOLD = { regular: 2000, big: 5000, banner: Infinity };

  function pushNotif(node, holdMs = NOTIF_HOLD.regular) {
    $notifs.appendChild(node);
    if (holdMs === Infinity) {
      // Banner-style: tap anywhere on the notif to dismiss.
      node.classList.add("banner");
      const close = document.createElement("button");
      close.className = "notif-close";
      close.setAttribute("aria-label", "Dismiss");
      close.textContent = "✕";
      node.appendChild(close);
      const dismiss = () => {
        if (node.classList.contains("leaving")) return;
        node.classList.add("leaving");
        setTimeout(() => node.remove(), 300);
      };
      node.addEventListener("click", dismiss);
      // Safety timeout — even banners auto-dismiss after 30s so the screen
      // doesn't accumulate stale toast cards in long sessions.
      setTimeout(dismiss, 30000);
      return;
    }
    setTimeout(() => {
      node.classList.add("leaving");
      setTimeout(() => node.remove(), 300);
    }, holdMs);
  }

  function showCatchNotification(fish, { fromGift = false } = {}) {
    const n = document.createElement("div");
    const isStar = fish.id === getTodaysStarFishId();
    n.className = `notif rarity-${fish.rarity}`
      + (fish.rarity === "legendary" ? " celebrate" : "")
      + (isStar ? " todays-star" : "");
    const title = fromGift
      ? `🎁 Daily gift: ${fish.name}!`
      : `You caught a ${TIER_LABEL[fish.rarity].toLowerCase()} fish!`;
    const subBase = fromGift ? TIER_LABEL[fish.rarity] : fish.name;
    const sub = isStar ? `${subBase} · 🌟 Today's Star! 2× pearls` : subBase;
    n.innerHTML = `
      <div class="notif-emoji">${fishArt(fish)}</div>
      <div class="notif-text">
        <span class="notif-title">${title}</span>
        <span class="notif-sub">${sub}</span>
      </div>
    `;
    // V6: daily-gift pop is a "big event" (first-cast-of-the-day moment); all
    // other routine catches stay at the regular 2s tempo.
    pushNotif(n, fromGift ? NOTIF_HOLD.big : NOTIF_HOLD.regular);
  }

  function showFirstCatchCelebration(fish, { fromGift = false } = {}) {
    const n = document.createElement("div");
    n.className = `notif big rarity-${fish.rarity} celebrate`;
    const hat = fromGift ? "🎁 Daily gift · New discovery!" : "✨ New discovery!";
    n.innerHTML = `
      <div class="notif-emoji big">${fishArt(fish, { cls: "big" })}</div>
      <div class="notif-text">
        <span class="notif-hat">${hat}</span>
        <span class="notif-title big">${fish.name}</span>
        <span class="notif-sub">${TIER_LABEL[fish.rarity]} · Added to your Album!</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.big); // V6: first-catch is a "big event"
  }

  // V10: two flavors of rod notification. First-time milestone nudges players
  // toward the shop; actual purchase celebrates.
  function showRodUnlockedForPurchase(rod) {
    const n = document.createElement("div");
    n.className = "notif celebrate rarity-rare";
    n.innerHTML = `
      <div class="notif-emoji">${rodArt(rod)}</div>
      <div class="notif-text">
        <span class="notif-hat">🏪 New in the shop!</span>
        <span class="notif-title">${rod.name}</span>
        <span class="notif-sub">Unlocked — buy for 🫧 ${rod.price.toLocaleString()}</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.big);
  }

  function showRodPurchase(rod) {
    const n = document.createElement("div");
    n.className = "notif celebrate rarity-legendary";
    n.innerHTML = `
      <div class="notif-emoji">${rodArt(rod)}</div>
      <div class="notif-text">
        <span class="notif-hat">🎣 New rod!</span>
        <span class="notif-title">${rod.name}</span>
        <span class="notif-sub">${rod.desc}</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.big);
  }

  // V6: milestones can be routine ("pond master! you placed every decoration")
  // or headline ("first shiny!", "album complete!"). The caller passes
  // `{ banner: true }` for headline moments to get the dismiss-on-tap card.
  function showMilestone(title, sub, { banner = false, badge = null, badgeEmoji = "🏆" } = {}) {
    const n = document.createElement("div");
    n.className = "notif big celebrate rarity-legendary";
    const badgeHTML = badge
      ? badgeArt(badge, badgeEmoji, { cls: "big" })
      : `<span class="art-fallback big">${badgeEmoji}</span>`;
    n.innerHTML = `
      <div class="notif-emoji big">${badgeHTML}</div>
      <div class="notif-text">
        <span class="notif-title big">${title}</span>
        <span class="notif-sub">${sub}</span>
      </div>
    `;
    pushNotif(n, banner ? NOTIF_HOLD.banner : NOTIF_HOLD.big);
    // Bigger particle burst for milestones.
    const fakeFish = { emoji: "🎉", hue: 0 };
    burstCelebration(fakeFish);
  }

  function showDoubleCatchNotification(fish) {
    const n = document.createElement("div");
    n.className = `notif rarity-${fish.rarity} celebrate`;
    n.innerHTML = `
      <div class="notif-emoji">✨</div>
      <div class="notif-text">
        <span class="notif-title">Double Catch!</span>
        <span class="notif-sub">Extra ${fish.name} landed!</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.regular); // routine bonus
  }

  function showEatNotification(fish, buffTemplate, { isShiny = false } = {}) {
    const n = document.createElement("div");
    n.className = `notif rarity-${fish.rarity}` + (isShiny ? " celebrate" : "");
    const emojiCls = isShiny ? "shiny" : "";
    const title = isShiny ? `Yum! Shiny ${fish.name} ✨` : `Yum! ${fish.name}`;
    const sub = `${buffTemplate.label} for ${buffTemplate.duration}s`;
    n.innerHTML = `
      <div class="notif-emoji ${emojiCls}">${fishArt(fish, { cls: emojiCls, isShiny })}</div>
      <div class="notif-text">
        <span class="notif-title">${title}</span>
        <span class="notif-sub">${sub}</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.regular);
  }

  function showSellNotification(fish, { isShiny = false, pearls = 0 } = {}) {
    const n = document.createElement("div");
    n.className = `notif rarity-${fish.rarity}` + (isShiny ? " celebrate" : "");
    const emojiCls = isShiny ? "shiny" : "";
    const title = isShiny ? `Sold a Shiny ${fish.name} ✨` : `Sold ${fish.name}`;
    const sub = `+${pearls.toLocaleString()} 🫧`;
    n.innerHTML = `
      <div class="notif-emoji ${emojiCls}">${fishArt(fish, { cls: emojiCls, isShiny })}</div>
      <div class="notif-text">
        <span class="notif-title">${title}</span>
        <span class="notif-sub">${sub}</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.regular);
  }

  function showShinyCelebration(fish, { isFirstShiny = false } = {}) {
    const n = document.createElement("div");
    n.className = "notif big celebrate rarity-legendary";
    n.innerHTML = `
      <div class="notif-emoji big shiny">${fishArt(fish, { cls: "big", isShiny: true })}</div>
      <div class="notif-text">
        <span class="notif-hat">✨ ${isFirstShiny ? "FIRST SHINY" : "SHINY CATCH"} · 1 IN ${SHINY_DENOM.toLocaleString()}</span>
        <span class="notif-title big">Shiny ${fish.name}!</span>
        <span class="notif-sub">${isFirstShiny ? "Added to your Album" : TIER_LABEL[fish.rarity]} · sells for ${pearlsForCatch(fish, true).toLocaleString()} 🫧</span>
      </div>
    `;
    // V6: first shiny ever = headline banner (dismiss-on-tap); repeat shinies
    // still get the celebrate treatment but auto-fade at big-event length.
    pushNotif(n, isFirstShiny ? NOTIF_HOLD.banner : NOTIF_HOLD.big);
  }

  function burstCelebration(fish, { count = 22, distMin = 180, distMax = 400 } = {}) {
    const burst = document.createElement("div");
    burst.className = "celebration-burst";
    const sparks = ["✨", "🌟", "💫", "🎉", fish.emoji];
    for (let i = 0; i < count; i++) {
      const s = document.createElement("div");
      s.className = "spark";
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = distMin + Math.random() * (distMax - distMin);
      s.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
      s.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
      s.style.setProperty("--rot", `${(Math.random() * 720 - 360).toFixed(0)}deg`);
      s.textContent = sparks[i % sparks.length];
      burst.appendChild(s);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1600);
  }

  // ---------- V4 legendary + shiny sequences ----------

  function playLegendarySequence(fish, { isFirstCatch, isGift } = {}) {
    // 0ms: hit-stop dim + play fanfare MP3
    playCatchSound("legendary");
    const dim = document.createElement("div");
    dim.className = "hit-stop-dim";
    document.body.appendChild(dim);
    setTimeout(() => dim.remove(), 260);

    // 120ms: screen shake
    setTimeout(() => {
      document.body.classList.remove("screen-shake");
      void document.body.offsetWidth;
      document.body.classList.add("screen-shake");
      setTimeout(() => document.body.classList.remove("screen-shake"), 460);
    }, 120);

    // 180ms: notification card (our existing big notif) slides in
    setTimeout(() => {
      if (isFirstCatch) showFirstCatchCelebration(fish, { fromGift: isGift });
      else showCatchNotification(fish, { fromGift: isGift });
    }, 180);

    // 350ms + 550ms: two confetti waves
    setTimeout(() => burstCelebration(fish, { count: 30, distMin: 220, distMax: 500 }), 350);
    setTimeout(() => burstCelebration({ emoji: "🎉", hue: 0 }, { count: 18 }), 550);

    // 650ms: gentle slowmo filter (just a saturation/contrast breath)
    setTimeout(() => {
      document.body.classList.add("slowmo");
      setTimeout(() => document.body.classList.remove("slowmo"), 520);
    }, 650);

    // 1100ms: "LEGENDARY!" banner pops
    setTimeout(() => showLegendaryBanner(fish), 1100);
  }

  function showLegendaryBanner(fish) {
    // V8: decode the hero image before the card mounts so the drop-in animation
    // doesn't stutter on a mid-flight image paint. If decode fails we fall back
    // to the regular flow — the image's onerror will swap to the emoji.
    const mount = () => {
      const wrap = document.createElement("div");
      wrap.className = "legendary-banner";
      wrap.innerHTML = `
        <div class="legendary-card">🏆 LEGENDARY! ${fishArt(fish, { cls: "banner" })}</div>
      `;
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 1200);
    };
    preloadFishImage(fish).finally(mount);
  }

  // Returns a promise that resolves once the PNG is decoded (or rejects on 404).
  // Result is cached on the element's native image cache so subsequent banner
  // renders of the same species paint instantly.
  function preloadFishImage(fish) {
    const img = new Image();
    img.src = `assets/fish/${fish.id}.png`;
    return img.decode ? img.decode().catch(() => {}) : new Promise(res => { img.onload = img.onerror = res; });
  }

  // Mythic is rarer than legendary — reuses the legendary fanfare for punch
  // but layers the shiny crystal chime on top + a magenta-pink banner so the
  // two moments read as distinct classes of "holy crap."
  function playMythicSequence(fish, { isFirstCatch, isGift } = {}) {
    playCatchSound("legendary");
    playShinySound(); // procedural sparkle layered over the fanfare

    // Hit-stop + screen shake (stronger than legendary on purpose)
    const dim = document.createElement("div");
    dim.className = "hit-stop-dim";
    document.body.appendChild(dim);
    setTimeout(() => dim.remove(), 260);

    setTimeout(() => {
      document.body.classList.remove("screen-shake");
      void document.body.offsetWidth;
      document.body.classList.add("screen-shake");
      setTimeout(() => document.body.classList.remove("screen-shake"), 460);
    }, 120);

    // Notification card
    setTimeout(() => {
      if (isFirstCatch) showFirstCatchCelebration(fish, { fromGift: isGift });
      else showCatchNotification(fish, { fromGift: isGift });
    }, 180);

    // Rainbow confetti waves
    setTimeout(() => burstCelebration(fish, { count: 36, distMin: 240, distMax: 560 }), 350);
    setTimeout(() => burstCelebration({ emoji: "💠", hue: 0 }, { count: 22 }), 520);
    setTimeout(() => burstCelebration({ emoji: "✨", hue: 0 }, { count: 18 }), 700);

    // Slowmo breath
    setTimeout(() => {
      document.body.classList.add("slowmo");
      setTimeout(() => document.body.classList.remove("slowmo"), 600);
    }, 650);

    // Mythic banner pops
    setTimeout(() => showMythicBanner(fish), 1100);
  }

  function showMythicBanner(fish) {
    const mount = () => {
      const wrap = document.createElement("div");
      wrap.className = "legendary-banner mythic-banner";
      wrap.innerHTML = `
        <div class="legendary-card mythic-card">💠 MYTHIC! ${fishArt(fish, { cls: "banner" })}</div>
      `;
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 1400);
    };
    preloadFishImage(fish).finally(mount);
  }

  // Session-scoped counter so later shinies get 70% intensity (Codex recco).
  let shinySessionCount = 0;
  function showShinySequence(fish, { isFirstShiny } = {}) {
    shinySessionCount += 1;
    const intensity = shinySessionCount === 1 ? 1 : 0.75;

    // V12: gold glowing frame around the viewport — the "stronger visual
    // overtone" Sebastian asked for. Pulses for the length of the celebration
    // so the whole UI reads as special, not just a small overlay.
    const frame = document.createElement("div");
    frame.className = "shiny-frame";
    frame.style.opacity = `${intensity}`;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 2500);

    // Full-screen radial tint + diagonal sweep.
    const overlay = document.createElement("div");
    overlay.className = "shiny-overlay";
    overlay.style.opacity = `${intensity}`;
    const glints = document.createElement("div");
    glints.className = "glints";
    // Three staggered waves of sparkles so the overlay stays alive the whole
    // 2.4-second run instead of popping once and fading.
    const spawnGlints = (count, startDelay) => {
      for (let i = 0; i < count; i++) {
        const g = document.createElement("div");
        g.className = "glint";
        g.textContent = "✨";
        g.style.setProperty("--x", `${8 + Math.random() * 84}%`);
        g.style.setProperty("--y", `${10 + Math.random() * 80}%`);
        g.style.setProperty("--sz", `${1.1 + Math.random() * 1.6}rem`);
        g.style.setProperty("--d", `${startDelay + Math.random() * 400}ms`);
        glints.appendChild(g);
      }
    };
    spawnGlints(18, 0);
    spawnGlints(14, 850);
    spawnGlints(10, 1600);
    overlay.appendChild(glints);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2500);

    // Gentle shake to punctuate the moment of catch — softer than legendary.
    setTimeout(() => {
      document.body.classList.remove("screen-shake");
      void document.body.offsetWidth;
      document.body.classList.add("screen-shake");
      setTimeout(() => document.body.classList.remove("screen-shake"), 420);
    }, 80);

    // Two sparkle bursts for extra flair — one ring of stars, one of the fish.
    setTimeout(() => burstCelebration({ emoji: "✨", hue: 0 }, { count: 30, distMin: 220, distMax: 520 }), 380);
    setTimeout(() => burstCelebration(fish, { count: 16, distMin: 200, distMax: 420 }), 700);

    // "SHINY!" banner drops in near the climax — matches legendary/mythic pattern.
    setTimeout(() => showShinyBanner(fish, { isFirstShiny }), 900);
  }

  function showShinyBanner(fish, { isFirstShiny = false } = {}) {
    const mount = () => {
      const wrap = document.createElement("div");
      wrap.className = "legendary-banner shiny-banner";
      wrap.innerHTML = `
        <div class="legendary-card shiny-card">✨ ${isFirstShiny ? "FIRST SHINY" : "SHINY"}! ${fishArt(fish, { cls: "banner", isShiny: true })}</div>
      `;
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 1700);
    };
    preloadFishImage(fish).finally(mount);
  }

  // ---------- V5 enhanced cast ripples (multi-ring + droplet spray) ----------
  // V6: adds a local "surface break" at the cast point so the water line visibly
  // splashes open for ~420ms — sells the splash without a full fluid sim.
  function spawnCastRipples() {
    const centerX = 50, centerY = 50; // pond-relative %
    // Three staggered concentric rings (below surface).
    for (let i = 0; i < 3; i++) {
      const r = document.createElement("div");
      r.className = "ripple v5-ring";
      r.style.animationDelay = `${i * 160}ms`;
      $pond.appendChild(r);
      setTimeout(() => r.remove(), 1800 + i * 160);
    }
    // V6: local surface line break over the cast point.
    const brk = document.createElement("div");
    brk.className = "surface-break";
    $pond.appendChild(brk);
    setTimeout(() => brk.remove(), 500);
    // Droplet spray — tiny bubbles flying out and falling back.
    const droplets = 8;
    for (let i = 0; i < droplets; i++) {
      const d = document.createElement("div");
      d.className = "cast-droplet";
      const ang = (i / droplets) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 50 + Math.random() * 60;
      d.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
      d.style.setProperty("--dy", `${Math.sin(ang) * dist * 0.6 - 28}px`);
      d.style.left = `${centerX}%`;
      d.style.top = `${centerY}%`;
      $pond.appendChild(d);
      setTimeout(() => d.remove(), 800);
    }
  }

  // ---------- V14 edge flora (Ideogram sticker art) ----------
  // V5 used emoji (🌿🪸) — V14 swaps in painterly PNGs that match assets/fish/*.
  // Two seaweed clumps (sway), one coral center, two rocks scattered for depth.
  function renderEdgeFlora() {
    const flora = document.getElementById("edge-flora");
    if (!flora) return;
    if (flora.dataset.rendered === "1") return;
    flora.dataset.rendered = "1";
    const items = [
      { src: "assets/env/seaweed.png",     cls: "flora-img sway",          left: "6%",  size: "110px" },
      { src: "assets/env/rock_small.png",  cls: "flora-img flora-rock",    left: "22%", size: "64px"  },
      { src: "assets/env/coral.png",       cls: "flora-img flora-coral",   left: "48%", size: "120px" },
      { src: "assets/env/rock_medium.png", cls: "flora-img flora-rock",    left: "74%", size: "78px"  },
      { src: "assets/env/seaweed.png",     cls: "flora-img sway reverse",  left: "90%", size: "100px" },
    ];
    for (const it of items) {
      const el = document.createElement("img");
      el.className = `flora ${it.cls}`;
      el.src = it.src;
      el.alt = "";
      el.decoding = "async";
      el.style.left = it.left;
      el.style.setProperty("--flora-h", it.size);
      flora.appendChild(el);
    }
  }

  // ---------- V4 bubble spawner (pond ambient) ----------
  // V6: bubbles rise from the bottom but stop well below the surface line at
  // 32% (so they never pierce the water surface — visual consistency).
  function spawnBubble() {
    const b = document.createElement("div");
    b.className = "bubble";
    const size = 6 + Math.random() * 16;
    b.style.setProperty("--sz", `${size}px`);
    b.style.setProperty("--x", `${5 + Math.random() * 90}%`);
    // Rise height 40-58% of pond height (pond is 100%, surface at 32% = water
    // is 68% tall — keep bubbles to roughly the lower 2/3 of the water zone).
    const h = 40 + Math.random() * 18;
    b.style.setProperty("--h", `${h}%`);
    b.style.setProperty("--sway", `${(Math.random() * 60 - 30).toFixed(0)}px`);
    const dur = 5 + Math.random() * 5;
    b.style.setProperty("--dur", `${dur}s`);
    $bubbles.appendChild(b);
    setTimeout(() => b.remove(), dur * 1000 + 400);
  }

  // ---------- Ambient pond fish ----------

  const AMBIENT_SPECIES = [
    { emoji: "🐟", size: "1.4rem", hue: 0 },
    { emoji: "🐠", size: "1.6rem", hue: 0 },
    { emoji: "🐡", size: "1.3rem", hue: 0 },
    { emoji: "🐟", size: "1.1rem", hue: 180 },
    { emoji: "🐠", size: "1.8rem", hue: 60 },
  ];
  const MAX_AMBIENT = 8;
  const MIN_AMBIENT = 5;
  const ambientTracker = new Set();

  function spawnAmbient() {
    const spec = AMBIENT_SPECIES[Math.floor(Math.random() * AMBIENT_SPECIES.length)];
    const fish = document.createElement("div");
    fish.className = "swim-fish";
    fish.textContent = spec.emoji;
    fish.style.setProperty("--fish-size", spec.size);
    if (spec.hue) fish.style.filter = `hue-rotate(${spec.hue}deg) saturate(1.2) drop-shadow(0 2px 2px rgba(0, 30, 60, 0.35))`;

    // V6: confine ambient fish to the water zone (below the surface line at 32%).
    fish.style.top = (40 + Math.random() * 50) + "%";

    const duration = 6 + Math.random() * 12; // seconds
    const dirLR = Math.random() < 0.5;
    fish.style.left = dirLR ? "-15%" : "115%";
    // 🐟/🐠/🐡 emoji face LEFT by default on Apple/most systems.
    // So moving right needs a horizontal flip; moving left is natural.
    if (dirLR) fish.style.transform = "scaleX(-1)";
    fish.style.transition = `left ${duration}s linear`;

    $ambient.appendChild(fish);
    ambientTracker.add(fish);

    // Kick off the traversal on the next frame so the transition runs.
    requestAnimationFrame(() => {
      fish.style.left = dirLR ? "115%" : "-15%";
    });

    const done = () => {
      ambientTracker.delete(fish);
      fish.remove();
    };
    fish.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 800); // safety
  }

  function ambientLoop() {
    // Keep between MIN and MAX ambient fish.
    while (ambientTracker.size < MIN_AMBIENT) spawnAmbient();
    if (ambientTracker.size < MAX_AMBIENT && Math.random() < 0.5) spawnAmbient();
  }

  // ---------- V6 sky ambient: clouds + V14 bird/airplane, sun/moon, celestial ----------
  const $skyAmbient = document.getElementById("sky-ambient");
  const skyTracker = new Set();
  // V14 celestial body — persistent DOM node, just swapped between sun & moon
  // by setDayNightPhase(). Parked as a single child of the sky zone.
  let $celestial = null;
  function ensureCelestial() {
    if (!$skyAmbient) return null;
    if ($celestial && $celestial.isConnected) return $celestial;
    $celestial = document.createElement("img");
    $celestial.className = "sky-celestial";
    $celestial.alt = "";
    $celestial.decoding = "async";
    $celestial.src = "assets/env/sun.png";
    $skyAmbient.appendChild($celestial);
    return $celestial;
  }

  function spawnSkyCloud() {
    if (!$skyAmbient) return;
    const c = document.createElement("div");
    c.className = "sky-cloud";
    c.textContent = "☁️";
    c.style.fontSize = `${(1.4 + Math.random() * 1.4).toFixed(2)}rem`;
    c.style.opacity = `${(0.7 + Math.random() * 0.3).toFixed(2)}`;
    c.style.top = `${10 + Math.random() * 55}%`;
    const dirLR = Math.random() < 0.5;
    c.style.left = dirLR ? "-20%" : "115%";
    const duration = 28 + Math.random() * 22; // slow drift
    c.style.transition = `left ${duration}s linear`;
    $skyAmbient.appendChild(c);
    skyTracker.add(c);
    requestAnimationFrame(() => { c.style.left = dirLR ? "115%" : "-20%"; });
    const done = () => { skyTracker.delete(c); c.remove(); };
    c.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 1000);
  }

  // V14 bird — replaces the V6 dragonfly stand-in. Flies across the sky zone.
  function spawnBird() {
    if (!$skyAmbient) return;
    const b = document.createElement("img");
    b.className = "sky-bird";
    b.alt = "";
    b.decoding = "async";
    b.src = "assets/env/bird.png";
    b.style.top = `${18 + Math.random() * 50}%`;
    const dirLR = Math.random() < 0.5;
    b.style.left = dirLR ? "-12%" : "112%";
    const duration = 10 + Math.random() * 6;
    b.style.transition = `left ${duration}s linear`;
    // Art faces right → flip for leftward flight (dirLR===false).
    if (!dirLR) b.style.transform = "scaleX(-1)";
    $skyAmbient.appendChild(b);
    skyTracker.add(b);
    requestAnimationFrame(() => { b.style.left = dirLR ? "112%" : "-12%"; });
    const done = () => { skyTracker.delete(b); b.remove(); };
    b.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 1200);
  }

  // V14 airplane — rare, slow, above the birds.
  function spawnAirplane() {
    if (!$skyAmbient) return;
    const p = document.createElement("img");
    p.className = "sky-airplane";
    p.alt = "";
    p.decoding = "async";
    p.src = "assets/env/airplane.png";
    p.style.top = `${6 + Math.random() * 16}%`;
    const dirLR = Math.random() < 0.5;
    p.style.left = dirLR ? "-18%" : "118%";
    const duration = 18 + Math.random() * 8;
    p.style.transition = `left ${duration}s linear`;
    if (!dirLR) p.style.transform = "scaleX(-1)";
    $skyAmbient.appendChild(p);
    skyTracker.add(p);
    requestAnimationFrame(() => { p.style.left = dirLR ? "118%" : "-18%"; });
    const done = () => { skyTracker.delete(p); p.remove(); };
    p.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 1200);
  }

  function skyLoop() {
    // Keep 2-3 clouds drifting. Birds: up to 1 at a time, occasional.
    // Airplane: ultra-rare (once every few minutes on average).
    const clouds    = [...skyTracker].filter(el => el.classList.contains("sky-cloud"));
    const birds     = [...skyTracker].filter(el => el.classList.contains("sky-bird"));
    const airplanes = [...skyTracker].filter(el => el.classList.contains("sky-airplane"));
    if (clouds.length < 2) spawnSkyCloud();
    else if (clouds.length < 3 && Math.random() < 0.08) spawnSkyCloud();
    if (birds.length === 0 && Math.random() < 0.04) spawnBird();
    // skyLoop runs ~2% of frames => ~1.2/sec; 0.0009 → ~1 per 925s ≈ every 3 min avg.
    if (airplanes.length === 0 && Math.random() < 0.0009) spawnAirplane();
  }

  // ---------- V14 deep-water ambient (big fish + rare shark) ----------
  // These are decorative only — no catch interaction. Confined to the lower
  // third of the water zone (behind the main ambient-fish layer so they read
  // as "background life"). Shark is rare (~1 per 3 min avg).
  const AMBIENT_BG_SOURCES = [
    "assets/env/bgfish_big.png",
    "assets/env/bgfish_med.png",
  ];
  const bgAmbientTracker = new Set();

  function spawnBgFish() {
    if (!$ambient) return;
    const f = document.createElement("img");
    f.className = "bg-ambient-fish";
    f.alt = "";
    f.decoding = "async";
    f.src = AMBIENT_BG_SOURCES[Math.floor(Math.random() * AMBIENT_BG_SOURCES.length)];
    f.style.top = `${68 + Math.random() * 22}%`;
    const dirLR = Math.random() < 0.5;
    f.style.left = dirLR ? "-18%" : "118%";
    const duration = 14 + Math.random() * 10;
    f.style.transition = `left ${duration}s linear`;
    // Art faces right → flip for rightward→leftward direction.
    if (!dirLR) f.style.transform = "scaleX(-1)";
    $ambient.appendChild(f);
    bgAmbientTracker.add(f);
    requestAnimationFrame(() => { f.style.left = dirLR ? "118%" : "-18%"; });
    const done = () => { bgAmbientTracker.delete(f); f.remove(); };
    f.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 1200);
  }

  function spawnBgShark() {
    if (!$ambient) return;
    const s = document.createElement("img");
    s.className = "bg-ambient-shark";
    s.alt = "";
    s.decoding = "async";
    s.src = "assets/env/shark_bg.png";
    s.style.top = `${72 + Math.random() * 14}%`;
    const dirLR = Math.random() < 0.5;
    s.style.left = dirLR ? "-22%" : "122%";
    const duration = 20 + Math.random() * 8;
    s.style.transition = `left ${duration}s linear`;
    if (!dirLR) s.style.transform = "scaleX(-1)";
    $ambient.appendChild(s);
    bgAmbientTracker.add(s);
    requestAnimationFrame(() => { s.style.left = dirLR ? "122%" : "-22%"; });
    const done = () => { bgAmbientTracker.delete(s); s.remove(); };
    s.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 1500);
  }

  function bgAmbientLoop() {
    const fish  = [...bgAmbientTracker].filter(el => el.classList.contains("bg-ambient-fish"));
    const sharks = [...bgAmbientTracker].filter(el => el.classList.contains("bg-ambient-shark"));
    if (fish.length < 1 && Math.random() < 0.05) spawnBgFish();
    else if (fish.length < 2 && Math.random() < 0.015) spawnBgFish();
    // Shark: ~0.0008 per ~1.2Hz tick = once per ~1000s ≈ every ~17min avg.
    // Task asked for "rare". We bump a little so it shows up in a ~5-10min session occasionally.
    if (sharks.length === 0 && Math.random() < 0.0025) spawnBgShark();
  }

  // ---------- V14 day/night cycle ----------
  // Cosmetic only — recolors the pond sky/water gradient and swaps the
  // sun/moon asset. Full loop = DAY_NIGHT_PERIOD_MS. Anchored to Date.now()
  // so it advances continuously across reloads without a state cell.
  //
  // IMPORTANT: no gameplay or analytics changes here. `track()` paths are
  // untouched — visuals are the only side effect. If this ever needs to
  // reach into catch resolution, add a separate non-cosmetic system.
  const DAY_NIGHT_PERIOD_MS = 8 * 60 * 1000; // 8 min full cycle — task said 5-10
  let dayNightPhaseLabel = null; // "day" | "dusk" | "night" | "dawn"
  function dayNightProgress() {
    // 0.0 = mid-day, 0.25 = dusk, 0.5 = mid-night, 0.75 = dawn.
    // `window.__dnForceT` (0..1) lets test/dev override for one tick cycle.
    if (typeof window.__dnForceT === "number") return window.__dnForceT;
    const t = (Date.now() % DAY_NIGHT_PERIOD_MS) / DAY_NIGHT_PERIOD_MS;
    return t;
  }
  function phaseFromProgress(t) {
    // Four gentle quarters. The visuals interpolate smoothly within each.
    if (t < 0.20 || t >= 0.80) return "day";
    if (t >= 0.20 && t < 0.35) return "dusk";
    if (t >= 0.35 && t < 0.65) return "night";
    return "dawn"; // 0.65..0.80
  }
  function updateDayNight(force) {
    if (!document.body) return;
    const t = dayNightProgress();
    const phase = phaseFromProgress(t);
    // Smooth sky/water color via a single 0..1 "nightness" factor driven by
    // cosine — peaks at t=0.5 (deep night), zero at t=0 and t=1 (noon).
    const nightness = (1 - Math.cos(t * Math.PI * 2)) / 2;
    // Write as CSS vars on <body>; pond gradient reads these.
    document.body.style.setProperty("--night-mix", nightness.toFixed(3));
    if (force || phase !== dayNightPhaseLabel) {
      dayNightPhaseLabel = phase;
      document.body.dataset.dnPhase = phase;
      // Swap the celestial art when the phase crosses into mostly-dark or
      // mostly-light. Sun lives during day+dusk+dawn; moon during deep night.
      const el = ensureCelestial();
      if (el) {
        const wantMoon = (phase === "night");
        const desired = wantMoon ? "assets/env/moon.png" : "assets/env/sun.png";
        if (!el.src.endsWith(desired)) el.src = desired;
      }
    }
    // Sun and moon each arc across the sky during their visibility window.
    // Day window spans t ∈ [0.65, 1) ∪ [0, 0.35) = 70% of the cycle.
    // Night window spans t ∈ [0.35, 0.65) = 30% of the cycle.
    if ($celestial) {
      let bodyT; // 0 = rising east, 1 = setting west
      if (phase === "night") {
        bodyT = (t - 0.35) / 0.30;
      } else {
        // Shift so sunrise (t=0.65) becomes 0 and sunset (t=0.35) becomes 1.
        const adj = (t + 0.35) % 1; // 0 at t=0.65, 0.70 at t=0.35
        bodyT = Math.min(1, Math.max(0, adj / 0.70));
      }
      const x = bodyT * 100;
      // Half-sine parabola: y = 85% at horizon, 15% at zenith.
      const y = 85 - Math.sin(bodyT * Math.PI) * 70;
      $celestial.style.left = `${x.toFixed(1)}%`;
      $celestial.style.top  = `${y.toFixed(1)}%`;
    }
  }

  // ---------- Tick ----------

  function tick() {
    const now = performance.now();
    for (const [type, buff] of [...state.buffs.entries()]) {
      if (buff.endsAt <= now) state.buffs.delete(type);
    }
    updateBuffPills();
    // Occasional ambient top-up
    if (Math.random() < 0.06) ambientLoop();
    // V4 bubbles — low rate so the pond feels alive, not fizzy.
    if (Math.random() < 0.03) spawnBubble();
    // V6/V14 sky ambient — clouds drifting, bird/airplane rolls inside.
    if (Math.random() < 0.02) skyLoop();
    // V14 deep-water ambient — big fish drift, rare shark swim-bys.
    if (Math.random() < 0.02) bgAmbientLoop();
    // V14 day/night cycle — recolor only, no gameplay impact.
    if (Math.random() < 0.02) updateDayNight();
    requestAnimationFrame(tick);
  }

  // ---------- Next Goal strip ----------

  function renderNextGoal() {
    // V10: the progression goal is "next rod to own". For rods with a milestone
    // we show catch progress; for pure-pay rods we show pearl progress.
    const nextRod = RODS.find(r => r.id !== "basic" && !prog.unlocks[r.id]);
    const albumRemaining = FISH.length - Object.keys(prog.discovered).length;

    if (nextRod) {
      const p = rodUnlockProgress(nextRod);
      let label, ratio;
      if (p && !rodMilestoneMet(nextRod)) {
        const currentDesc = p.need
          .map(n => `${Math.min(n.current, n.target)}/${n.target}`)
          .join(" · ");
        label = `${nextRod.name} — ${currentDesc}`;
        ratio = p.ratio;
      } else {
        label = `${nextRod.name} — 🫧 ${Math.min(prog.pearls, nextRod.price).toLocaleString()}/${nextRod.price.toLocaleString()}`;
        ratio = Math.min(1, prog.pearls / nextRod.price);
      }
      $nextGoal.className = "next-goal";
      $nextGoal.innerHTML = `
        <span class="next-goal-emoji">${rodArt(nextRod)}</span>
        <span class="next-goal-text">
          <span class="next-goal-head">Next rod</span>
          <span class="next-goal-label">${label}</span>
        </span>
        <span class="next-goal-bar"><span class="next-goal-bar-fill" style="width:${(ratio * 100).toFixed(0)}%"></span></span>
      `;
    } else if (albumRemaining > 0) {
      const got = Object.keys(prog.discovered).length;
      const ratio = got / FISH.length;
      $nextGoal.className = "next-goal";
      $nextGoal.innerHTML = `
        <span class="next-goal-emoji">📖</span>
        <span class="next-goal-text">
          <span class="next-goal-head">Album</span>
          <span class="next-goal-label">${got} / ${FISH.length} discovered — ${albumRemaining} to go!</span>
        </span>
        <span class="next-goal-bar"><span class="next-goal-bar-fill" style="width:${(ratio * 100).toFixed(0)}%"></span></span>
      `;
    } else {
      $nextGoal.className = "next-goal complete";
      $nextGoal.innerHTML = `
        <span class="next-goal-emoji">🏆</span>
        <span class="next-goal-text">
          <span class="next-goal-head">Master Angler</span>
          <span class="next-goal-label">Every fish, every rod. Keep on casting!</span>
        </span>
      `;
    }
  }

  // ---------- Album ----------

  function renderAlbum() {
    const discovered = Object.keys(prog.discovered).length;
    const shiniesFound = Object.keys(prog.shinyDiscovered).length;
    // V12: count distinct (species, mutation) pairs the player has caught.
    const mutationsFound = Object.keys(prog.mutationsDiscovered || {}).length;
    const starId = getTodaysStarFishId();
    const starFish = FISH.find(f => f.id === starId);
    const starCaught = !!prog.discovered[starId];
    const starHint = starFish
      ? `<span class="album-star-hint"${starCaught ? "" : ' title="Mystery fish — can you find them today?"'}>🌟 Today's Star: <strong>${starCaught ? starFish.name : "???"}</strong></span>`
      : "";
    const mutationSummary = mutationsFound ? ` · 🧬 ${mutationsFound} mutation${mutationsFound === 1 ? "" : "s"}` : "";
    $albumProgress.innerHTML = `${discovered} / ${FISH.length} discovered${shiniesFound ? ` · ✨ ${shiniesFound} shiny` : ""}${mutationSummary}${starHint ? ` · ${starHint}` : ""}`;
    $albumGrid.innerHTML = "";
    for (const fish of FISH) {
      const got = !!prog.discovered[fish.id];
      const gotShiny = !!prog.shinyDiscovered[fish.id];
      const isStar = fish.id === starId;
      const count = prog.totals.bySpecies[fish.id] || 0;
      const card = document.createElement("div");
      card.className = `album-card rarity-${fish.rarity} ${got ? "discovered" : "undiscovered"}${isStar ? " todays-star" : ""}`;
      card.style.setProperty("--badge", ({
        common: "var(--common)", uncommon: "var(--uncommon)",
        rare: "var(--rare)", legendary: "var(--legendary)",
      })[fish.rarity]);
      const emojiClass = gotShiny ? "album-emoji shiny" : "album-emoji";
      const fishDisplay = got
        ? fishArt(fish, { cls: gotShiny ? "shiny" : "", isShiny: gotShiny })
        : `<span class="art-fallback">❔</span>`;
      const chosenName = prog.names && prog.names[fish.id];
      const namingSlot = got && canName(fish)
        ? (chosenName
            ? `<button class="album-name-tag" data-name-id="${fish.id}" type="button" title="Tap to rename">🏷️ ${chosenName}</button>`
            : `<button class="album-name-tag name-me" data-name-id="${fish.id}" type="button" title="Give this one a name">✨ Name me</button>`)
        : "";
      // V9 passport stamp: auto date stamp on Rare+ cards (rare, legendary,
      // mythic). Purely decorative — soft ink circle, slight rotation, no
      // interaction, no animation. Makes the album feel like a keepsake.
      const firstCaughtAt = prog.discovered[fish.id];
      const isStampable = got && firstCaughtAt && (fish.rarity === "rare" || fish.rarity === "legendary" || fish.rarity === "mythic");
      const stampHTML = isStampable
        ? `<span class="passport-stamp" aria-hidden="true">${formatStampDate(firstCaughtAt)}</span>`
        : "";
      // V12: mutation strip — one pip per mutation, lit if caught. Only shown
      // once the base species is discovered so undiscovered cards stay mysterious.
      const mutationStripHTML = got ? renderAlbumMutationStrip(fish.id) : "";
      card.innerHTML = `
        <span class="album-rarity-badge" aria-hidden="true"></span>
        ${gotShiny ? '<span class="shiny-badge" title="Shiny caught!">✨</span>' : ""}
        ${isStar ? '<span class="star-ribbon" title="Today\'s Star — 2× pearls on eat">🌟</span>' : ""}
        ${stampHTML}
        <span class="${emojiClass}">${fishDisplay}</span>
        <div class="album-name">${got ? fish.name : "???"}</div>
        <div class="album-sub">${got ? `${TIER_LABEL[fish.rarity]} · Caught ${count}×` : TIER_LABEL[fish.rarity]}</div>
        ${mutationStripHTML}
        ${namingSlot}
      `;
      const nameBtn = card.querySelector(".album-name-tag");
      if (nameBtn) nameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openNamingFor(fish.id);
      });
      $albumGrid.appendChild(card);
    }
  }

  function renderAlbumMutationStrip(fishId) {
    const pips = EVENTS.map(ev => {
      const mut = MUTATIONS[ev.mutationId];
      const caught = !!prog.mutationsDiscovered[`${fishId}:${mut.id}`];
      const title = caught ? `${mut.adj} caught!` : `${mut.adj} — catch during ${ev.name} event`;
      return `<span class="album-mut-pip mut-${mut.id} ${caught ? "caught" : ""}" title="${title}" aria-label="${title}">${mut.icon}</span>`;
    }).join("");
    return `<div class="album-mut-strip" aria-label="Mutations">${pips}</div>`;
  }

  // ---------- Shop ----------

  function renderDecorations() {
    $decorations.innerHTML = "";
    const surfaceLayer = document.getElementById("surface-decorations");
    if (surfaceLayer) surfaceLayer.innerHTML = "";
    DECORATIONS.forEach((deco, i) => {
      if (!prog.decorationsOwned[deco.id]) return;
      const el = document.createElement("div");
      el.className = "decoration" + (deco.surface ? " surface" : "");
      el.style.left = `${deco.pos.x}%`;
      el.style.top = `${deco.pos.y}%`;
      el.style.setProperty("--d", `${(i * 0.35).toFixed(2)}s`);
      el.innerHTML = decoArt(deco);
      (deco.surface && surfaceLayer ? surfaceLayer : $decorations).appendChild(el);
    });
  }

  function renderShop() {
    $shopPearls.textContent = prog.pearls.toLocaleString();
    $shopGrid.innerHTML = "";

    // V10: rods come first — the progression economy lives here now. Shop
    // shows every rod (minus the free Trusty Stick) with three possible
    // states: locked (milestone not met), for-sale (buy now), or owned.
    const rodHeader = document.createElement("div");
    rodHeader.className = "shop-section-header";
    rodHeader.textContent = "🎣 Rods";
    $shopGrid.appendChild(rodHeader);

    for (const rod of RODS) {
      if (rod.id === "basic") continue; // always-owned starter, no need to show
      const owned = !!prog.unlocks[rod.id];
      const milestoneMet = rodMilestoneMet(rod);
      const canAfford = prog.pearls >= rod.price;
      const card = document.createElement("div");
      card.className = "shop-card rod-card" +
        (owned ? " owned" : (!milestoneMet ? " milestone-locked" : (canAfford ? "" : " locked")));

      let footer;
      if (owned) {
        footer = `<span class="shop-owned-tag">✓ Owned</span>`;
      } else if (!milestoneMet) {
        const p = rodUnlockProgress(rod);
        const progressLine = p.need
          .map(n => `${Math.min(n.current, n.target)}/${n.target} ${n.noun}`)
          .join(", ");
        footer = `<span class="shop-lock-line">🔒 ${p.label}</span>
                  <span class="shop-lock-progress">${progressLine}</span>`;
      } else {
        footer = `<span class="shop-card-price">🫧 ${rod.price.toLocaleString()}</span>
                  <button class="shop-buy" ${canAfford ? "" : "disabled"} data-rod="${rod.id}">Buy</button>`;
      }

      card.innerHTML = `
        <span class="shop-card-emoji rod-shop-art">${rodArt(rod)}</span>
        <span class="shop-card-name">${rod.name}</span>
        <span class="shop-card-sub">${rod.luck.toFixed(1)}× luck</span>
        ${footer}
      `;
      const buy = card.querySelector(".shop-buy");
      if (buy) buy.addEventListener("click", () => buyRod(rod.id));
      $shopGrid.appendChild(card);
    }

    const decoHeader = document.createElement("div");
    decoHeader.className = "shop-section-header";
    decoHeader.textContent = "🎀 Pond Decorations";
    $shopGrid.appendChild(decoHeader);

    for (const deco of DECORATIONS) {
      const owned = !!prog.decorationsOwned[deco.id];
      const canAfford = prog.pearls >= deco.price;
      const card = document.createElement("div");
      card.className = "shop-card" + (owned ? " owned" : (canAfford ? "" : " locked"));
      card.innerHTML = `
        <span class="shop-card-emoji deco-shop-art">${decoArt(deco)}</span>
        <span class="shop-card-name">${deco.name}</span>
        ${owned
          ? `<span class="shop-owned-tag">✓ Placed!</span>`
          : `<span class="shop-card-price">🫧 ${deco.price}</span>
             <button class="shop-buy" ${canAfford ? "" : "disabled"} data-deco="${deco.id}">Buy</button>`}
      `;
      const buy = card.querySelector(".shop-buy");
      if (buy) buy.addEventListener("click", () => buyDecoration(deco.id));
      $shopGrid.appendChild(card);
    }
  }

  function buyRod(id) {
    const rod = RODS.find(r => r.id === id);
    if (!rod || prog.unlocks[id]) return;
    if (!rodMilestoneMet(rod)) return;
    if (prog.pearls < rod.price) return;
    prog.pearls -= rod.price;
    prog.unlocks[id] = true;
    renderPearls();
    renderRods();
    renderShop();
    showRodPurchase(rod);
    saveProgression();
    syncAchievementUnlocks();
  }

  function buyDecoration(id) {
    const deco = DECORATIONS.find(d => d.id === id);
    if (!deco || prog.decorationsOwned[id]) return;
    if (prog.pearls < deco.price) return;
    prog.pearls -= deco.price;
    prog.decorationsOwned[id] = Date.now();
    renderPearls();
    renderDecorations();
    renderShop();
    // All-decorations milestone
    if (!prog.milestonesSeen.allDecorations && DECORATIONS.every(d => prog.decorationsOwned[d.id])) {
      prog.milestonesSeen.allDecorations = true;
      showMilestone("🌊 Pond Master!", "Every decoration placed — your pond is a wonderland!", { badge: "pondMaster", badgeEmoji: "🌊" });
    } else {
      // Small celebration per purchase
      const n = document.createElement("div");
      n.className = "notif celebrate rarity-uncommon";
      n.innerHTML = `
        <div class="notif-emoji">${deco.emoji}</div>
        <div class="notif-text">
          <span class="notif-title">${deco.name} placed!</span>
          <span class="notif-sub">Look at your pond!</span>
        </div>
      `;
      pushNotif(n, 2200);
      // Small burst at the decoration itself
      burstCelebration({ emoji: deco.emoji, hue: 0 });
    }
    saveProgression();
    syncAchievementUnlocks();
  }

  // Modal instances defined at the bottom of the file via makeModal().
  // The exported open/close names live on `modals.*` and are wired at boot.

  // ---------- V8 achievements ----------
  // Each achievement: id, icon (badge asset id | emoji), name, description,
  // progress(prog) -> { current, target }. Unlocked = current >= target.
  const ACHIEVEMENTS = [
    { id: "firstCatch",    icon: "🎣", name: "First Cast",       desc: "Catch your very first fish.",
      progress: (p) => ({ current: Math.min(p.totals.all, 1), target: 1 }) },
    { id: "catch10",       icon: "🐟", name: "Getting the Hang", desc: "Catch 10 fish.",
      progress: (p) => ({ current: Math.min(p.totals.all, 10), target: 10 }) },
    { id: "catch50",       icon: "🐠", name: "Pond Regular",     desc: "Catch 50 fish.",
      progress: (p) => ({ current: Math.min(p.totals.all, 50), target: 50 }) },
    { id: "catch200",      icon: "🎏", name: "Century Club",     desc: "Catch 200 fish.",
      progress: (p) => ({ current: Math.min(p.totals.all, 200), target: 200 }) },
    { id: "firstUncommon", icon: "🐠", name: "Bluewater",        desc: "Catch your first uncommon.",
      progress: (p) => ({ current: Math.min(p.totals.uncommon || 0, 1), target: 1 }) },
    { id: "firstRare",     icon: "🐟", name: "Magic Touch",      desc: "Catch your first rare.",
      progress: (p) => ({ current: Math.min(p.totals.rare || 0, 1), target: 1 }) },
    { id: "firstLegendary",badgeAsset: "firstLegendary", icon: "🏆", name: "Legend", desc: "Catch your first legendary.",
      progress: (p) => ({ current: Math.min(p.totals.legendary || 0, 1), target: 1 }) },
    { id: "firstMythic",   badgeAsset: "firstMythic",    icon: "💠", name: "Ultra-Rare", desc: "Catch your first mythic.",
      progress: (p) => ({ current: Math.min(p.totals.mythic || 0, 1), target: 1 }) },
    { id: "firstShiny",    badgeAsset: "firstShiny",     icon: "✨", name: "First Shiny", desc: "Pull a shiny fish.",
      progress: (p) => ({ current: Math.min(Object.keys(p.shinyDiscovered || {}).length, 1), target: 1 }) },
    { id: "fiveShinies",   icon: "🌟", name: "Shiny Hunter",     desc: "Find 5 different shinies.",
      progress: (p) => ({ current: Math.min(Object.keys(p.shinyDiscovered || {}).length, 5), target: 5 }) },
    { id: "albumComplete", badgeAsset: "albumComplete",  icon: "📖", name: "Master Angler", desc: "Discover every fish in the album.",
      progress: (p) => ({ current: Object.keys(p.discovered || {}).length, target: FISH.length }) },
    { id: "allRods",       icon: "🎣", name: "Full Tackle Bag",  desc: "Unlock every rod.",
      progress: (p) => ({ current: RODS.filter(r => !r.unlock || (p.unlocks || {})[r.id]).length, target: RODS.length }) },
    { id: "allDecos",      badgeAsset: "pondMaster",     icon: "🌊", name: "Pond Master", desc: "Place every decoration.",
      progress: (p) => ({ current: DECORATIONS.filter(d => (p.decorationsOwned || {})[d.id]).length, target: DECORATIONS.length }) },
    { id: "pearls500",     icon: "🫧", name: "Pearl Collector",   desc: "Bank 500 pearls (lifetime or current).",
      progress: (p) => ({ current: Math.min(p.pearls || 0, 500), target: 500 }) },
  ];

  function achievementStatus(a) {
    const { current, target } = a.progress(prog);
    return { current, target, unlocked: current >= target, ratio: Math.min(1, current / target) };
  }

  // Fires `achievement_unlocked` exactly once per achievement per profile.
  // `silent` seeds already-unlocked state on first PostHog launch so pre-existing
  // players don't flood events for past unlocks.
  function syncAchievementUnlocks({ silent = false } = {}) {
    if (!prog.achievementsUnlocked) prog.achievementsUnlocked = {};
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (prog.achievementsUnlocked[a.id]) continue;
      if (achievementStatus(a).unlocked) {
        prog.achievementsUnlocked[a.id] = Date.now();
        changed = true;
        if (!silent) track("achievement_unlocked", { achievement_id: a.id, achievement_name: a.name });
      }
    }
    if (changed) saveProgression();
  }

  function renderAchievements() {
    const rows = ACHIEVEMENTS.map(a => ({ a, s: achievementStatus(a) }));
    const unlocked = rows.filter(r => r.s.unlocked).length;
    $achievementsProgress.innerHTML = `${unlocked} / ${rows.length} unlocked`;
    // Unlocked first, then closest to unlocking
    rows.sort((x, y) => {
      if (x.s.unlocked !== y.s.unlocked) return x.s.unlocked ? -1 : 1;
      return y.s.ratio - x.s.ratio;
    });
    $achievementsList.innerHTML = "";
    for (const { a, s } of rows) {
      const row = document.createElement("div");
      row.className = "achievement-row" + (s.unlocked ? " unlocked" : "");
      const icon = a.badgeAsset
        ? badgeArt(a.badgeAsset, a.icon, { cls: "ach-badge" })
        : `<span class="art-fallback ach-badge">${a.icon}</span>`;
      row.innerHTML = `
        <div class="ach-icon">${icon}</div>
        <div class="ach-body">
          <div class="ach-head">
            <span class="ach-name">${a.name}</span>
            <span class="ach-status">${s.unlocked ? "✓ Unlocked" : `${s.current} / ${s.target}`}</span>
          </div>
          <div class="ach-desc">${a.desc}</div>
          ${s.unlocked ? "" : `<div class="ach-bar"><div class="ach-bar-fill" style="width:${(s.ratio * 100).toFixed(0)}%"></div></div>`}
        </div>
      `;
      $achievementsList.appendChild(row);
    }
  }

  // openAchievements / closeAchievements live on `modals.achievements` (see makeModal block).

  // ---------- V9 naming modal ----------
  // One name per Legendary/Mythic species. Album card shows a tap-to-name
  // badge until she picks one; the modal is purely a grid of pre-made names
  // + a 🎲 Surprise Me. No freeform typing, no confirm dialog, no ceremony.
  function openNamingFor(fishId) {
    const fish = FISH.find(f => f.id === fishId);
    if (!canName(fish)) return;
    state.namingSpecies = fishId;
    $namingTitle.textContent = `Name your ${fish.name}!`;
    $namingHero.innerHTML = fishArt(fish, { cls: "naming-hero-art" });
    $namingGrid.innerHTML = "";
    for (const name of NAME_POOL) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "name-option";
      btn.textContent = name;
      btn.addEventListener("click", () => pickName(fishId, name, false));
      $namingGrid.appendChild(btn);
    }
    const surprise = document.createElement("button");
    surprise.type = "button";
    surprise.className = "name-option surprise";
    surprise.innerHTML = "🎲 <span>Surprise Me</span>";
    surprise.addEventListener("click", () => {
      const pool = NAME_POOL.filter(n => n !== prog.names[fishId]);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      pickName(fishId, pick, true);
    });
    $namingGrid.appendChild(surprise);
    modals.naming.open();
  }

  function pickName(fishId, name, isRandomPick = false) {
    prog.names[fishId] = name;
    saveProgression();
    const fish = FISH.find(f => f.id === fishId);
    if (fish) {
      track("legendary_named", {
        species_id: fish.id,
        species_name: fish.name,
        chosen_name: name,
        is_random_pick: !!isRandomPick,
      });
    }
    // Soft chime — single blip, no ceremony. Codex: "tap name, soft chime, done."
    if (!audioMuted()) blip({ key: "name", freq: 880, duration: 0.18, type: "sine", vol: 0.16 });
    modals.naming.close();
    if (state.albumOpen) renderAlbum();
  }

  function checkDailyGift() {
    const today = todayKey();
    const hasUndiscovered = FISH.some(f => !prog.discovered[f.id]);
    if (prog.lastGiftDate !== today && hasUndiscovered) {
      state.pendingDailyGift = true;
      // On the very first load there's nothing to return to — every cast is a new
      // discovery already, so the banner would feel redundant. Only trumpet it
      // for players coming back on a new day with at least some prior discoveries.
      if (prog.lastGiftDate) showDailyGiftBanner();
    }
  }

  function showDailyGiftBanner() {
    const n = document.createElement("div");
    n.className = "notif celebrate rarity-legendary";
    n.innerHTML = `
      <div class="notif-emoji">🎁</div>
      <div class="notif-text">
        <span class="notif-hat">Welcome back!</span>
        <span class="notif-title">Daily Gift waiting</span>
        <span class="notif-sub">Your next cast brings a new species.</span>
      </div>
    `;
    pushNotif(n, 4000);
  }

  // ---------- V12: Event lifecycle (impl) ----------

  maybeStartEvent = function(force = null) {
    // Already in a weather state — don't stack.
    if (state.activeEvent || state.pendingEvent) return;
    const shouldStart = force != null || window.__forceEvent != null || Math.random() < EVENT_CHANCE_PER_CAST;
    if (!shouldStart) return;
    const forcedId = force || window.__forceEvent;
    if (window.__forceEvent) window.__forceEvent = null;
    const event = forcedId ? eventById(forcedId) : EVENTS[Math.floor(Math.random() * EVENTS.length)];
    if (!event) return;
    schedulePendingEvent(event);
  };

  function schedulePendingEvent(event) {
    state.pendingEvent = { id: event.id, startsAt: Date.now() + EVENT_PENDING_MS };
    ensureWeatherTicker();
    showWeatherBanner(event);
    renderWeatherPill();
  }

  function startEvent(event) {
    state.pendingEvent = null;
    hideWeatherBanner();
    state.activeEvent = { id: event.id, endsAt: Date.now() + EVENT_DURATION_MS };
    document.body.classList.add("event-active", `event-${event.id}`);
    showEventStartNotif(event);
    playEventStartSound();
    renderWeatherPill();
    spawnEventFlair(event);
    ensureWeatherTicker();
  }

  function ensureWeatherTicker() {
    if (state.eventTickerId) return;
    state.eventTickerId = setInterval(tickEvent, 1000);
  }

  tickEvent = function() {
    // Pending → promote to active once its start time arrives.
    if (state.pendingEvent) {
      if (Date.now() >= state.pendingEvent.startsAt) {
        const event = eventById(state.pendingEvent.id);
        if (event) startEvent(event);
        return;
      }
      renderWeatherPill();
      return;
    }
    if (state.activeEvent) {
      if (Date.now() >= state.activeEvent.endsAt) { endEvent(); return; }
      renderWeatherPill();
      return;
    }
    // Idle with nothing to tick — stop the interval to keep things quiet.
    if (state.eventTickerId) { clearInterval(state.eventTickerId); state.eventTickerId = null; }
  };

  endEvent = function() {
    const event = state.activeEvent ? eventById(state.activeEvent.id) : null;
    state.activeEvent = null;
    if (state.eventTickerId) { clearInterval(state.eventTickerId); state.eventTickerId = null; }
    document.body.classList.remove("event-active", "event-storm", "event-rainbow", "event-moon");
    renderWeatherPill();
    clearEventFlair();
    if (event) showEventEndNotif(event);
  };

  function renderWeatherPill() {
    if (!$eventPill) return;
    // Pill is always visible — three states: active event, pending warning, idle sunny.
    if (state.activeEvent) {
      const event = eventById(state.activeEvent.id);
      if (!event) return;
      const remaining = Math.max(0, Math.ceil((state.activeEvent.endsAt - Date.now()) / 1000));
      const ratio = Math.max(0, Math.min(1, (state.activeEvent.endsAt - Date.now()) / EVENT_DURATION_MS));
      $eventPill.classList.remove("hidden");
      $eventPill.className = `event-pill active event-${event.id}`;
      $eventPill.innerHTML = `
        <span class="event-pill-emoji">${event.emoji}</span>
        <span class="event-pill-label">${event.name.toUpperCase()}</span>
        <span class="event-pill-timer">${remaining}s</span>
        <span class="event-pill-fill" style="--ratio:${ratio};"></span>
      `;
      return;
    }
    if (state.pendingEvent) {
      const event = eventById(state.pendingEvent.id);
      const flavor = EVENT_PENDING_FLAVOR[state.pendingEvent.id];
      if (!event || !flavor) return;
      const remaining = Math.max(0, Math.ceil((state.pendingEvent.startsAt - Date.now()) / 1000));
      $eventPill.classList.remove("hidden");
      $eventPill.className = `event-pill pending event-${event.id}`;
      $eventPill.innerHTML = `
        <span class="event-pill-emoji">${event.emoji}</span>
        <span class="event-pill-label">${flavor.pillLabel}</span>
        <span class="event-pill-timer">${remaining}s</span>
      `;
      return;
    }
    // Idle: ☀️ sunny ambient — the baseline 95%-of-the-time state.
    $eventPill.classList.remove("hidden");
    $eventPill.className = "event-pill idle";
    $eventPill.innerHTML = `
      <span class="event-pill-emoji">☀️</span>
      <span class="event-pill-label">Sunny</span>
    `;
  }

  // Retro pixelated "STORM BREWING" banner that sits over the pond during the
  // pending window. Fades in on schedule; fades out when the event actually
  // starts (the event itself takes center stage from then on).
  let $weatherBanner = null;
  function showWeatherBanner(event) {
    const flavor = EVENT_PENDING_FLAVOR[event.id];
    if (!flavor) return;
    if (!$weatherBanner) $weatherBanner = document.getElementById("weather-banner");
    if (!$weatherBanner) return;
    $weatherBanner.className = `weather-banner event-${event.id}`;
    $weatherBanner.innerHTML = `
      <span class="weather-banner-icon">${flavor.bannerIcon}</span>
      <span class="weather-banner-text">${event.name.toUpperCase()} ${flavor.verb}</span>
    `;
  }
  function hideWeatherBanner() {
    if (!$weatherBanner) $weatherBanner = document.getElementById("weather-banner");
    if (!$weatherBanner) return;
    $weatherBanner.className = "weather-banner hidden";
    $weatherBanner.innerHTML = "";
  }

  // Dev hook: skip the pending window so the active event fires next tick.
  window.__skipPending = () => {
    if (!state.pendingEvent) return "no pending event";
    state.pendingEvent.startsAt = Date.now() - 1;
    return `advanced ${state.pendingEvent.id}`;
  };
  // Dev hook: inspect music playback state.
  window.__musicState = () => ({
    unlocked: musicState.unlocked,
    started: musicState.started,
    upcoming: musicState.queue.slice(),
    activeSrc: musicState.active && musicState.active.src,
    activeVolume: musicState.active && musicState.active.volume,
    activePaused: musicState.active && musicState.active.paused,
    activeCurrent: musicState.active && musicState.active.currentTime,
    activeDuration: musicState.active && musicState.active.duration,
    standbySrc: musicState.standby && musicState.standby.src,
    standbyVolume: musicState.standby && musicState.standby.volume,
    standbyPaused: musicState.standby && musicState.standby.paused,
  });
  // Dev hook: immediately start the crossfade to the next track.
  window.__musicSkip = () => {
    crossfadeToNext();
    return "crossfading";
  };

  function showEventStartNotif(event) {
    const n = document.createElement("div");
    n.className = `notif celebrate event-notif event-${event.id}`;
    n.innerHTML = `
      <div class="notif-emoji">${event.emoji}</div>
      <div class="notif-text">
        <span class="notif-hat">✨ ${event.name.toUpperCase()}</span>
        <span class="notif-title">${event.name} rolled in!</span>
        <span class="notif-sub">Catch ${MUTATIONS[event.mutationId].adj.toLowerCase()} mutations — worth ${MUTATION_MULT}× pearls.</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.big);
  }

  function showEventEndNotif(event) {
    const n = document.createElement("div");
    n.className = "notif";
    n.innerHTML = `
      <div class="notif-emoji">${event.emoji}</div>
      <div class="notif-text">
        <span class="notif-title">${event.name} faded</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.regular);
  }

  // V12: per-event flair in the sky zone. Each event gets its own setup +
  // teardown so the sky actually *looks like* the weather, not just tinted.
  // `state.eventFlair` collects timers + DOM elements to clean up on end.
  const eventFlair = { timers: [], elements: [] };

  function spawnEventFlair(event) {
    clearEventFlair();
    if (event.id === "storm") startStormFlair();
    else if (event.id === "rainbow") startRainbowFlair();
    else if (event.id === "moon") startMoonFlair();
  }

  function clearEventFlair() {
    for (const t of eventFlair.timers) {
      clearTimeout(t); clearInterval(t);
    }
    eventFlair.timers = [];
    for (const el of eventFlair.elements) el.remove();
    eventFlair.elements = [];
  }

  // Storm: random lightning flashes every 2-6s. Each flash is a full-sky
  // white-out lasting ~160ms, plus a soft rumble via a short noise burst.
  function startStormFlair() {
    const skyZone = document.querySelector(".sky-zone");
    if (!skyZone) return;
    const scheduleNext = () => {
      const delay = 1800 + Math.random() * 4200;
      const t = setTimeout(() => {
        if (!state.activeEvent || state.activeEvent.id !== "storm") return;
        flashLightning(skyZone);
        scheduleNext();
      }, delay);
      eventFlair.timers.push(t);
    };
    scheduleNext();
  }

  function flashLightning(skyZone) {
    // Double-flash for realism — quick white, brief dark, second pop.
    const flash = document.createElement("div");
    flash.className = "lightning-flash";
    skyZone.appendChild(flash);
    eventFlair.elements.push(flash);
    setTimeout(() => { flash.remove(); }, 700);
    // Low rumble — mellow noise burst, not loud.
    if (!audioMuted()) {
      noiseBurst({ duration: 0.55, vol: 0.08, filterFreq: 260, filterSlide: 90, at: 0.06 });
      blip({ freq: 72, slideTo: 42, duration: 0.45, type: "sine", vol: 0.07, at: 0.08 });
    }
  }

  // Rainbow: mount a single SVG arc across the sky zone. Gentle shimmer.
  function startRainbowFlair() {
    const skyZone = document.querySelector(".sky-zone");
    if (!skyZone) return;
    const arc = document.createElement("div");
    arc.className = "rainbow-arc";
    arc.innerHTML = `
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="rainbow-shimmer" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>
        <path d="M 20 200 Q 200 -30 380 200" fill="none" stroke="#ff5a5a" stroke-width="10" filter="url(#rainbow-shimmer)" />
        <path d="M 20 200 Q 200 -18 380 200" fill="none" stroke="#ff9a3a" stroke-width="10" filter="url(#rainbow-shimmer)" />
        <path d="M 20 200 Q 200 -6 380 200"  fill="none" stroke="#ffd84a" stroke-width="10" filter="url(#rainbow-shimmer)" />
        <path d="M 20 200 Q 200 6 380 200"   fill="none" stroke="#5adc6a" stroke-width="10" filter="url(#rainbow-shimmer)" />
        <path d="M 20 200 Q 200 18 380 200"  fill="none" stroke="#4ab6ff" stroke-width="10" filter="url(#rainbow-shimmer)" />
        <path d="M 20 200 Q 200 30 380 200"  fill="none" stroke="#a26dff" stroke-width="10" filter="url(#rainbow-shimmer)" />
      </svg>
    `;
    skyZone.appendChild(arc);
    eventFlair.elements.push(arc);
  }

  // Moon: slow drifting moon across the sky zone, with soft glow.
  function startMoonFlair() {
    const skyZone = document.querySelector(".sky-zone");
    if (!skyZone) return;
    const moon = document.createElement("div");
    moon.className = "drifting-moon";
    moon.textContent = "🌕";
    skyZone.appendChild(moon);
    eventFlair.elements.push(moon);
    // Kick the CSS-driven drift.
    requestAnimationFrame(() => moon.classList.add("drifting"));
  }

  // Ascending two-note chime when an event begins — different from shiny so
  // the ear recognizes "something new in the world" vs "jackpot catch."
  function playEventStartSound() {
    if (audioMuted()) return;
    const k = "event";
    stopSoundKey(k);
    blip({ key: k, freq: 523, slideTo: 784, duration: 0.36, type: "triangle", vol: 0.14, attack: 0.01, release: 0.18 });
    blip({ key: k, freq: 784, slideTo: 1046, duration: 0.32, type: "sine",    vol: 0.10, attack: 0.02, release: 0.18, at: 0.18 });
    blip({ key: k, freq: 261, duration: 0.6, type: "triangle", vol: 0.05, at: 0.0 });
  }

  // ---------- V12: Profiles ----------

  let openProfilePicker, closeProfilePicker, openCreateProfile, closeCreateProfile;

  function renderProfileGrid() {
    const tiles = profiles.slots.map(slot => {
      const stats = peekSlotStats(slot.id);
      const isActive = slot.id === profiles.active;
      return `
        <button class="profile-card ${isActive ? "active" : ""}" data-slot-id="${slot.id}" type="button">
          <span class="profile-emoji">${slot.emoji}</span>
          <span class="profile-name">${escapeHtml(slot.name)}</span>
          <span class="profile-stats">
            <span>🫧 ${stats.pearls}</span>
            <span>📖 ${stats.discovered}</span>
          </span>
        </button>
      `;
    });
    if (profiles.slots.length < MAX_SLOTS) {
      tiles.push(`
        <button class="profile-card new-slot" id="profile-new-btn" type="button">
          <span class="profile-emoji">➕</span>
          <span class="profile-name">New Player</span>
        </button>
      `);
    }
    $profileGrid.innerHTML = tiles.join("");
    $profileGrid.querySelectorAll(".profile-card[data-slot-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-slot-id");
        if (id === profiles.active) {
          // Tapping your own tile from the Switch-Player flow just closes the picker.
          closeProfilePicker();
          return;
        }
        switchToProfile(id);
      });
    });
    const newBtn = document.getElementById("profile-new-btn");
    if (newBtn) newBtn.addEventListener("click", () => openCreateProfile());
  }

  function renderCreateProfile() {
    state.createProfileEmoji = PROFILE_EMOJIS[0];
    $createProfileName.value = "";
    $createProfileEmojis.innerHTML = PROFILE_EMOJIS.map((e, i) => `
      <button type="button" class="create-profile-emoji-btn ${i === 0 ? "selected" : ""}" data-emoji="${e}">${e}</button>
    `).join("");
    $createProfileEmojis.querySelectorAll(".create-profile-emoji-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        state.createProfileEmoji = btn.getAttribute("data-emoji");
        $createProfileEmojis.querySelectorAll(".create-profile-emoji-btn").forEach(b => b.classList.toggle("selected", b === btn));
        updateCreateSubmitEnabled();
      });
    });
    updateCreateSubmitEnabled();
    setTimeout(() => $createProfileName.focus(), 40);
  }

  function updateCreateSubmitEnabled() {
    const hasName = $createProfileName.value.trim().length > 0;
    $createProfileSubmit.disabled = !hasName;
  }

  function submitCreateProfile() {
    const name = $createProfileName.value.trim();
    if (!name) return;
    createProfile({ name, emoji: state.createProfileEmoji });
    try { sessionStorage.setItem(SKIP_PICKER_FLAG, "1"); } catch (e) {}
    location.reload();
  }

  // Lightweight escape for profile names rendered into innerHTML.
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  // ---------- Init ----------

  function init() {
    renderRods();
    renderCatches();
    updateBuffPills();
    renderNextGoal();
    renderPearls();
    renderDecorations();
    renderEdgeFlora();
    renderMuteToggle();
    renderWeatherPill();
    initMusic();
    // Browsers block cold autoplay — wait for the first user gesture.
    document.addEventListener("pointerdown", unlockMusic, { once: true, capture: true });
    for (let i = 0; i < MIN_AMBIENT; i++) spawnAmbient();
    // V6 prime a couple clouds so the sky isn't empty on first load.
    spawnSkyCloud();
    spawnSkyCloud();
    // V14: celestial body (sun/moon) + an initial pass of the day/night cycle.
    ensureCelestial();
    updateDayNight(true);
    // V14 prime 1 bg-ambient fish so the deep water isn't empty.
    spawnBgFish();
    requestAnimationFrame(tick);

    // Seed achievement-unlock state silently so pre-existing players don't
    // flood events for unlocks that happened before analytics was wired in.
    syncAchievementUnlocks({ silent: true });

    // Attach a stable per-kid dimension to every event so Sebastian can filter
    // "only Emma's events" in PostHog. Slot id, not display name — no PII.
    try { window.posthog && window.posthog.register && window.posthog.register({ profile_id: profiles.active }); } catch (e) {}

    // Explicit page_loaded so the event name in Live Events matches the task
    // vocabulary (autocaptured $pageview is still sent alongside).
    track("page_loaded", {
      user_agent: navigator.userAgent,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    });

    // Session end. iOS Safari often fires `visibilitychange` (hidden) when a
    // tab is backgrounded without ever firing `pagehide`. Listen for both and
    // gate on `sessionEnded` so we emit exactly once per load. PostHog uses
    // fetch-keepalive, so the event delivers on unload.
    function endSession() {
      if (sessionEnded) return;
      sessionEnded = true;
      track("session_duration", {
        duration_seconds: Math.round((Date.now() - sessionStartMs) / 1000),
        total_casts: sessionCasts,
        total_catches: sessionCatches,
        unique_species_caught: sessionSpecies.size,
      });
    }
    window.addEventListener("pagehide", endSession);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") endSession();
    });

    $castBtn.addEventListener("click", cast);
    $pond.addEventListener("click", (e) => {
      // Don't count clicks on decorations as cast triggers.
      if (e.target.classList.contains("decoration")) return;
      if (!state.casting) cast();
    });

    // V8.1: register all modals through one helper so they share open/close
    // behavior, aria-hidden toggling, state flags, backdrop-click dismissal,
    // and the unified ESC handler (below).
    modals.album        = makeModal({ overlay: $albumOverlay,        stateKey: "albumOpen",        onOpen: renderAlbum });
    modals.shop         = makeModal({ overlay: $shopOverlay,         stateKey: "shopOpen",         onOpen: renderShop });
    modals.tackleBag    = makeModal({ overlay: $tackleBagOverlay,    stateKey: "tackleBagOpen",    onOpen: renderRods });
    modals.achievements = makeModal({ overlay: $achievementsOverlay, stateKey: "achievementsOpen", onOpen: renderAchievements });
    modals.settings     = makeModal({ overlay: $settingsOverlay,     stateKey: "settingsOpen",     onOpen: () => { renderMuteToggle(); hideResetConfirm(); renderActiveProfileLabel(); }, onClose: hideResetConfirm });
    modals.naming       = makeModal({ overlay: $namingOverlay,       stateKey: "namingOpen",       onClose: () => { state.namingSpecies = null; } });
    modals.profile      = makeModal({ overlay: $profileOverlay,      stateKey: "profileOpen",      onOpen: renderProfileGrid });
    modals.createProfile = makeModal({ overlay: $createProfileOverlay, stateKey: "createProfileOpen", onOpen: renderCreateProfile });

    openProfilePicker  = modals.profile.open;       closeProfilePicker  = modals.profile.close;
    openCreateProfile  = modals.createProfile.open; closeCreateProfile  = modals.createProfile.close;

    // Back-compat function names used elsewhere in the file.
    openAlbum = modals.album.open; closeAlbum = modals.album.close;
    openShop  = modals.shop.open;  closeShop  = modals.shop.close;
    openTackleBag    = modals.tackleBag.open;    closeTackleBag    = modals.tackleBag.close;
    openAchievements = modals.achievements.open; closeAchievements = modals.achievements.close;
    openSettings     = modals.settings.open;     closeSettings     = modals.settings.close;

    // Wire triggers + close controls + backdrop clicks.
    $albumBtn.addEventListener("click", openAlbum);
    $shopBtn.addEventListener("click", openShop);
    $pearls.addEventListener("click", openShop);
    $tackleBagBtn.addEventListener("click", openTackleBag);
    $achievementsBtn.addEventListener("click", openAchievements);
    $settingsBtn.addEventListener("click", openSettings);

    for (const m of openModals) {
      const close = m.close;
      const overlay = m.overlay;
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
      const closeBtn = overlay.querySelector(".album-close");
      if (closeBtn) closeBtn.addEventListener("click", close);
    }

    // One ESC handler — closes every open modal (each close() is idempotent).
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      for (const m of openModals) if (state[m.stateKey]) m.close();
    });

    // Bulk press-and-hold (500ms, per Codex — prevents accidental kid taps).
    // Shared across Sell-All and Eat-All so behavior stays symmetrical.
    function wireBulkHold(btn, action) {
      let holdTimer = null;
      const start = (e) => {
        e.preventDefault();
        if (state.eatingAll || $bulkActions.classList.contains("empty")) return;
        btn.classList.add("holding");
        holdTimer = setTimeout(() => {
          btn.classList.remove("holding");
          action();
        }, 500);
      };
      const cancel = () => {
        btn.classList.remove("holding");
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", cancel);
      btn.addEventListener("pointerleave", cancel);
      btn.addEventListener("pointercancel", cancel);
    }
    wireBulkHold($sellAllBtn, sellAll);
    wireBulkHold($eatAllBtn, eatAll);

    // Settings reset flow (modal open/close wired via makeModal above).
    $muteToggle.addEventListener("click", toggleMute);
    $resetBtn.addEventListener("click", showResetConfirm);
    $resetCancel.addEventListener("click", hideResetConfirm);
    $resetYes.addEventListener("click", performReset);

    // V12: profile switcher + create-profile form.
    $switchProfileBtn.addEventListener("click", () => {
      closeSettings();
      // Show a close button this time — switcher is dismissable (boot flow isn't).
      $profileClose.classList.remove("hidden");
      openProfilePicker();
    });
    $createProfileName.addEventListener("input", updateCreateSubmitEnabled);
    $createProfileName.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !$createProfileSubmit.disabled) submitCreateProfile();
    });
    $createProfileSubmit.addEventListener("click", submitCreateProfile);

    // Auto-open the picker on boot when 2+ profiles exist and we didn't just
    // come back from a picker selection (sessionStorage flag avoids reload loops).
    const skip = sessionStorage.getItem(SKIP_PICKER_FLAG) === "1";
    if (skip) sessionStorage.removeItem(SKIP_PICKER_FLAG);
    if (!skip && profiles.slots.length >= 2) {
      // Initial picker is non-dismissable — must choose someone.
      $profileClose.classList.add("hidden");
      openProfilePicker();
    }

    // Daily gift check — briefly after load so the notif has somewhere to land.
    setTimeout(checkDailyGift, 600);
  }

  function renderActiveProfileLabel() {
    const p = activeProfile();
    const label = p ? `${p.emoji} ${p.name}` : "Player";
    if ($activeProfileName) $activeProfileName.textContent = label;
    if ($resetConfirmName) $resetConfirmName.textContent = p ? `${p.name}'s` : "this player's";
  }

  // ---------- V5 Settings / Reset ----------

  // openSettings / closeSettings live on `modals.settings` (see makeModal block).

  function renderMuteToggle() {
    const on = !prog.muted;
    $muteToggle.setAttribute("aria-checked", on ? "true" : "false");
    $muteToggle.classList.toggle("off", !on);
    $muteToggle.querySelector(".mute-state").textContent = on ? "On" : "Off";
  }

  function toggleMute() {
    prog.muted = !prog.muted;
    saveProgression();
    renderMuteToggle();
    if (prog.muted) {
      pauseMusic();
    } else {
      // If unmuting, chirp a short confirmation so the user hears it works.
      playFile("common");
      resumeMusic();
    }
  }

  let resetCountdownTimer = null;
  function showResetConfirm() {
    $resetConfirm.classList.remove("hidden");
    // 3-second forced wait before the "Yes, erase" button enables — kid-safe.
    let remaining = 3;
    $resetYes.disabled = true;
    $resetYes.textContent = `Yes, erase (${remaining})`;
    if (resetCountdownTimer) clearInterval(resetCountdownTimer);
    resetCountdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resetCountdownTimer);
        resetCountdownTimer = null;
        $resetYes.disabled = false;
        $resetYes.textContent = "Yes, erase everything";
      } else {
        $resetYes.textContent = `Yes, erase (${remaining})`;
      }
    }, 1000);
  }
  function hideResetConfirm() {
    $resetConfirm.classList.add("hidden");
    if (resetCountdownTimer) { clearInterval(resetCountdownTimer); resetCountdownTimer = null; }
  }
  function performReset() {
    // V12: reset is scoped to the active profile only. Other players' saves
    // (and the profile roster itself) survive untouched.
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    try { sessionStorage.setItem(SKIP_PICKER_FLAG, "1"); } catch (e) {}
    location.reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

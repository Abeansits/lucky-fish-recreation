// Lucky Fish — vanilla JS game.
// Design rules: no backend, every cast produces something.
// V2 adds localStorage progression (rod unlocks, discovery album, milestones, daily gift).

(() => {
  "use strict";

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
    // V10: the rarest fish in the pond. `weight` override drops it to ~1/4 the
    // base mythic weight — in-tier but still the top of the ladder.
    { id: "chickennugget", name: "Chicken Nugget Fish", emoji: "🍗", rarity: "mythic", hue: 0, weight: 0.25 },
  ];

  // V8.1 pacing tune (25-min completion was too fast). Legendary + mythic
  // weights cut roughly in half so a full album run feels like a real hunt.
  // Common/uncommon/rare untouched so early-game momentum stays punchy.
  const TIER_WEIGHT = { common: 40, uncommon: 30, rare: 20, legendary: 6, mythic: 1 };
  const TIER_COLOR  = { common: "#4caf50", uncommon: "#3a8dde", rare: "#a05ad8", legendary: "#f2b33a", mythic: "#d83bff" };
  const TIER_LABEL  = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary", mythic: "Mythic" };

  const RODS = [
    {
      id: "basic", name: "Trusty Stick", emoji: "🪵",
      desc: "A reliable starter rod.", luck: 1.0,
      unlock: null, // always available
    },
    {
      id: "lucky", name: "Lucky Rod", emoji: "🍀",
      desc: "Nudges rare catches your way.", luck: 1.5,
      unlock: { totalCatches: 10, label: "Catch 10 fish" },
    },
    {
      id: "hunter", name: "Rare Hunter", emoji: "🎯",
      desc: "Chases rarer fish hard.", luck: 2.0,
      unlock: { totalCatches: 25, rareCatches: 3, label: "Catch 25 fish & 3 rares" },
    },
    {
      id: "legend", name: "Legend Reeler", emoji: "🌟",
      desc: "Strong pull on rare & legendary.", luck: 3.0,
      unlock: { totalCatches: 60, legendaryCatches: 2, label: "Catch 60 fish & 2 legendaries" },
    },
    // Ultra-rare endgame rods. Luck applies to rare + legendary + mythic.
    {
      id: "moonlit", name: "Moonlit Reel", emoji: "🌙",
      desc: "Pulls from deeper waters.", luck: 4.0,
      unlock: { totalCatches: 100, legendaryCatches: 5, label: "Catch 100 fish & 5 legendaries" },
    },
    {
      id: "starcatcher", name: "Starcatcher", emoji: "⭐",
      desc: "Catches myths.", luck: 5.0,
      unlock: { totalCatches: 200, mythicCatches: 3, label: "Catch 200 fish & 3 mythics" },
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

  // ---------- V3 additions ----------

  // 1 / SHINY_DENOM roll on every catch. Codex called: 1/500 lands a shiny
  // about every ~12 min of casual play — rare enough to feel special, not so
  // rare a session goes by without one.
  const SHINY_DENOM = 500;

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
  const STORAGE_KEY = "luckyFish.v3";
  const LEGACY_KEYS = ["luckyFish.v2"]; // migrate older saves forward

  function freshProgression() {
    return {
      totals: { all: 0, common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0, shinies: 0, bySpecies: {} },
      discovered: {}, // speciesId -> firstCaughtAt (ms epoch)
      shinyDiscovered: {}, // speciesId -> firstCaughtAt
      unlocks: { basic: true, lucky: false, hunter: false, legend: false, moonlit: false, starcatcher: false },
      selectedRod: "basic",
      milestonesSeen: { firstLegendary: false, albumComplete: false, firstShiny: false, allDecorations: false, firstMythic: false },
      lastGiftDate: null,
      pearls: 0,
      decorationsOwned: {},
      muted: false,
      names: {}, // V9: speciesId -> chosen name (legendary+mythic only)
    };
  }

  function loadProgression() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Migrate V2 → V3: same schema, just carries pearls/decorations in at 0/{}.
        for (const key of LEGACY_KEYS) {
          const legacy = localStorage.getItem(key);
          if (legacy) { raw = legacy; break; }
        }
      }
      if (!raw) return freshProgression();
      const parsed = JSON.parse(raw);
      const fresh = freshProgression();
      return {
        totals: { ...fresh.totals, ...(parsed.totals || {}),
          bySpecies: { ...(parsed.totals?.bySpecies || {}) } },
        discovered: { ...(parsed.discovered || {}) },
        shinyDiscovered: { ...(parsed.shinyDiscovered || {}) },
        unlocks: { ...fresh.unlocks, ...(parsed.unlocks || {}) },
        selectedRod: parsed.selectedRod || "basic",
        milestonesSeen: { ...fresh.milestonesSeen, ...(parsed.milestonesSeen || {}) },
        lastGiftDate: parsed.lastGiftDate || null,
        pearls: Number(parsed.pearls) || 0,
        decorationsOwned: { ...(parsed.decorationsOwned || {}) },
        muted: parsed.muted === true,
        names: { ...(parsed.names || {}) },
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
    eatingAll: false,
    autoReel: null,       // { endsAt, totalMs } — set by shiny-eat, chains casts until expiry
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

  function playCrunchCascade(scale = 1.0) {
    // Short gulp — single invocation; we call this per fish in the cascade
    // with slight pitch variation.
    const base = 260 + (Math.random() * 80 - 40);
    noiseBurst({ duration: 0.08, vol: 0.1 * scale, filterFreq: 900, filterSlide: 250 });
    blip({ freq: base, slideTo: base / 2, duration: 0.18, type: "triangle", vol: 0.13 * scale });
  }

  // ---------- Rendering ----------

  function isRodUnlocked(rod) {
    if (!rod.unlock) return true;
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

      const prog_ = rodUnlockProgress(rod);
      const lockLine = unlocked
        ? `${rod.desc} <em>(${rod.luck.toFixed(1)}× luck)</em>`
        : `🔒 ${prog_.label} · ` + prog_.need
            .map(n => `${Math.min(n.current, n.target)}/${n.target} ${n.noun}`)
            .join(", ");

      btn.innerHTML = `
        <span class="rod-emoji">${rodArt(rod)}</span>
        <span class="rod-body">
          <span class="rod-name">${rod.name}</span>
          <span class="rod-desc">${lockLine}</span>
          ${!unlocked ? `<span class="rod-bar"><span class="rod-bar-fill" style="width:${(prog_.ratio * 100).toFixed(0)}%"></span></span>` : ""}
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

  function renderCatches() {
    const entries = [...state.inventory.entries()].filter(([, n]) => n > 0);
    if (entries.length === 0) {
      $catches.innerHTML = `<div class="empty-catches">No catches yet — give it a cast!</div>`;
      $eatAllBtn.classList.add("hidden");
      return;
    }
    // Shinies first, then legendary→common, then by name.
    const rarityOrder = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
    entries.sort((a, b) => {
      const pa = parseInvKey(a[0]);
      const pb = parseInvKey(b[0]);
      const fa = FISH.find(f => f.id === pa.fishId);
      const fb = FISH.find(f => f.id === pb.fishId);
      if (pa.isShiny !== pb.isShiny) return pa.isShiny ? -1 : 1;
      return (rarityOrder[fa.rarity] - rarityOrder[fb.rarity]) || fa.name.localeCompare(fb.name);
    });

    $catches.innerHTML = "";
    for (const [key, count] of entries) {
      const { fishId, isShiny } = parseInvKey(key);
      const fish = FISH.find(f => f.id === fishId);
      const entry = document.createElement("div");
      entry.className = "catch-entry" + (isShiny ? " is-shiny" : "");
      entry.dataset.entryKey = key;
      const starPrefix = isShiny ? '<span class="catch-star">✨</span> ' : "";
      const nameLabel = `${starPrefix}${isShiny ? "Shiny " : ""}${fish.name}`;
      entry.innerHTML = `
        <div class="catch-bar rarity-${fish.rarity}"></div>
        <div class="catch-emoji ${isShiny ? "shiny" : ""}">${fishArt(fish, { isShiny })}</div>
        <div class="catch-info">
          <span class="catch-name">${nameLabel}</span>
          <span class="catch-count">${TIER_LABEL[fish.rarity]} · x${count}</span>
        </div>
        <button class="eat-btn" data-eat-key="${key}">Eat</button>
      `;
      entry.querySelector(".eat-btn").addEventListener("click", () => eatFish(fishId, isShiny));
      $catches.appendChild(entry);
    }

    // Show Eat All only when there's enough to make batching meaningful.
    const totalFish = entries.reduce((s, [, n]) => s + n, 0);
    if (totalFish >= 2) $eatAllBtn.classList.remove("hidden");
    else $eatAllBtn.classList.add("hidden");
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

  function invKey(fishId, isShiny) {
    return isShiny ? `${fishId}:shiny` : fishId;
  }
  function parseInvKey(key) {
    const [fishId, shinyTag] = key.split(":");
    return { fishId, isShiny: shinyTag === "shiny" };
  }

  function addFish(fishId, isShiny, count = 1) {
    const key = invKey(fishId, isShiny);
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
    let winner = pickFish({ forceUndiscovered: isGift });
    // Dev/test hook: force the next catch to a specific rarity (e.g. "mythic").
    // Normal play never sets window.__forceRarity.
    if (window.__forceRarity) {
      const pool = FISH.filter(f => f.rarity === window.__forceRarity);
      if (pool.length) winner = pool[Math.floor(Math.random() * pool.length)];
      window.__forceRarity = null;
    }
    const isShiny = window.__forceShiny === true || Math.random() < (1 / SHINY_DENOM);
    if (window.__forceShiny) window.__forceShiny = false;
    state.pendingCatch = { fish: winner, isShiny, isGift };

    // V4: slot-machine reel during the suspense beat — now lands on `winner`.
    startCastReel(duration, winner);

    setTimeout(() => {
      // Brief landing pause so the winner is visibly centered before the reel
      // hides and the catch notification takes over.
      flashReelRarity(winner.rarity);
      setTimeout(() => {
        stopCastReel();
        resolveCatch();
        state.casting = false;
        $castBtn.disabled = false;
        $pond.classList.remove("casting");
        $pond.style.animationDuration = "";
        if (isAutoReelActive()) scheduleNextAutoCast();
      }, 260);
    }, duration);
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
    $castReel.classList.remove("landing", "rarity-common", "rarity-uncommon", "rarity-rare", "rarity-legendary");
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
    let fish, isShiny, isGift;
    if (state.pendingCatch) {
      ({ fish, isShiny, isGift } = state.pendingCatch);
      state.pendingCatch = null;
    } else {
      isGift = state.pendingDailyGift && undiscoveredSpecies().length > 0;
      fish = pickFish({ forceUndiscovered: isGift });
      isShiny = Math.random() < (1 / SHINY_DENOM);
    }
    if (isGift) {
      state.pendingDailyGift = false;
      prog.lastGiftDate = todayKey();
    }

    const isFirstCatch = !prog.discovered[fish.id];
    const isFirstShiny = isShiny && !prog.shinyDiscovered[fish.id];

    recordCatch(fish, isShiny);

    // Audio + celebration: shiny trumps everything else; mythic trumps legendary.
    if (isShiny) {
      playShinySound();
      showShinySequence(fish, { isFirstShiny });
      showShinyCelebration(fish, { isFirstShiny });
    } else if (fish.rarity === "mythic") {
      playMythicSequence(fish, { isFirstCatch, isGift });
    } else if (fish.rarity === "legendary") {
      // V4 full treatment — hit-stop + screen shake + LEGENDARY banner + confetti waves.
      playLegendarySequence(fish, { isFirstCatch, isGift });
    } else if (isFirstCatch) {
      playCatchSound(fish.rarity === "common" ? "common" : fish.rarity); // uses the matching MP3
      showFirstCatchCelebration(fish, { fromGift: isGift });
      burstCelebration(fish);
    } else {
      playCatchSound(fish.rarity);
      showCatchNotification(fish, { fromGift: isGift });
    }

    // Double Catch roll (independent, after the primary catch is committed).
    // Shiny flag carries to the duplicate — same caught fish.
    const dc = state.buffs.get("double");
    if (dc && Math.random() < dc.value) {
      addFish(fish.id, isShiny, 1);
      recordCatchCount(fish, isShiny);
      showDoubleCatchNotification(fish);
    }

    checkMilestones(fish, isShiny);
    addFish(fish.id, isShiny, 1);
    renderCatches();
    renderNextGoal();
    renderRods();
    if (state.albumOpen) renderAlbum();
    if (state.achievementsOpen) renderAchievements();
    saveProgression();
  }

  function recordCatch(fish, isShiny) {
    if (!prog.discovered[fish.id]) prog.discovered[fish.id] = Date.now();
    if (isShiny && !prog.shinyDiscovered[fish.id]) prog.shinyDiscovered[fish.id] = Date.now();
    recordCatchCount(fish, isShiny);
  }

  function recordCatchCount(fish, isShiny) {
    prog.totals.all += 1;
    prog.totals[fish.rarity] = (prog.totals[fish.rarity] || 0) + 1;
    if (isShiny) prog.totals.shinies = (prog.totals.shinies || 0) + 1;
    prog.totals.bySpecies[fish.id] = (prog.totals.bySpecies[fish.id] || 0) + 1;
    // Rod unlock checks
    for (const rod of RODS) {
      if (rod.unlock && !prog.unlocks[rod.id]) {
        const u = rod.unlock;
        const ok =
          (u.totalCatches == null || prog.totals.all >= u.totalCatches) &&
          (u.rareCatches == null || prog.totals.rare >= u.rareCatches) &&
          (u.legendaryCatches == null || prog.totals.legendary >= u.legendaryCatches) &&
          (u.mythicCatches == null || (prog.totals.mythic || 0) >= u.mythicCatches);
        if (ok) {
          prog.unlocks[rod.id] = true;
          showRodUnlock(rod);
        }
      }
    }
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

  function pearlsForCatch(fish, isShiny) {
    const base = PEARLS_PER_TIER[fish.rarity] || 1;
    const starMult = fish.id === getTodaysStarFishId() ? 2 : 1;
    return (isShiny ? base * SHINY_MULT : base) * starMult;
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

  function eatFish(fishId, isShiny) {
    const key = invKey(fishId, isShiny);
    const count = state.inventory.get(key) || 0;
    if (count <= 0) return;
    const fish = FISH.find(f => f.id === fishId);
    state.inventory.set(key, count - 1);

    const gained = pearlsForCatch(fish, isShiny);
    grantPearls(gained, { atEl: document.querySelector(`[data-eat-key="${key}"]`) || $catches });

    applyTierBuff(fish);

    playEatSound();
    showEatNotification(fish, TIER_BUFF[fish.rarity], { isShiny, pearls: gained });
    renderCatches();
    updateBuffPills();
    if (isShiny) startAutoReel();
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
  }

  function renderPearls() {
    $pearls.querySelector(".pearls-count").textContent = prog.pearls.toLocaleString();
    $pearls.classList.remove("popping");
    // Force reflow to restart the animation
    void $pearls.offsetWidth;
    $pearls.classList.add("popping");
    if (state.shopOpen) renderShop();
  }

  // ---------- Eat All ----------

  function eatAll() {
    if (state.eatingAll) return;
    const entries = [...state.inventory.entries()].filter(([, n]) => n > 0);
    if (entries.length === 0) return;
    state.eatingAll = true;

    // Figure out buffs to apply — one per type, take the highest-tier source.
    const tierOrder = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };
    const bestPerType = new Map(); // buffType -> { fish, tierRank }
    let totalPearls = 0;
    let ateShiny = false;

    for (const [key, count] of entries) {
      const { fishId, isShiny } = parseInvKey(key);
      const fish = FISH.find(f => f.id === fishId);
      if (!fish) continue;
      if (isShiny) ateShiny = true;
      const buff = TIER_BUFF[fish.rarity];
      const prev = bestPerType.get(buff.type);
      if (!prev || tierOrder[fish.rarity] > tierOrder[prev.fish.rarity]) {
        bestPerType.set(buff.type, { fish, tierRank: tierOrder[fish.rarity] });
      }
      totalPearls += pearlsForCatch(fish, isShiny) * count;
    }

    // Create fly-in animations, one per entry (count shown on the label).
    const catchesRect = $catches.getBoundingClientRect();
    const eatAllRect = $eatAllBtn.getBoundingClientRect();
    const targetX = eatAllRect.left + eatAllRect.width / 2;
    const targetY = eatAllRect.top + eatAllRect.height / 2;

    let staggerDelay = 0;
    const perItemDelay = 70;

    for (const [key, count] of entries) {
      const { fishId, isShiny } = parseInvKey(key);
      const fish = FISH.find(f => f.id === fishId);
      if (!fish) continue;
      const entryEl = document.querySelector(`[data-entry-key="${key}"]`);
      const rect = entryEl ? entryEl.getBoundingClientRect() : catchesRect;
      const startX = rect.left + 50;
      const startY = rect.top + rect.height / 2;

      setTimeout(() => {
        flyingFish(fish, isShiny, startX, startY, targetX, targetY, count);
        playCrunchCascade(entries.length > 3 ? 0.8 : 1.0);
      }, staggerDelay);
      staggerDelay += perItemDelay;
    }

    // After all particles land, apply buffs + pearls + clear inventory.
    const resolveAt = staggerDelay + 650;
    setTimeout(() => {
      // Stagger buff applications low→high rarity so the climax lands on the best buff.
      const BUFF_STAGGER_MS = 180;
      const buffList = [...bestPerType.values()]
        .sort((a, b) => tierOrder[a.fish.rarity] - tierOrder[b.fish.rarity]);
      buffList.forEach(({ fish }, i) => {
        setTimeout(() => {
          applyTierBuff(fish);
          updateBuffPills();
        }, i * BUFF_STAGGER_MS);
      });
      // Grant pearls in one big pop near the counter.
      grantPearls(totalPearls, { atEl: $eatAllBtn });
      // Clear inventory.
      state.inventory.clear();
      renderCatches();
      if (ateShiny) startAutoReel();
      state.eatingAll = false;
      saveProgression();
    }, resolveAt);

    // Eat All summary toast
    const types = [...bestPerType.values()].map(b => TIER_BUFF[b.fish.rarity].label).join(" · ");
    const summary = document.createElement("div");
    summary.className = "notif celebrate rarity-legendary";
    summary.innerHTML = `
      <div class="notif-emoji">🍽️</div>
      <div class="notif-text">
        <span class="notif-title">Chomped the lot!</span>
        <span class="notif-sub">+${totalPearls} 🫧 · ${types || "no buffs"}</span>
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

  function showRodUnlock(rod) {
    const n = document.createElement("div");
    n.className = "notif celebrate rarity-legendary";
    n.innerHTML = `
      <div class="notif-emoji">${rodArt(rod)}</div>
      <div class="notif-text">
        <span class="notif-hat">🔓 New rod unlocked!</span>
        <span class="notif-title">${rod.name}</span>
        <span class="notif-sub">${rod.desc}</span>
      </div>
    `;
    pushNotif(n, NOTIF_HOLD.big); // V6: rod unlock is a "big event"
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

  function showEatNotification(fish, buffTemplate, { isShiny = false, pearls = 0 } = {}) {
    const n = document.createElement("div");
    n.className = `notif rarity-${fish.rarity}` + (isShiny ? " celebrate" : "");
    const emojiCls = isShiny ? "shiny" : "";
    const title = isShiny ? `Yum! Shiny ${fish.name} ✨` : `Yum! ${fish.name}`;
    const sub = `${buffTemplate.label} for ${buffTemplate.duration}s${pearls ? ` · +${pearls} 🫧` : ""}`;
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
        <span class="notif-sub">${isFirstShiny ? "Added to your Album" : TIER_LABEL[fish.rarity]} · ${pearlsForCatch(fish, true)} 🫧 on eat</span>
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
    const intensity = shinySessionCount === 1 ? 1 : 0.7;

    const overlay = document.createElement("div");
    overlay.className = "shiny-overlay";
    overlay.style.opacity = `${intensity}`;
    const glints = document.createElement("div");
    glints.className = "glints";
    for (let i = 0; i < 14; i++) {
      const g = document.createElement("div");
      g.className = "glint";
      g.textContent = "✨";
      g.style.setProperty("--x", `${20 + Math.random() * 60}%`);
      g.style.setProperty("--y", `${15 + Math.random() * 70}%`);
      g.style.setProperty("--sz", `${1.1 + Math.random() * 1.4}rem`);
      g.style.setProperty("--d", `${Math.random() * 500}ms`);
      glints.appendChild(g);
    }
    overlay.appendChild(glints);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 960);
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

  // ---------- V5 edge flora ----------
  function renderEdgeFlora() {
    const flora = document.getElementById("edge-flora");
    if (!flora) return;
    if (flora.dataset.rendered === "1") return;
    flora.dataset.rendered = "1";
    // Three clumps — left seaweed, center coral, right seaweed.
    const items = [
      { emoji: "🌿", cls: "sway", left: "6%" },
      { emoji: "🪸", cls: "coral", left: "48%" },
      { emoji: "🌿", cls: "sway reverse", left: "90%" },
    ];
    for (const it of items) {
      const el = document.createElement("div");
      el.className = `flora ${it.cls}`;
      el.style.left = it.left;
      el.textContent = it.emoji;
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

  // ---------- V6 sky ambient: clouds + dragonfly ----------
  const $skyAmbient = document.getElementById("sky-ambient");
  const skyTracker = new Set();

  function spawnSkyCloud() {
    if (!$skyAmbient) return;
    const c = document.createElement("div");
    c.className = "sky-cloud";
    c.textContent = "☁️";
    const scale = 0.8 + Math.random() * 0.8;
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

  function spawnDragonfly() {
    if (!$skyAmbient) return;
    const d = document.createElement("div");
    d.className = "sky-dragonfly";
    d.textContent = "🦋"; // stand-in — kid-readable; dragonfly emoji is inconsistent across platforms
    d.style.top = `${30 + Math.random() * 40}%`;
    const dirLR = Math.random() < 0.5;
    d.style.left = dirLR ? "-10%" : "110%";
    const duration = 9 + Math.random() * 6;
    d.style.transition = `left ${duration}s linear`;
    if (!dirLR) d.style.transform = "scaleX(-1)";
    $skyAmbient.appendChild(d);
    skyTracker.add(d);
    requestAnimationFrame(() => { d.style.left = dirLR ? "110%" : "-10%"; });
    const done = () => { skyTracker.delete(d); d.remove(); };
    d.addEventListener("transitionend", done, { once: true });
    setTimeout(done, duration * 1000 + 1000);
  }

  function skyLoop() {
    // Keep 2-3 clouds drifting. Dragonflies show up less often (1 at a time).
    const clouds = [...skyTracker].filter(el => el.classList.contains("sky-cloud"));
    const dragonflies = [...skyTracker].filter(el => el.classList.contains("sky-dragonfly"));
    if (clouds.length < 2) spawnSkyCloud();
    else if (clouds.length < 3 && Math.random() < 0.08) spawnSkyCloud();
    if (dragonflies.length === 0 && Math.random() < 0.04) spawnDragonfly();
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
    // V6 sky ambient — clouds drifting, occasional dragonfly.
    if (Math.random() < 0.02) skyLoop();
    requestAnimationFrame(tick);
  }

  // ---------- Next Goal strip ----------

  function renderNextGoal() {
    const nextRod = RODS.find(r => r.unlock && !prog.unlocks[r.id]);
    const albumRemaining = FISH.length - Object.keys(prog.discovered).length;

    if (nextRod) {
      const p = rodUnlockProgress(nextRod);
      const currentDesc = p.need
        .map(n => `${Math.min(n.current, n.target)}/${n.target}`)
        .join(" · ");
      $nextGoal.className = "next-goal";
      $nextGoal.innerHTML = `
        <span class="next-goal-emoji">${rodArt(nextRod)}</span>
        <span class="next-goal-text">
          <span class="next-goal-head">Next rod</span>
          <span class="next-goal-label">${nextRod.name} — ${currentDesc}</span>
        </span>
        <span class="next-goal-bar"><span class="next-goal-bar-fill" style="width:${(p.ratio * 100).toFixed(0)}%"></span></span>
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
    const starId = getTodaysStarFishId();
    const starFish = FISH.find(f => f.id === starId);
    const starCaught = !!prog.discovered[starId];
    const starHint = starFish
      ? `<span class="album-star-hint"${starCaught ? "" : ' title="Mystery fish — can you find them today?"'}>🌟 Today's Star: <strong>${starCaught ? starFish.name : "???"}</strong></span>`
      : "";
    $albumProgress.innerHTML = `${discovered} / ${FISH.length} discovered${shiniesFound ? ` · ✨ ${shiniesFound} shiny` : ""}${starHint ? ` · ${starHint}` : ""}`;
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
      card.innerHTML = `
        <span class="album-rarity-badge" aria-hidden="true"></span>
        ${gotShiny ? '<span class="shiny-badge" title="Shiny caught!">✨</span>' : ""}
        ${isStar ? '<span class="star-ribbon" title="Today\'s Star — 2× pearls on eat">🌟</span>' : ""}
        ${stampHTML}
        <span class="${emojiClass}">${fishDisplay}</span>
        <div class="album-name">${got ? fish.name : "???"}</div>
        <div class="album-sub">${got ? `${TIER_LABEL[fish.rarity]} · Caught ${count}×` : TIER_LABEL[fish.rarity]}</div>
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
      el.textContent = deco.emoji;
      (deco.surface && surfaceLayer ? surfaceLayer : $decorations).appendChild(el);
    });
  }

  function renderShop() {
    $shopPearls.textContent = prog.pearls.toLocaleString();
    $shopGrid.innerHTML = "";
    for (const deco of DECORATIONS) {
      const owned = !!prog.decorationsOwned[deco.id];
      const canAfford = prog.pearls >= deco.price;
      const card = document.createElement("div");
      card.className = "shop-card" + (owned ? " owned" : (canAfford ? "" : " locked"));
      card.innerHTML = `
        <span class="shop-card-emoji">${deco.emoji}</span>
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
      btn.addEventListener("click", () => pickName(fishId, name));
      $namingGrid.appendChild(btn);
    }
    const surprise = document.createElement("button");
    surprise.type = "button";
    surprise.className = "name-option surprise";
    surprise.innerHTML = "🎲 <span>Surprise Me</span>";
    surprise.addEventListener("click", () => {
      const pool = NAME_POOL.filter(n => n !== prog.names[fishId]);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      pickName(fishId, pick);
    });
    $namingGrid.appendChild(surprise);
    modals.naming.open();
  }

  function pickName(fishId, name) {
    prog.names[fishId] = name;
    saveProgression();
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
    for (let i = 0; i < MIN_AMBIENT; i++) spawnAmbient();
    // V6 prime a couple clouds so the sky isn't empty on first load.
    spawnSkyCloud();
    spawnSkyCloud();
    requestAnimationFrame(tick);

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
    modals.settings     = makeModal({ overlay: $settingsOverlay,     stateKey: "settingsOpen",     onOpen: () => { renderMuteToggle(); hideResetConfirm(); }, onClose: hideResetConfirm });
    modals.naming       = makeModal({ overlay: $namingOverlay,       stateKey: "namingOpen",       onClose: () => { state.namingSpecies = null; } });

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

    // Eat-All press-and-hold (500ms, per Codex — prevents accidental kid taps).
    let holdTimer = null;
    const startHold = (e) => {
      e.preventDefault();
      if (state.eatingAll || $eatAllBtn.classList.contains("hidden")) return;
      $eatAllBtn.classList.add("holding");
      holdTimer = setTimeout(() => {
        $eatAllBtn.classList.remove("holding");
        eatAll();
      }, 500);
    };
    const cancelHold = () => {
      $eatAllBtn.classList.remove("holding");
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    };
    $eatAllBtn.addEventListener("pointerdown", startHold);
    $eatAllBtn.addEventListener("pointerup", cancelHold);
    $eatAllBtn.addEventListener("pointerleave", cancelHold);
    $eatAllBtn.addEventListener("pointercancel", cancelHold);

    // Settings reset flow (modal open/close wired via makeModal above).
    $muteToggle.addEventListener("click", toggleMute);
    $resetBtn.addEventListener("click", showResetConfirm);
    $resetCancel.addEventListener("click", hideResetConfirm);
    $resetYes.addEventListener("click", performReset);

    // Daily gift check — briefly after load so the notif has somewhere to land.
    setTimeout(checkDailyGift, 600);
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
    // If unmuting, chirp a short confirmation so the user hears it works.
    if (!prog.muted) playFile("common");
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
    try { localStorage.removeItem(STORAGE_KEY); for (const k of LEGACY_KEYS) localStorage.removeItem(k); } catch (e) {}
    // Hard reload to reset in-memory state cleanly.
    location.reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

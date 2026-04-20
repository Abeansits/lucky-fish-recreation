# Lucky Fish — Requirements

## Premise

A small, cheerful fishing game for kids. The player picks a fishing rod, casts a line into a pond, and collects fish. Catching fish is the core loop. Eating fish grants short, helpful powers that make more catches happen or make better catches more likely. There is no way to lose. There is no timer pressing down. It is a forgiving, punchy collect-a-thon where every cast produces something to celebrate.

## Target Audience

Sebastian's kids. Age-appropriate. Forgiving — no death, no reset, no "game over." Punchy rewards — every interaction produces clear positive feedback (sound, animation, notification). Readable at a glance — fish are represented by recognizable pictographs. No reading-heavy menus. One-click actions.

## Core Loop

1. Pick a rod.
2. Cast the line.
3. A short suspense beat plays.
4. A fish is caught. It is added to a collection.
5. Optionally, eat a fish from the collection to receive a short power-up.
6. Cast again. Go forever.

There is no end state, no loss state, no failure. The player cannot "die" or be forced to restart. Casting always produces a fish.

## Controls

- Single-pointer interaction throughout. Designed for mouse click, works identically for touch tap.
- No keyboard shortcuts required.
- No drag gestures, no timing mini-games, no aim. A click on the cast button is enough.
- A click on a rod selects it. A click on "Eat" beside a caught fish consumes it.

## Rods

Four rods are always available from the start. No rod is locked, no rod needs to be earned — the player chooses freely at any time and can change selection at any time. Each rod has a luck multiplier that biases catches toward rarer fish. From lowest to highest luck:

- A baseline rod — no bonus (1× luck).
- A "lucky" rod — a slight rare-fish nudge (1.5× luck).
- A "rare hunter" rod — a noticeable rare-fish boost (2× luck).
- A top-tier rod — a strong bias toward rare and legendary fish (3× luck).

Each rod has a short, kid-readable name and a one-line description of what it is good at. The currently selected rod is clearly highlighted.

The luck multiplier applies **only to rare and legendary catch chances**. Common and uncommon base chances are unchanged by rod. After multipliers are applied, the catch probabilities are normalized so they sum to 1 — meaning a bigger luck multiplier does not just make rares more likely in isolation, it pulls probability mass away from commons and uncommons. Higher-tier rods still catch commons, just less often.

## Fish Catalog

Four rarity tiers. Each tier has more than one named fish so the collection feels varied even inside a tier. Emoji-style pictographs are used for each fish. Every fish in a tier shares the same base catch weight and the same on-eat buff.

### Common tier — base weight 40% (per fish in the tier)
- Anchovy (small fish)
- Herring (small fish)
- Sardine (small fish)
- **Eating effect:** +10% Fishing Speed for 30 seconds.

### Uncommon tier — base weight 30%
- Mackerel (tropical fish)
- Bass (tropical fish)
- **Eating effect:** 20% chance to catch a duplicate on each cast, for 45 seconds.

### Rare tier — base weight 20%
- Salmon
- Tuna
- **Eating effect:** +15% Luck for 60 seconds.

### Legendary tier — base weight 10%
- Great White Shark
- Blue Whale
- **Eating effect:** +30% Luck for 90 seconds.

Note on the weights: each fish in a tier carries that tier's full weight independently, so before normalization the raw weights are added across all fish. The visible outcome is that tiers share their probability mass across the fish in them, and rarer tiers are plainly rarer, but the precise numbers above are the authored starting values and must be preserved so the feel of the game matches.

## Catch Mechanics

Clicking the cast button begins a short suspense beat (about 1.5 seconds by default). During this beat:
- The cast button is disabled — the player cannot spam-cast.
- The pond gives subtle visual feedback that something is happening (a gentle pulse/scale).

At the end of the beat, a fish is selected using the weighted probability table above, with the active rod's luck multiplier applied to rare and legendary weights, and any active Luck buff multiplied on top of that.

The caught fish is added to the collection, a tier-appropriate sound plays, and an on-screen notification announces the catch with the fish's name, rarity, and picture.

If a Double Catch buff is active, a random roll against the buff's chance decides whether a second copy of the same fish is awarded. A distinct "Double Catch!" notification appears when this triggers.

The cast button re-enables immediately after the catch resolves. There is no cooldown beyond the cast beat itself.

### Speed buff effect
A Speed buff shortens the cast beat. Multiple Speed buffs do not exist simultaneously (see buff rules below); the active Speed buff scales the cast duration down by its percentage.

## Inventory / Collection

All caught fish accumulate in a "Your Catches" panel. Fish are grouped by species with a count ("x3"). The panel is scrollable — there is no inventory cap.

Each entry shows:
- The fish pictograph.
- The fish name.
- The running count.
- An "Eat" button.

A left-edge color bar on each entry indicates rarity (see palette below).

Clicking "Eat" consumes one of that species and grants its tier's buff. If the player has three Salmon and eats one, the count drops to two. The corresponding eating sound plays. A short "Yum!" notification describes which buff was just granted and for how long.

## Buffs

Buffs are displayed as a row of pill-shaped indicators at the top of the screen, one per active buff. Each pill shows:
- The fish pictograph of the fish that granted it.
- A one-line buff label (e.g. "+15% Luck").
- A seconds-remaining countdown.
- A background fill that drains from full to empty over the buff's duration — a visible clock.
- A border/background tinted to match the rarity that granted it.

### Buff rules

There are three buff types: **Luck**, **Speed**, and **Double Catch**.

- Only one buff of each type can be active at once. Eating a second fish whose buff shares a type with an active buff **replaces** the existing buff — the new duration starts fresh and the old one is discarded. (So eating a second Salmon while a Salmon buff is running resets the timer rather than stacking.)
- Different types run in parallel. A player can have Luck + Speed + Double Catch all active simultaneously.
- When a buff expires, its pill disappears.

### Buff effects (restated concretely)

- **Luck** multiplies the probability weight of rare and legendary fish catches by (1 + buff value). Applied on top of the rod's luck multiplier.
- **Speed** multiplies the cast beat duration by (1 − buff value), i.e. makes casts finish faster.
- **Double Catch** gives an independent probability on each cast to add a second identical fish to the collection.

## Progression

There is no saved progression. The game does not remember state between sessions — every load starts clean. There is no meta-progression, no XP, no levels, no unlocks, no achievements, no currency, no shop. The progression the player feels is the collection growing within a session and the rotating set of active buffs.

## UX Flow

There is no title screen, no menus, no options. The game is the single screen. Loading the page drops the player directly into a playable state with the baseline rod selected.

Screen layout, top to bottom / left to right:
- A title at the top identifying the game, with the active buffs row immediately beneath.
- A three-pane body: rod selection on one side, the pond and cast button in the center, the catch collection on the other side.

There is no "play again" flow because there is no death. The player simply keeps casting. Closing and reopening the page begins a new fresh session.

## Visual Design — Thematic

- Overall palette is bright, friendly, aquatic — soft cyan background, clean white panels, deep ocean blue for pond and headings. Feels like a picture book, not a dark arcade cabinet.
- The pond is a rectangular water body with a gentle top-to-bottom blue gradient (lighter at the surface, deeper below) and a subtle horizontal shimmer that sweeps continuously. Small ambient fish pictographs swim across the pond at varied speeds and heights — five at start, up to about eight maintained automatically. They enter from either side, cross at different paces (a few seconds to a dozen or so), and vanish off the far edge. This is decorative and loops forever; ambient fish are not the fish you catch.
- Rounded corners everywhere. Soft shadows. No sharp edges, no dark gritty aesthetic.
- Rarity is signaled by color, consistently across catches, inventory entries, and buff pills:
  - **Common — green** (grass/leaf feel).
  - **Uncommon — blue** (calm water feel).
  - **Rare — purple** (magical feel).
  - **Legendary — gold** (treasure feel).
- Animations are gentle and celebratory: a small pond pulse during the cast beat, notifications that slide in from the side and slide out, buff pills that pop in from above, a soft scale-on-hover on interactive buttons, a press-down scale on click. Nothing jarring, nothing screen-shaking.
- Fish in the inventory and notifications use their pictographs at a comfortable, readable size.

## Audio Design — Thematic

Audio is core to the "punchy reward" feel for kids. Every meaningful action has a sound.

- **Casting / common catch:** a short, light, friendly ding — the musical equivalent of "nice, got one." Low-stakes, chirpy. Plays on every common catch.
- **Uncommon catch:** a warmer, slightly richer chime — clearly "better" than the common sound without being overblown. Signals a small step up.
- **Rare catch:** a more ornamental, magical-feeling flourish — sparkle and shimmer. Unmistakably different from the uncommon sound, reads as "ooh, something special."
- **Legendary catch:** a full celebratory fanfare — brass, choir, whatever conveys triumph. It should feel like a small cinematic moment. Longer than the others. The kids should cheer when they hear it.
- **Eating a fish:** a cheerful, cartoony munching/gulp — "yum!" Short and goofy, not gross. Plays regardless of the fish's tier.

Each tier's catch sound should be distinct enough that a player can identify the rarity with eyes closed. Commons should not feel underwhelming — they should still feel nice — but every step up in rarity should feel audibly more rewarding.

Sounds cut themselves off and restart when re-triggered (rapid casting doesn't stack echoes).

## Notifications

Two kinds of transient popups appear in a corner of the screen:

- **Catch notification:** announces "You caught a [rarity] fish!" with the fish's picture and name. Appears on every catch. Slides in, holds for about two seconds, slides out.
- **Eating notification:** "Yum!" with the fish name and the buff just granted, described in plain terms ("+15% Luck for 60s"). Same slide-in / slide-out pattern.
- **Double catch notification:** "Double Catch!" with a note that an extra copy of the fish was awarded. Appears in addition to the regular catch notification when the double-catch roll succeeds.

Notifications never block interaction and never require dismissal.

## Feel Targets

- A five-year-old should understand what to do within ten seconds of loading.
- Every cast should produce a visible, audible, positive response. No "nothing happened" casts.
- Bad luck streaks are softened structurally by the eat-for-buff loop: if rares are not coming, eating any fish produces a visible effect, which keeps engagement up.
- Legendary catches should feel genuinely special — rarer than rare, bigger celebration sound, bigger visual tint — so that the first time a kid pulls a Blue Whale or a Great White Shark, they shout.
- The game should be pickup-and-putdown. Leaving the tab and coming back later is fine; nothing is lost because nothing was saved.

ART PASS: make the overlay look and feel like a AAA video game. Think Hearthstone and
Legends of Runeterra card reveals, Balatro "juice", Overwatch Play of the Game, Xbox
achievement toasts. It must be playful, loud, and a piece of art, while staying readable on
a Twitch stream. Keep the existing scene system, events, ?demo=1 and ?scene= params working.

GLOBAL JUICE (apply everywhere):
- Squash and stretch on every pop-in (scaleX/scaleY overshoot), back.out/elastic.out easing.
- Hit-stop: 60-80ms freeze before big impacts, then camera shake + a chromatic-aberration
  flash (red/cyan offset text-shadow or duplicated layers) + radial light burst.
- Confetti and gold coin/spark bursts from the canvas particle system on wins.
- Big readable callout text with thick dark stroke (paint-order: stroke), gradient fill,
  and a slight 3D tilt (like fighting-game announcer text), e.g. "SUMMONED!", "TAKES THE
  LEAD!", "LEGENDARY!", "CORRECT!".
- Richer palette for energy: keep gold/purple base, add hot magenta #FF3EA5, cyan #3EE6FF,
  and lime #B6FF3E for accents and rarity glows.

1. CANONIZATION BECOMES A LEGENDARY CARD REVEAL (the hero moment):
   - After the vote, a glowing card pack/orb drops in center, trembles (intensifying shake +
     rising pitch hum), then BURSTS (hit-stop, flash, shockwave ring, particles).
   - Out spins a large collectible LORE CARD (about 520x760, 3D rotateY flip from back to
     front): ornate gold frame, the sigil emoji huge in the art window over an animated
     nebula gradient, the title on a banner ribbon, the story as card text, "LORE #N" and
     the date in the corners, witnesses' tiny avatars along the bottom edge.
   - RARITY by participation (summoners + voters): Common (<4, silver), Rare (4-6, cyan),
     Epic (7-9, magenta), LEGENDARY (10+, gold). Rarity sets the frame glow, burst color,
     and the announcer callout ("EPIC LORE!", "LEGENDARY LORE!"). Demo should show LEGENDARY.
   - Holographic FOIL: a moving diagonal rainbow sheen (linear-gradient + mix-blend-mode
     color-dodge) sweeping across the card, plus slow idle tilt (rotateX/rotateY wobble).
   - Light rays rotating behind the card, rising sparkles, then the red "CANONIZED" stamp
     slams onto the card corner with ink splatter.
   - Then the card shrinks and flies into a "collection" chip at top-right that bumps
     (+1 counter).
   You may keep the tome as the DECIPHER scene (runes scrambling) but the payoff is the card.
2. SUMMON: arcade energy. Each joiner's avatar slams onto the ring with a "+1" pop and a
   combo counter ("x2 COMBO", "x3 SUMMONED!") that grows with each hit; ring spins faster
   and glows hotter per joiner; at threshold: hit-stop, white flash, pillar of light,
   "SUMMONED!" announcer text.
3. VOTE: make it a race. Liquid bars become energy meters with bubbling tops; when the lead
   changes, flash "TAKES THE LEAD!" over the new leader with a quick shake; leader scroll
   gets flickering flame/aura particles; final 5 seconds: countdown numbers pulse big in
   the center with a tick sound.
4. INITIATION: Xbox-style ACHIEVEMENT UNLOCKED toast: a pill-shaped banner slides in from
   the bottom center with a trophy/scroll icon spin, "ACHIEVEMENT UNLOCKED", "@name: Initiated
   into <title>", the "+1 LORE KNOWN" sub-line, and a chime arpeggio. Keep the candle avatar
   as the icon. 5s.
5. TRIALS: game-show energy. Title card "THE LORE TRIALS" with spinning spotlights; the 4
   answers as chunky color-coded buttons (A magenta, B cyan, C lime, D gold) with live
   counts bouncing; reveal with drumroll tick then the correct one explodes into confetti,
   wrong ones shatter/grey out; winners' avatars fly into a podium with crowns and a
   "LOREMASTER" banner.
6. Pressure ring: make it feel alive (heartbeat scale pulse, orbiting sparks), with the
   phrase in a speech-bubble style chip.

Performance: transforms/opacity/filter only, cap particles at ~400, 60fps. No external
images (CSS, SVG, emoji, canvas only). No em dashes in any text. Run node --check and
re-verify element ids. Summarize what changed per scene.

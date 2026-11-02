ART PASS for public/codex.html (the public LORE archive). I reviewed it at 1920x1080: it
works but looks empty and bland. Stars are tiny grey dots with no labels, the last star
renders outside the panel, and the #1 crown shows as "?" (emoji not rendering). Make it a
AAA game collection screen that matches the overlay's LEGENDARY card reveal.

1. HERO STARMAP (top, ~45vh): each lore is a big glowing orb (48-90px by uses) with its
   sigil emoji inside, rarity-colored glow (Common silver, Rare cyan #3EE6FF, Epic magenta
   #FF3EA5, Legendary gold #F5C451, rarity from witnesses count: <4, 4-6, 7-9, 10+), a soft
   pulsing halo, and the title label always visible under it. Constellation lines are
   animated (dash flow, gold gradient). Keep all stars inside the panel with padding.
2. CARD COLLECTION (below): a responsive grid of the same collectible LORE cards used in
   the overlay (ornate frame, rarity glow, sigil art window over animated nebula gradient,
   title ribbon, short story, LORE #N and date, witnesses avatars). Holographic foil sheen
   on hover with mouse-tracked 3D tilt (rotateX/Y by pointer position), lift and glow.
   Legendary cards have a permanent subtle foil animation. Filter chips: All / Legendary /
   Epic / Rare / Common, with a count on each.
3. Clicking a star or card opens a full-screen modal: the card big on the left (flip-in),
   and on the right the clip embed (or placeholder), origin story, explainer, witnesses,
   uses and initiates. Escape closes.
4. LOREMASTERS panel: use an inline SVG crown instead of the emoji; gold/silver/bronze
   ranks with metallic gradients.
5. Header stats as animated count-up tiles (Total Lore, Initiates, Legendary count, Oldest
   living joke). A subtle animated aurora/nebula background behind everything.
6. New lore over ws: the star ignites with a supernova burst, and its card slides into the
   collection with a "NEW!" ribbon.

Keep it fast (CSS transforms, one canvas), responsive down to 390px wide, no em dashes, run
node --check, verify element ids. Summarize.

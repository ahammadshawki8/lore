New piece: an original background "game" for the demo stream, so the streamer has
something on screen behind the LORE overlay. Build public/stage.html (+ stage.js/css): a
self-playing, original 2D side-scroller called "BUCKET QUEST" rendered on one 1920x1080
canvas (no external images, draw everything with canvas shapes, gradients and emoji).

- Hero: a cute blue bucket with eyes and tiny legs that auto-runs and auto-jumps across a
  stylized night fantasy landscape (parallax: purple sky with stars, distant castle
  silhouette, mid hills, a gold-trimmed ground path). Coins and gems to collect, a score and
  coin counter HUD at top-left in a chunky game font (Cinzel 900 is fine).
- Obstacles: crates, spikes, a ladder to climb, a crab that scuttles. The AI controller
  jumps over them with nice arcs (squash and stretch on land, dust puffs).
- Every ~45 seconds (and on demand via ?moment=1 or pressing M) a scripted "LEGENDARY
  MOMENT": the bucket falls off a huge cliff, the camera shakes, it bounces off 3 things in
  slow motion, lands perfectly upright on a tiny pillar, and a big "IMPOSSIBLE!" text pops.
  This is the moment chat will want to canonize.
- Leave the bottom-left 300x300 and the top-right 360x120 visually quiet (the overlay uses
  them). No text other than the HUD and the moment popup. 60fps, small file.
- Add a link to stage.html on public/index.html.

No em dashes. node --check, summarize.

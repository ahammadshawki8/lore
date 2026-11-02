Second visual review at 1920x1080 (I screenshot each ?scene=). The LEGENDARY card reveal looks
great, keep it. Fix these:

SUMMON (broken layout):
- The summoning circle sits too low: its bottom half is off-screen. Center the whole circle
  on screen (center at about 960x560, diameter about 620px) so it is fully visible.
- Joiner avatars do not lock onto the ring: one lands on top of the "THE SUMMONING" title
  (covering the letters "MM"), others float far left/right. Each avatar must fly in and
  snap to an evenly spaced slot ON the outer ring (slot angles spread across the top arc),
  with the name label under it.
- Scattered loose rune letters drift across the screen; keep runes only on the rotating
  ring. Replace the pentagram with a non-occult geometric sigil (nested rotating hexagon +
  triangle + circle, like a game magic circle).
- I never see the "+1" pops or the "x2 COMBO" / "x3 SUMMONED!" counter. Show the combo
  counter big at the right of the circle with each join, and "SUMMONED!" announcer text at
  threshold.

CARD: move the "CANONIZED" stamp so it does not cover the story text (place it rotated over
the bottom-right of the art window). Add a big rarity banner above the card during the reveal
("LEGENDARY LORE!" announcer text with gold stroke), then fade it. The "A MOMENT PRESERVED"
caption is cut by the title ribbon; move it up or remove it.

TRIALS: the question text is not visible on the result frame and the 4 answers look washed
out and grey. Show the question on a bold card under the banner. Make the answer buttons
chunky and color coded (A magenta #FF3EA5, B cyan #3EE6FF, C lime #B6FF3E, D gold #F5C451)
with dark text, big letter badges, and bouncing counts; on reveal keep the correct one
bright and enlarged and dim the others to 35%. The podium at the bottom is cut off and too
faint: raise it fully on screen with solid gold/silver/bronze blocks, avatars and crown.

INITIATION toast: scale it up 1.4x and add a shine sweep across it on entry.

Keep ?demo=1 and ?scene= working, no em dashes, run node --check and the id check. Summarize.

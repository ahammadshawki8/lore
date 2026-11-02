BROADCAST LAYOUT PASS (public/overlay.*). I reviewed frames from our real live Twitch test with
the overlay on top of gameplay (stage.html). Brutal verdict: it blocks the game. The vote
scrolls, trial board and summon circle sit in the middle of the screen, and their text is
too small to read at stream size. A real streamer would turn it off. Rebuild the layout like
a professional broadcast graphics package: gameplay stays visible, graphics live in a right
side panel and a lower third, and only the canonization reveal takes center stage.

LAYOUT ZONES at 1920x1080 (64px safe margins):
- RIGHT PANEL: x 1440-1856, y 120-900 (416px wide). Used by SUMMON and TRIALS.
- LOWER THIRD: x 64-1856, y 820-1016. Used by VOTE and INITIATION.
- CENTER STAGE: only for CANONIZATION (max 9s) and the brief announcer callouts.
- Bottom-left chip: pressure. Top-right chip: last canon.
Never put anything else over the center of the game.

1. SUMMON -> right panel card (solid dark surface, 24px radius, gold top accent bar):
   header "THE SUMMONING" (Cinzel 800 40px), the summoning circle scaled to ~300px inside the
   panel with the rotating rune ring, each joiner's avatar (64px) snapping onto evenly spaced
   slots ON the ring, a big "2 / 3 WITNESSES" counter (Inter 800 44px), a countdown bar, and
   the instruction "Type !lore to join" (Inter 700 28px). Combo pop "x2" next to the counter.
   At threshold: panel flashes gold, then a SHORT center announcer "SUMMONED!" (1.2s) and out.
   FIX BUGS seen in ?scene=summon: a grey/white haze covers the whole screen (any dimming
   must be dark, rgba(5,3,12,0.45), and only during canonization), avatars are flung far off
   the ring, and "SUMMONED!" renders twice (one stray copy at the right). Remove all of that.
2. DECIPHER -> right panel: compact "Deciphering..." state with the rune scramble and a
   progress shimmer (no big tome in the center).
3. VOTE -> lower third: three equal option tiles side by side across the bottom, each a solid
   dark tile with a big gold number badge (64px), title in Inter 800 30px (2 lines max),
   vote percent Inter 800 40px and a thick progress bar. Leader tile glows and lifts 8px.
   Left label block: "NAME THIS MOMENT" + "Type 1, 2 or 3" + a countdown ring.
   "TAKES THE LEAD!" as a small badge on the leading tile, not a full-screen callout.
4. CANONIZATION -> keep the center LEGENDARY card reveal, dim the game with a dark scrim,
   then fly the card to the top-right chip. Card text must be readable: title Cinzel 900
   44px on a solid plate, story Inter 500 24px max 3 lines.
5. INITIATION -> lower-third toast (already close): make it 1.2x and make sure it never
   overlaps a vote.
6. TRIALS -> right panel: banner "LORE TRIALS", question on a solid plate (Inter 700 28px),
   four stacked answer rows (A magenta, B cyan, C lime, D gold letter badges, Inter 700 26px,
   live counts on the right, bars filling behind), countdown bar. Reveal: correct row turns
   gold and grows, others dim; then the panel shows a compact top-3 Loremasters podium with
   avatars and points. Short center "CORRECT!" announcer (1s) only.
7. ?scene previews must pace like real events: joiners every 1.5s, tallies every 500ms.
8. In ?bg=1 preview mode, render stage.html in an iframe behind the overlay instead of a
   flat gradient, so previews look like a real stream.

No em dashes. node --check, verify ids. Summarize.

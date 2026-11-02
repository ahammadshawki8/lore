ARCHIVE PAGE FIXES (public/codex.*). After the design pass I screenshot codex.html at 1905px
wide. It regressed and looks broken:
- The collection cards are too narrow (5 columns at ~180px), so the Cinzel title is huge and
  truncated to "THE BUC...", "SAGA OF...", and it overlaps the story text below it.
- The witness avatar rows overflow and overlap the card footer ("LEGENDARY THE LORE OF T...").
- "LORE #6" and the date wrap onto two lines and collide.
- Starmap labels overlap each other ("The Crab's E The Ladder of Unwise Am...").
- The Loremasters list text is tiny (about 9px) and the panel is narrow.
- "A MOMENT PRESERVED" caption is redundant clutter on every card.

Fix:
1. Collection grid: repeat(auto-fill, minmax(300px, 1fr)) with 24px gaps; cards have a fixed
   aspect ratio (5:7). Title: Cinzel 800, clamp(22px, 1.6vw, 28px), max 2 lines, line-height
   1.15, no ellipsis on normal titles (allow wrapping to 2 lines, ellipsis only after line 2).
   Story: Inter 500 16px, 3 lines max. Explainer removed from the grid card (keep in modal).
   Witnesses: one row of up to 6 overlapping 32px avatars (-8px margin) + "+N" pill.
   Footer: rarity pill left, "LORE #N" right, on one line. Date top-right in Inter 600 13px.
   Remove "A MOMENT PRESERVED".
2. Starmap: place orbs so labels never collide (alternate labels above/below, min 160px
   horizontal spacing, truncate labels at 22 chars with ellipsis). Panel height 340px.
3. Loremasters: panel 340px wide; rows with 40px avatars, name Inter 700 18px, points Inter
   600 16px, rank crowns. Put it in a 2-column layout with the starmap (starmap 1fr, panel
   340px), stacked below on narrow screens.
4. Stat tiles: text never truncates at desktop width (allow 2 lines for the oldest joke).
5. Check at 1440px and 1920px wide and 390px mobile.

No em dashes. node --check, verify ids. Summarize.

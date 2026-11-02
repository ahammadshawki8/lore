Overlay review: I previewed overlay.html?demo=1&bg=1 at 1920x1080 in a real browser.
The vote scrolls look great. Fix these bugs (keep everything that works):

1. CANONIZATION IS BROKEN (most important scene): the tome renders too low (bottom is cut
   off by the screen edge), the LEFT page only shows the leather cover interior with a star,
   so the winning TITLE, SIGIL and ORIGIN STORY never appear. The "CANONIZED · LORE #2"
   stamp floats above the book instead of on the page, and the witness avatars sit below
   the book, half off the parchment. Fix the 3D tome so that when open: both pages are
   parchment, the book is vertically centered (fully visible, about 1100x640), the left page
   shows sigil + title (text-scramble reveal) + story (ink-bleed) + explainer, the right
   page shows the clip frame + WITNESSES row inside the page, and the stamp slams onto the
   left page over the title area.
2. The demo loop STALLS after the fizzle scene: "THE LORE FADES..." stays on screen for 40+
   seconds and the loop never continues. Every scene must have a guaranteed end that
   releases the scene queue (also add a safety timeout per scene, e.g. 15s max).
3. The pressure rune ring (bottom-left) is always visible in demo. Hide it during big
   scenes, and in demo only show it before the summon.
4. Typography: "Cinzel Decorative" makes ugly ligatures ("THE" and "TOO" render oddly).
   Use "Cinzel" (weights 700/900) for all titles and headers. Keep IM Fell English for prose.
5. Vote scrolls: remove the redundant small "TYPE 1" label OR the big numeral; show one big
   numeral with "type 1 in chat" underneath. Make the countdown ring bigger (120px) with the
   seconds number readable.
6. Add a ?scene=<summon|fizzle|decipher|vote|canonized|initiation|trial> query param that
   plays only that scene (with demo data) and then holds its final frame, so each scene can
   be screenshot-tested. Keep ?demo=1 as the full loop.

No em dashes anywhere (use a middle dot or colon). Then re-check every element id and run
node --check. Summarize the fixes.

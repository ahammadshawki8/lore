DESIGN SYSTEM + READABILITY PASS (overlay.*, codex.*, index.html). Feedback from a real viewer:
"the background, upper layers and fonts make it hard to follow; it looks like beginner work,
not professional." Goal: broadcast-grade graphics like a pro esports/stream package. Keep all
scenes, events, timings, ?demo=1 and ?scene= working. Clarity first, flash second.

1. TYPOGRAPHY (biggest problem)
   - Add Google Font "Inter" (500, 600, 700, 800). Use Inter for ALL body text, labels, names,
     counts, stories, explainers, buttons, chips, HUD.
   - Use "Cinzel" 800/900 ONLY for short display headings (5 words or fewer): scene titles,
     lore titles, announcer callouts. Never for sentences. Remove IM Fell English entirely
     and remove all italic body text.
   - Minimum sizes at 1920x1080: body 26px, labels 20px (uppercase Inter 700, letter-spacing
     0.08em), names 22px, lore titles 56-72px, announcer text 120px+.
   - Line-height 1.35 for body, max 60 characters per line.
2. CONTRAST
   - Every piece of text sits on a solid or near-solid surface: dark panel rgba(14,10,28,0.94)
     with a 1px rgba(255,255,255,0.12) border and 16px radius, or a solid light plate with
     dark text. Text must hit WCAG AA (4.5:1). No text directly over gradients, foil, nebula,
     particles, light rays or the game.
   - Holographic foil, nebula and light rays only on frames, art windows and backgrounds,
     never behind text.
   - Text shadow for any text over imagery: 0 2px 8px rgba(0,0,0,0.6).
3. CALM THE NOISE
   - Remove the film grain layer. Cap particles at 150, keep them behind panels. Light rays
     max 25% opacity and only in the canonization and trial reveal. Vignette max 30%.
   - One focal point per scene: dim everything else to 40% during the hero moment.
4. LAYOUT SYSTEM
   - CSS variables for color, spacing (8px grid), radius (16/24), shadows, durations.
   - Title-safe margins of 64px. Toasts (initiation) as a lower-third at bottom-center.
     Pressure chip bottom-left. Corner chip top-right. Nothing overlaps.
   - Palette: ink #0E0A1C surfaces, text #F7F3FF, muted #B9B0D6, gold #F5C451 primary accent,
     Twitch purple #9146FF secondary; rarity accents only for rarity (silver/cyan/magenta/gold).
5. COMPONENT FIXES
   - LORE CARD: art window (top 42%) with sigil; title on a SOLID dark plate (white Cinzel
     900, 2 lines max); story in Inter 500 26px on a solid dark panel, max 3 lines (truncate
     with ellipsis); rarity label as a solid pill top-left; "LORE #N" and date as Inter labels;
     witnesses as a row of avatars with "+N" overflow and a count label, no tiny names.
   - VOTE: each option is a solid dark card: huge number badge, title in Inter 800 34px,
     percentage in Inter 800 44px, bar below. "TYPE 1, 2 OR 3 IN CHAT" instruction bar.
   - SUMMON: caption on a solid pill: "TYPE !lore TO JOIN · 2/3". Names under avatars on
     small solid pills.
   - TRIALS: question on a solid plate in Inter 700 34px; answers Inter 700 30px with the
     colored letter badge; podium names Inter 700.
   - INITIATION toast: solid dark lower-third, Inter text, gold accent bar on the left.
   - ARCHIVE PAGE: same card component; Inter body; starmap labels on small solid pills;
     section headings Cinzel; ensure everything is legible at 100% zoom on a laptop.
6. MOTION: UI transitions 200-400ms with consistent easing (power3.out); keep the big
   cinematic juice ONLY for summon threshold, canonization and trial reveal.

No em dashes. node --check all changed JS, verify element ids, summarize per component.

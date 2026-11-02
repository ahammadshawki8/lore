Next step: the OBS overlay. This is the most important part of the project: judges score
"fun to watch", so it must look like a AAA game cinematic, not a web page. Take your time
and make it stunning.

Create public/overlay.html (+ public/overlay.css, public/overlay.js). 1920x1080, fully
transparent background (OBS Browser Source). Plain HTML/CSS/JS. Load GSAP 3.12.5 from
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js and Google Fonts
"Cinzel Decorative", "Cinzel", "IM Fell English". Palette: ink #0b0714, Twitch purple
#9146FF, gold #F5C451, deep gold #B8862B, parchment #EADBC0, ember #FF4D4D.
Connect to ws://<host>/ws with auto-reconnect. Each event type drives one scene, built as
a GSAP timeline. Scenes never overlap (keep a scene queue). Animate only transform/opacity/
filter for 60fps. Use one full-screen <canvas> particle system shared by all scenes (gold
sparks, embers, smoke, light motes) with additive blending.

SOUND: synthesize everything with the Web Audio API (no audio files): boom (sine sweep
120Hz->30Hz + noise burst), chime (stacked sines with decay), whoosh (filtered noise sweep),
heartbeat hum (low oscillator with LFO), stamp thud, page-flip (short bandpassed noise).
Master volume 0.6. Note: OBS browser sources play audio fine; a browser needs one click,
so add ?sound=1 to show a tiny "click to enable sound" prompt for testing.

SCENES:
1. pressure {phrase, value}: small rune ring (12 SVG rune glyphs on a circle, slowly
   rotating) bottom-left, 180px. Stroke-dasharray fill = value, glow scales with value,
   phrase in Cinzel in the center with "chat senses lore..." caption. >0.7 pulses with the
   heartbeat hum. Fades out when value is 0.
2. summon {joiners, needed, endsAt}: a big summoning circle (two counter-rotating SVG rune
   rings + an inner pentagram-like geometric sigil drawn with stroke-dashoffset) rises from
   the bottom-center with a whoosh. Big caption "THE SUMMONING" + "type !lore to join
   (2/3)". Each NEW joiner: their avatar (circular, gold border) flies in from the side on a
   curved path, locks onto a slot on the ring with a chime and a spark burst, their name
   appears under it. A countdown arc runs around the outer ring. When threshold is reached:
   light pillar shoots up, ring flares white-gold, screen shake.
   fizzle: the circle sputters and dissolves into grey smoke particles, caption
   "the lore fades... (not enough witnesses)".
3. decipher: a 3D CSS tome (cover with embossed sigil, leather texture via gradients,
   thick page block) drops in with perspective and the cover swings open (rotateY) with a
   page-flip sound. On the pages, rows of random runes continuously scramble (glowing
   purple). Caption "THE CODEX DECIPHERS...".
4. vote_open {titles, endsAt} / vote_tally {counts}: three parchment scrolls unroll
   (scaleY from rolled ends) side by side, labeled "TYPE 1", "TYPE 2", "TYPE 3" in big gold
   numerals, each with the title text. Under each, a liquid-gold bar rises with the live
   percentage + vote count (smooth GSAP tween, a wave shimmer on top). The leading scroll
   glows and lifts slightly. A sand hourglass/countdown ring shows time left.
5. canonized {entry}: THE MONEY SHOT, about 9 seconds:
   - white-gold flash + screen shake + boom
   - losing scrolls burn away (mask/clip-path burn edge with ember particles)
   - the tome returns center and the winning title text-scrambles from runes into letters
     on the left page (Cinzel Decorative, gold gradient text, glow)
   - entry.sigil emoji stamps in large above the title
   - the story reveals with an ink-bleed effect (animated mask-image radial gradient)
   - the clip thumbnail (or a gold "moment preserved" placeholder if clip is null) appears
     on the right page inside an ornate wax-seal frame
   - witness avatars fly in on curved bezier paths one by one (stagger 0.08s) into a row
     labeled "WITNESSES"
   - a red, rotated "CANONIZED · LORE #N" stamp slams down (scale 3 -> 1 with overshoot,
     ink splatter particles, thud)
   - hold ~6s, then the tome closes and shrinks into a small glowing corner chip
     "📜 LORE #N" top-right that stays for 30s.
6. initiation {user, lore, initiateNumber}: avatar large at center-left inside a ring of 8
   animated CSS candle flames (flicker via keyframes + glow), a scroll unrolls beside it:
   "@name HAS BEEN INITIATED", the lore title, the explainer, and "INITIATE #N". 6s, then
   it dissolves into rising embers.
7. trial_open {question, options, endsAt} / trial_tally / trial_result: a banner "⚔ THE
   LORE TRIALS ⚔" slams in, the question on a parchment card, 4 rune-stone tiles A-D in a
   2x2 grid with live answer counts, countdown ring. Result: wrong tiles crumble/dim, the
   correct tile flips to gold, the correct users' avatars rain down into a pile, then a
   3-step podium shows the top 3 Loremasters (crown on #1) with the rest of the top 5 below.

DEMO MODE: overlay.html?demo=1 plays a scripted loop of every scene with fake data and
dicebear avatars (https://api.dicebear.com/9.x/bottts/svg?seed=NAME), so it can be previewed
without Twitch. Also ?bg=1 adds a dark gameplay-like gradient background for previewing.

Make it gorgeous: layered glows (drop-shadow filters), subtle film grain, light rays behind
the tome, vignette during big scenes, easing like back.out / expo.out, everything with
anticipation and follow-through. When done, open the page in demo mode is not possible for
you, so carefully review the code for runtime errors (check every element id referenced in
JS exists in HTML) and summarize the scenes.

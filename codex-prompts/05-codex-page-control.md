Project rules (also in AGENTS.md): the project is named LORE and its name must remain LORE, and never use the em dash character anywhere (code, UI text, chat messages, comments, docs).

Next step: the public LORE archive page (public/codex.html, keep that filename) and the streamer control panel.

1) public/codex.html (+ css/js): "THE LORE OF <CHANNEL>" (channel login from
/api/health). Same fonts/palette as the overlay, GSAP 3.12.5 from cdnjs.
- Full-screen canvas night sky: twinkling background stars, slow parallax drift with the
  mouse, faint nebula gradients.
- Each lore entry from /api/lore is a star: x by born_at (oldest left), y by a hash of id,
  radius by uses, gold pulsing glow if used in the last 7 days, dimmer silver otherwise.
  Faint constellation lines connect consecutive entries. Hover: star grows + title label.
- Click a star: a parchment card opens (GSAP) with sigil, "LORE #N", title, origin story,
  explainer, Twitch clip embed (iframe https://clips.twitch.tv/embed?clip=<id>&parent=
  <location.hostname>) or a placeholder if no clip, witness avatars, uses, initiates,
  born date. Close with X or Escape.
- Right side panel: "LOREMASTERS" leaderboard from /api/loremasters with avatars and crown.
- Top stats strip: total lore, total initiates, oldest living joke.
- Live via ws: on 'canonized' a new star ignites with a supernova burst and the card for it
  auto-opens for 5s.
- Responsive: on narrow screens the leaderboard moves below.

2) public/control.html: a clean, dark, Twitch-like streamer control panel (Inter or system
font, purple accents, cards). Shows: connection status + login, current ritual state, a
live chat feed (via ws, add server broadcast('chat', msg) for each message), buttons
"Start summon" / "Start trial" (POST endpoints that act as the broadcaster), sliders for
summonThreshold/summonSeconds/voteSeconds/trialSeconds (POST /api/config), a lore list
with delete buttons (DELETE /api/lore/:id), and a "Simulate crowd" box: text, number of fake
users, button. Plus quick buttons: "Simulate 3 summoners", "Simulate votes", "Simulate trial
answers", "Simulate newcomer question". Add links to open the overlay and the Codex page.

3) Update public/index.html as a beautiful landing page linking overlay (with OBS setup
instructions: Browser Source, 1920x1080, URL), codex page, and control panel.

Review all JS for errors (every referenced element id must exist). Summarize.

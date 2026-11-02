Final step: hardening and documentation.

1) Review the whole project for bugs and races: ritual queueing, trial vs ritual conflicts,
vote double counting, the overlay websocket reconnect, clip failure while offline, EventSub
reconnect handling, JSON file writes (write to temp file then rename), and graceful errors
when the token is missing. Fix what you find. Run scripts/smoke.js again and make sure it
passes.

2) README.md, written for hackathon judges:
- Title + tagline "Every community has lore. Now chat gets to write it."
- What it is (3 sentences), then "The Ritual" step by step (summon, decipher, vote,
  canonize, initiate, trials, codex)
- Screenshot/GIF placeholders (docs/ folder)
- Architecture diagram (ASCII) and Twitch integration list: EventSub WebSocket
  channel.chat.message, Helix Send Chat Message, Create Clip, Get Users, Get Streams
- Setup: Node 20+, token from twitchtokengenerator.com (Custom Scope Token, scopes
  user:read:chat user:write:chat user:bot clips:edit), .env from .env.example, npm install,
  npm run seed, npm start; OBS Browser Source setup (URL, 1920x1080, "control audio via
  OBS"); optional OPENAI_API_KEY for AI-written titles/stories (works without it)
- Demo without Twitch: overlay.html?demo=1&bg=1 and the control panel simulators
- "How we built it with Codex": the build happened in one Codex thread, step by step,
  prompts are in codex-prompts/
- License: MIT (add LICENSE file).

Summarize the final state.

# LORE CODEX v2 — Build Plan (paste prompts into ONE Codex thread, in order)

> Every community has lore. Now chat gets to write it.

## Pitch
When something legendary happens on stream, chat summons it into canon. Lore Codex clips the moment, has AI draft three titles, lets chat vote on the name in a live ritual, and canonizes the winner in an on-stream ceremony. Later it initiates newcomers into the jokes and quizzes regulars in the Lore Trials. The result is a living, community-written history of the channel.

## What changed from v1 (and why)
| v1 problem | v2 fix |
|---|---|
| Spike detection is noisy: big chats spam KEKW/W/+2 constantly, and small chats never reach the threshold | Detection now only *suggests*. A moment becomes canon when **chat summons it** (`!lore` from enough distinct chatters, or a channel-point redeem) |
| Chat only watched | Chat **summons**, **votes on the name**, becomes **Witnesses**, and plays the **Lore Trials** quiz |
| Spamming with alt accounts looks staged | Summon + vote is a deliberate ritual, so 3-4 accounts look natural |
| An archive's value takes weeks to show, which a 3-min demo can't do | The Lore Trials quiz uses the archive in the same demo |

## Design direction: illuminated manuscript meets arcane tech
- Palette: ink `#0b0714`, Twitch purple `#9146FF`, gold `#F5C451`, parchment `#EADBC0`, ember `#FF4D4D`
- Fonts: Cinzel Decorative (titles), IM Fell English (story), JetBrains Mono (data)
- GSAP 3.12.5 (cdnjs) + canvas particles. All sound synthesized with Web Audio (no copyright risk).
- **Latency becomes theater:** runes "decipher" while the AI thinks. Never show a spinner.

## The loop (each step is an on-stream moment)
1. **SUMMON:** a viewer types `!lore` (or redeems "📜 That's Lore" with channel points). A summoning circle appears, and every chatter who joins with `!lore` within 20s adds their avatar to the ring. When it hits the threshold (default 3) the circle ignites. Meanwhile the chat-spike detector glows the circle on its own ("chat senses lore...") to tempt people to summon.
2. **DECIPHER:** the server creates a Twitch clip and sends the last 30s of chat, the stream title/category and (stretch) the streamer's speech transcript to OpenAI. The overlay shows runes scrambling.
3. **NAMING VOTE:** three AI-drafted titles appear as scrolls. Chat types 1/2/3 for 20s, and live gold bars rise under each scroll.
4. **CANONIZATION** (money shot): screen shake → the circle shatters into gold → 3D tome slams open → the winning title resolves from runes → the origin story ink-bleeds in → the clip appears in a wax-seal frame → the summoners' and voters' avatars fly in as WITNESSES → "CANONIZED · LORE #7" stamp + boom.
5. **INITIATION:** a newcomer asks "what's the bucket thing?" or types `!lore bucket` → their avatar appears in a candle circle and a scroll explains the joke, while the bot replies in chat with the clip.
6. **LORE TRIALS:** the streamer runs `!trial`, the overlay asks "Which lore was born when Shawki fell off the ladder?" with A/B/C/D options, chat answers, and a "LOREMASTER" leaderboard crowns the winner.
7. **THE CODEX page:** a public starmap of every lore entry with its clip, story, witnesses, usage and Loremasters.

## Architecture
```
Twitch EventSub WebSocket: channel.chat.message (+ channel.channel_points_custom_reward_redemption.add if affiliate)
   └─ Node 20 server (Express + ws)
      ├─ twitch.js     EventSub WS, Helix: clips, users (avatars), chat send, stream info
      ├─ ritual.js     state machine: IDLE → SUMMONING → DECIPHERING → VOTING → CANONIZED (one at a time, queued)
      ├─ detector.js   spike detection → 'pressure' hints only
      ├─ lorekeeper.js OpenAI: 3 titles + story + explainer + sigil + trial question (JSON)
      ├─ trials.js     quiz from stored lore, scoring, leaderboard
      ├─ data/lore.json
      └─ ws /ws → overlay.html (OBS 1920x1080) · codex.html · control.html
```
Env: `TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_BOT_USER_ID, TWITCH_BROADCASTER_ID, TWITCH_USER_TOKEN` (scopes: `user:read:chat user:write:chat user:bot clips:edit channel:read:redemptions`), `OPENAI_API_KEY, PORT`.

---

## SETUP CHECKLIST (no accounts yet, ~30 min, do this FIRST)
1. **Twitch main account** (twitch.tv → Sign up). Verify your email. This is the streamer AND the bot.
2. **Enable 2FA** on it (Settings → Security). The dev console requires it.
3. **dev.twitch.tv/console** → Register Application → OAuth redirect `http://localhost:3000`, category "Chat Bot" → copy the Client ID and create a Secret.
4. **User token** with scopes `user:read:chat user:write:chat user:bot clips:edit`: use the Twitch CLI (`twitch token -u -s "..."`) or let Codex build a `/auth` OAuth route in Prompt 1.
5. **2-3 alt accounts** for the demo crowd (different usernames; reuse your email if Twitch allows, otherwise use a +alias). Give each a profile picture: avatars are the visuals.
6. **OBS Studio** (free) → Settings → Stream → connect Twitch. Test going live for 1 minute (clips need a live stream).
7. **Codex free:** sign in at chatgpt.com/codex (or the Codex CLI/IDE extension) with a free ChatGPT account. ONE thread for everything.
8. **OpenAI API key (optional):** needs billing ($5 minimum) and is separate from Codex. Without it, the template fallback still runs the whole app.
9. **GitHub repo** (public is simplest).

## CODEX PROMPTS

### 1. Scaffold + Twitch
```
We're building "Lore Codex" for the Codex x TwitchCon hackathon: chat summons memorable
stream moments into a community "canon" via an on-stream ritual (summon → AI drafts 3
titles → chat votes → cinematic canonization with auto clip), plus newcomer initiation,
a lore quiz, and a public archive page.

Set up Node 20 (ESM, plain JS, no build step) with express, ws, dotenv, openai. Implement
twitch.js: connect to EventSub WebSocket (wss://eventsub.wss.twitch.tv/ws), handle
welcome/keepalive/reconnect, subscribe to channel.chat.message (broadcaster =
TWITCH_BROADCASTER_ID, user = TWITCH_BOT_USER_ID; the bot and broadcaster may be the same account).
Helpers: sendChat(text), createClip() (POST /helix/clips then poll GET /helix/clips),
getUsers(logins) → avatars (cached), getStream(). Serve /public, broadcast JSON to browser
clients via ws at /ws. .env.example + README with token scopes. Clear logging.
```

### 2. Ritual state machine + detector + simulator
```
Add ritual.js, a single state machine: IDLE → SUMMONING → DECIPHERING → VOTING →
CANONIZED → IDLE, with queued requests (never two rituals at once). SUMMONING starts on
"!lore" (no args). It lasts 20s; each
distinct chatter typing !lore joins (broadcast 'summon' with their avatar); at threshold
(default 3, configurable) → DECIPHERING, else fizzle (broadcast 'fizzle').
DECIPHERING: snapshot the last 40 chat messages + stream info, call createClip() and
lorekeeper in parallel, broadcast 'decipher'. VOTING: broadcast 'vote_open' with 3 titles,
count messages that are exactly 1/2/3 (one vote per user, last wins) for 20s,
broadcast 'vote_tally' every 500ms, then pick the winner (ties → AI's first choice).
CANONIZED: save the entry to data/lore.json {id, n, title, story, explainer, sigil, clip,
witnesses[{login,avatar}], born_at, uses, initiates, trial}, broadcast 'canonized'.
Add detector.js: rolling 30s vs 10-min baseline of normalized phrases/emotes from >=3
distinct chatters; broadcast 'pressure' {phrase, value 0-1} every 500ms (hint only; a phrase
matching a canonized lore increments uses instead).
Add POST /api/simulate {user, text} and POST /api/simulate/crowd {texts[], users} that
inject fake chat through the same pipeline, and POST /api/config for thresholds/timers.
```

### 3. Lorekeeper + initiation + trials
```
lorekeeper.js: OpenAI call with JSON output: { titles: [3 short epic/funny names, distinct
styles], story: 2-sentence mock-heroic chronicle naming the streamer, explainer: 1 plain
sentence for a newcomer, sigil: one emoji, trial: {question, answer: <title>} }. Provide
fallbacks if the call fails, takes >8s, or OPENAI_API_KEY is missing: build 3 titles from
templates using the hot phrase ("The <Phrase> Incident", "Saga of <Phrase>", "The Great
<Phrase>") and a templated story, so the whole app works with zero API keys besides Twitch.
Initiation: "!lore <word>" fuzzy-matches a lore entry → reply in chat with explainer + clip
URL and broadcast 'initiation' {user, avatar, lore, initiateNumber}. Also auto-initiate a
first-time chatter whose message asks what a canonized phrase means ("what is/does X").
trials.js: "!trial" (broadcaster/mods only) picks a random lore with 3 decoy titles from
other entries (or generated if fewer than 4 entries), broadcasts 'trial_open' with
question + options A-D, accepts A/B/C/D for 20s (first answer per user), awards points
with a speed bonus, broadcasts 'trial_result' with the answer, the correct users' avatars,
and the top-5 Loremasters leaderboard (persisted).
```

### 4. Overlay (spend the most time here)
```
public/overlay.html: 1920x1080 transparent OBS browser source. Plain HTML/CSS/JS, GSAP
3.12.5 from cdnjs, Google Fonts Cinzel Decorative + IM Fell English. Palette ink #0b0714,
purple #9146FF, gold #F5C451, parchment #EADBC0. All sound via Web Audio synthesis.
Scenes driven by ws events, one GSAP timeline per scene:
- pressure: small rune ring, bottom-left, glow = value, phrase in center ("chat senses lore…").
- summon: a large summoning circle at center-bottom with rotating rune ring; each joiner's
  avatar flies in and locks onto the ring with a chime; countdown arc; at threshold the
  circle ignites (light pillar, particles). fizzle: it smokes out.
- decipher: 3D CSS tome slams open; runes scramble on the pages.
- vote_open/vote_tally: three parchment scrolls unroll with the titles labeled 1/2/3;
  gold liquid bars rise with live tallies; a 20s hourglass; the leader's scroll glows.
- canonized: screen shake + white-gold flash; losing scrolls burn away into embers; winning
  title stamps into the tome with a text-scramble; story ink-bleed reveal; clip thumbnail in
  a wax-seal frame; witness avatars fly on curved paths into a row; red "CANONIZED · LORE #N"
  stamp slams with a boom; hold 7s; the tome shrinks to a corner chip "Lore #N".
- initiation: avatar in a ring of 8 flickering CSS candles, scroll unrolls with
  "@user has been initiated into <title>" + explainer + "Initiate #N"; dissolves to embers.
- trial_open/trial_result: "THE LORE TRIALS" banner, question card, 4 rune-tiles A-D with
  answer counts, timer; reveal flips the correct tile gold, correct avatars rain in, top-5
  Loremaster podium.
60fps: transforms/opacity only. ?demo=1 runs a scripted loop of every scene without Twitch.
```

### 5. Codex page + control panel
```
public/codex.html: "THE CODEX OF <channel>". Full-screen canvas night-sky starmap with
parallax drift; each lore = star (x by born_at, y by hash, radius by uses, gold pulse if used
in last 7 days, dim otherwise), faint constellation lines between consecutive entries. Hover
→ title; click → GSAP parchment card with sigil, title, story, Twitch clip iframe
(parent=location.hostname), witness avatars, initiates, uses. Side panel: Loremasters
leaderboard. Stats strip: lore count, initiates, oldest living joke. Live over ws: a new
lore ignites with a supernova.
public/control.html: dark Twitch-style streamer panel: start summon, start trial, threshold
sliders, current ritual state, lore list (edit/delete), and a "Simulate crowd" box (text +
N fake users) for testing.
```

### 6. Hardening + README
```
Review for bugs/races (ritual queueing, vote double counting, ws reconnect in overlay,
clip failure when offline). Add scripts/seed.js with 5 example lore entries + Loremasters so
the Codex page and Trials work from the first run. README: GIF placeholder, what it does,
the loop, architecture, setup (Twitch app, scopes, .env, OBS browser source), demo mode, and
"How we built it with Codex".
```

---

## Time budget (start now)
| Time | Task |
|---|---|
| 0:00-0:40 | Prompt 1, real chat arriving |
| 0:40-1:30 | Prompts 2-3, full ritual working in the console via the simulator |
| 1:30-3:15 | Prompt 4, overlay. Iterate until stunning |
| 3:15-3:45 | Prompt 5 |
| 3:45-4:00 | Prompt 6, push to GitHub |
| 4:00-5:10 | Go live, record, edit, upload to YouTube |
| 5:10-5:30 | Devpost → **SUBMIT** |

**Cut order if behind:** channel points → transcript → control panel polish → starmap (use a card grid) → Trials podium (keep the quiz). **Never cut:** summon → vote → canonization.

## Video (2:50)
- 0:00-0:12 Cold open: a moment on stream → chat types !lore → circle fills with avatars → vote → CANONIZED boom.
- 0:12-0:25 "Every Twitch community runs on inside jokes. New viewers never get them. Now chat writes its own history."
- 0:25-1:10 The loop with callouts: summon, auto clip, AI drafts titles, chat votes, witnesses immortalized.
- 1:10-1:35 Initiation: a newcomer asks → candle ceremony + chat reply with the clip.
- 1:35-2:00 Lore Trials: chat races to answer, Loremaster podium.
- 2:00-2:20 Codex starmap: click a star, the clip plays.
- 2:20-2:42 Built with Codex: quick cuts of the thread, overlay iterations, /status session ID.
- 2:42-2:50 "Lore Codex. Every community has lore." + repo URL.

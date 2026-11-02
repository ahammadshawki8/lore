# LORE

**Turn Twitch moments into legends.**

LORE is a Twitch companion that turns memorable stream moments into community canon. When something legendary happens, chat summons it, names it in a live vote, and canonizes it as a collectible card with a real Twitch clip. Newcomers get initiated into the joke, regulars compete in Lore Trials, and every entry lives on in a public archive.

![LORE canonization card revealed live on Twitch, with the bot posting the auto-created clip in chat](docs/live-on-twitch.jpg)

*A real run on twitch.tv/ahammadshawki8: chat summoned the moment, voted on its name, and LORE canonized it with an auto-created Twitch clip.*

## Try it now (no install)

| Page | Live link | What it is |
| --- | --- | --- |
| Home | [ahammadshawki8.github.io/lore](https://ahammadshawki8.github.io/lore/) | Landing page with a live overlay preview |
| Overlay demo | [overlay.html?demo=1&bg=1](https://ahammadshawki8.github.io/lore/overlay.html?demo=1&bg=1) | Every scene, looping over the demo game |
| Archive | [codex.html](https://ahammadshawki8.github.io/lore/codex.html) | Starmap and card binder from a real LORE run, with its Twitch clip |
| Control room | [control.html](https://ahammadshawki8.github.io/lore/control.html) | Preview of the streamer dashboard (needs the local server to drive rituals) |

## Run it locally (no Twitch account needed)

```bash
git clone https://github.com/ahammadshawki8/lore && cd lore
npm install
npm run seed
npm start
```

Open the same pages on your machine at `localhost:3000` (`/`, `/overlay.html?demo=1&bg=1`, `/codex.html`, `/control.html`). The control room's crowd simulators run every feature without Twitch credentials.

## The ritual

1. **Summon.** Viewers type `!lore`. Each witness locks onto the summoning circle.
2. **Name it.** LORE auto-clips the moment, reads recent chat and drafts three names. Chat votes `1`, `2` or `3`.
3. **Canonize.** The winner is revealed as a collectible LORE card, and the bot posts it in chat with the clip.
4. **Initiate.** A newcomer asks what a joke means (or types `!lore <phrase>`). LORE explains it with the clip and celebrates the initiation on stream.
5. **Lore Trials.** The streamer runs a quiz built from the channel's own canon. Fastest correct answers become Loremasters.
6. **Recall.** When three chatters repeat a canonized phrase, a "Lore recalled" chip keeps the old joke alive.
7. **Raid welcome.** Raiders get a raid alert and the channel's top 3 lore cards, plus an invite to type `!lore`.

**Rarity is participation.** Every summoner and voter is printed on the card as a witness: 1 to 3 witnesses mint a Common card, 4 to 6 Rare, 7 to 9 Epic, 10+ Legendary.

**Broadcast layout.** Graphics live in a right-side panel (summon, trials, raid lore) and a lower third (vote, initiation, raid alert), so the game stays visible. Only the card reveal takes center stage, for a few seconds.

| Summon (right panel) | Vote (lower third) |
| --- | --- |
| ![Summoning circle with witness avatars](docs/summon.jpg) | ![Three title options with live vote bars](docs/vote.jpg) |
| **Canonization (center stage)** | **Lore Trials** |
| ![Legendary LORE card reveal](docs/canonization.jpg) | ![Lore Trials quiz with Loremasters podium](docs/trials.jpg) |
| **Raid welcome** | **The archive** |
| ![Raid alert and top lore welcome panel](docs/raid.jpg) | ![Starmap and collectible card binder](docs/archive.jpg) |

### Chat commands

| Who | Message | Effect |
| --- | --- | --- |
| Anyone | `!lore` | Join (or start) a summoning |
| Anyone | `1`, `2`, `3` | Vote during the naming vote |
| Anyone | `!lore <phrase>` | Learn what a lore entry means |
| Anyone | "what's the bucket thing??" | Natural questions about canon trigger an initiation |
| Broadcaster or mod | `!trial` | Start a Lore Trial |
| Anyone | `A`, `B`, `C`, `D` | Answer during a trial |

## Connect your Twitch channel

Requirements: Node.js 20 or newer.

1. Generate a token at [twitchtokengenerator.com](https://twitchtokengenerator.com/) with **Custom Scope Token** and the scopes `user:read:chat user:write:chat user:bot clips:edit`.
2. Copy `.env.example` to `.env` and set `ACCESS_TOKEN` and `CLIENT_ID`. `OPENAI_API_KEY` is optional, and `PORT` defaults to `3000`.
3. Run `npm start`. The server validates the token and subscribes to chat and raid events for that channel.
4. In OBS, add a **Browser Source** pointing at your local server, `localhost:3000/overlay.html`, at 1920 x 1080. Enable **Control audio via OBS** to hear the synthesized sound effects.

Clips are created only while the channel is live. Every ritual still completes without one.

### AI naming

With `OPENAI_API_KEY` set, LORE drafts titles, an origin story, a newcomer explainer and a quiz question with OpenAI. Without a key, a deterministic local drafter picks the phrase chat was repeating and names the moment, so LORE is free to run.

## How it works

```text
Twitch EventSub (chat, raids)
        |
        v
src/twitch.js --> ritual.js / initiation.js / trials.js / detector.js / raid.js
        |                         |
        | Helix API               | data/*.json (atomic writes)
        v                         v
   chat, clips, users     lore archive, initiates, Loremasters
                                  |
                                  v
                    Express API + WebSocket (/ws)
                     /            |             \
               OBS overlay   Control room    Archive page
```

**Twitch integration:** EventSub WebSocket (`channel.chat.message`, `channel.raid`), Helix Send Chat Message, Create Clip and Get Clips, Get Users (witness avatars), Get Streams and Channels (stream context).

| Path | Purpose |
| --- | --- |
| `src/server.js` | Express API, WebSocket broadcast, simulators |
| `src/twitch.js` | EventSub connection and Helix helpers |
| `src/ritual.js` | Summon, decipher, vote and canonize state machine |
| `src/lorekeeper.js` | AI or offline naming of each moment |
| `src/initiation.js` | `!lore <phrase>` and newcomer question detection |
| `src/trials.js` | Lore Trials and the Loremasters leaderboard |
| `src/detector.js` | Chat pressure and lore recall |
| `src/raid.js` | Raid welcome |
| `src/storage.js` | Atomic JSON persistence |
| `public/` | Overlay, archive, control room, landing page, Bucket Quest demo game |
| `scripts/seed.js` | Sample lore and Loremasters (`npm run seed`) |
| `scripts/smoke.js` | Offline end-to-end test (`npm run smoke`) |

## How we built it with Codex

LORE was built in one Codex CLI thread (session `01a19d28-4159-73c3-bd36-d3f64e531f16`), one focused prompt at a time. Every prompt is committed in [`codex-prompts/`](codex-prompts/) in order:

| Step | Prompt | What Codex built |
| --- | --- | --- |
| 1 | `01-scaffold-twitch` | EventSub WebSocket chat, Helix chat, clips, users, streams |
| 2 | `02-ritual-engine` | Ritual state machine, chat pressure detector, simulators, offline smoke test |
| 3 | `03-initiation-trials` | Newcomer initiation, Lore Trials, Loremasters, seed data |
| 4 | `04` to `04d` | The OBS overlay, then three visual review rounds driven by real screenshots |
| 5 | `05`, `07`, `07b`, `12` | Archive starmap and card binder, control room |
| 6 | `06-hardening-readme` | Race fixes, atomic writes, reconnects, docs |
| 7 | `08-stage-game` | Bucket Quest, an original demo game for streams |
| 8 | `09` to `11` | Naming fallback after a live test, design system pass, broadcast layout |
| 9 | `13-raid-welcome-recall` | Raid EventSub welcome and lore recall |

Codex followed the project rules in [`AGENTS.md`](AGENTS.md), and every step ended with `npm run smoke`, which plays a full ritual, initiation, trial, recall and raid with stubbed Twitch calls. Between Codex steps we reviewed screenshots of every scene at 1920x1080 over real gameplay and polished layout and readability by hand (for example `public/overlay.polish.css`).

## License

MIT. See [LICENSE](LICENSE).

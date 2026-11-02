Next step: the ritual engine. Build on the existing src/twitch.js and src/server.js.

1) src/ritual.js: a single state machine IDLE -> SUMMONING -> DECIPHERING -> VOTING ->
CANONIZED -> IDLE. Requests arriving while busy are queued (never two rituals at once).
- SUMMONING starts when anyone types exactly "!lore" (no args). Lasts summonSeconds (20).
  Each distinct chatter who types !lore joins: broadcast('summon', { joiners:[{login,
  display_name, avatar}], needed, endsAt }). At threshold (summonThreshold, default 3)
  -> DECIPHERING. If time runs out: broadcast('fizzle') -> IDLE.
- DECIPHERING: snapshot the last 40 chat messages (keep a ring buffer of recent chat) +
  getStream() info; call createClip() and lorekeeper.draft(context) IN PARALLEL;
  broadcast('decipher', { summoners }) immediately.
- VOTING: broadcast('vote_open', { titles:[3], endsAt }). Count chat messages that are
  exactly "1", "2" or "3" (one vote per user, last vote wins) for voteSeconds (20);
  broadcast('vote_tally', { counts:[a,b,c], voters }) every 500ms. Winner = most votes,
  ties -> lowest index. Post the result in chat via sendChat.
- CANONIZED: create entry { id, n, title, story, explainer, sigil, phrase, clip,
  witnesses:[{login, display_name, avatar}] (summoners + voters, deduped, max 12),
  born_at, uses:0, initiates:0, trial }, save to data/lore.json (create folder if missing),
  broadcast('canonized', entry), sendChat("📜 LORE #n CANONIZED: <title> — <clip url>").

2) src/lorekeeper.js: draft(context) returns { titles[3], story, explainer, sigil, phrase,
trial:{question} }. If OPENAI_API_KEY is set, call OpenAI (official openai package, a fast
current model, JSON output) with the chat context and stream title/category: titles are short
epic/funny names in 3 distinct styles; story is a 2-sentence mock-heroic chronicle that names
the streamer; explainer is 1 plain sentence for a newcomer; sigil is one emoji; phrase is the
key phrase/emote chat was repeating; trial.question is a quiz question whose answer is the
lore title. If no key, the call fails, or it takes > 8s: deterministic FALLBACK that finds
the most repeated non-command phrase in the context and builds titles like
"The <Phrase> Incident", "Saga of the <Phrase>", "The Great <Phrase> of <Month Day>", plus
a templated story/explainer. The app must fully work with zero OpenAI key.

3) src/detector.js: normalized phrases/emotes, rolling 30s window vs 10-min baseline,
counted only from >= 3 distinct chatters; broadcast('pressure', { phrase, value 0..1 })
every 500ms (a hint only, it never canonizes). If a message contains a canonized lore's
phrase, increment that lore's uses (persist, throttled).

4) Testing endpoints (same pipeline as real chat):
- POST /api/simulate { login, text } injects one fake chat message.
- POST /api/simulate/crowd { texts:[...], users:N, intervalMs } injects messages from N
  fake users (e.g. "lurker_1"); fake users get a generated avatar URL
  (https://api.dicebear.com/9.x/bottts/svg?seed=<login>).
- GET/POST /api/config to read/update summonThreshold, summonSeconds, voteSeconds.
- GET /api/lore returns all entries.
For fake users, sendChat should still be called (it just posts to the real channel).

Then test it yourself end to end WITHOUT Twitch input: write scripts/smoke.js that starts
the pipeline in-process (or calls the HTTP endpoints while the server runs), simulates 3
users typing !lore, then votes, and asserts a lore entry is saved. Run it and fix anything
that fails. Summarize.

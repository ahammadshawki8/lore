Next step: newcomer initiation + the Lore Trials quiz. Build on the existing code.

1) Initiation (in a new src/initiation.js wired into the chat handler):
- "!lore <word(s)>" fuzzy-matches a lore entry (title, phrase, or explainer; simple
  normalized token-overlap scoring). On a match: sendChat("@user 📜 <title>: <explainer>
  <clip url>"), increment that lore's initiates (persist), and broadcast('initiation',
  { user:{login, display_name, avatar}, lore, initiateNumber }) where initiateNumber is the
  channel-wide count of distinct initiated users (persist a set in data/).
- Auto-initiate: if a chatter's FIRST message this session (or an "is first message" flag
  from EventSub if available) asks what something means ("what is X", "what does X mean",
  "what's X", "??" after a canonized phrase) and X matches a lore entry, do the same.
- No match: sendChat("@user that lore is not yet written. Witness something legendary and type !lore").

2) Lore Trials (src/trials.js):
- "!trial" (broadcaster or moderator badge only; fake simulated users with login starting
  "streamer" also allowed for testing) picks a random lore entry with its trial.question
  (or "Which lore was born when: <story>?"), plus 3 decoy titles from other entries (generate
  plausible fake titles if there are fewer than 4 entries). Shuffle into options A-D.
- broadcast('trial_open', { question, options:[4], endsAt }) and sendChat the question with
  options. Accept "A"/"B"/"C"/"D" (case-insensitive, exact message) for trialSeconds (20),
  first answer per user counts; broadcast('trial_tally', { counts }) every 500ms.
- Score: correct = 100 + speed bonus up to 50. Persist the Loremasters leaderboard
  (data/loremasters.json). broadcast('trial_result', { correctIndex, correctUsers:[{login,
  display_name, avatar}], leaderboard: top 5 with avatars }) and sendChat the winner.
- Trials must not run during a ritual (queue or reject politely).
- GET /api/loremasters returns the leaderboard.

3) scripts/seed.js: writes 5 rich example lore entries (varied sigils, stories, explainers,
believable phrases like "the bucket", "chat is this real", "ladder", spread over the last
3 weeks with uses/initiates counts, clip null) and a 6-person Loremasters leaderboard, only
if data/ is empty (or with --force). Add "seed" to package.json scripts.

Extend scripts/smoke.js to also test: !lore <word> initiation and a full trial round with
simulated answers. Run seed + smoke and fix failures. Summarize.

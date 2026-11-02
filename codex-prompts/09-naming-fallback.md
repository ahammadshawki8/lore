Live test on Twitch worked end to end (summon, real clip, vote, canon, initiation, trial).
One bug: with no OPENAI_API_KEY the fallback title used a whole chat sentence:
"Saga of the NO WAY the bucket survived that KEKW". Fix the deterministic fallback in
src/lorekeeper.js:

- Pick the key phrase as the most repeated 1-3 word n-gram across DISTINCT chatters in the
  context (ignore commands, numbers, single letters, stopwords, and emote/slang tokens like
  KEKW, LUL, LMAO, LMAOOO, OMEGALUL, POG, W, L, fr, nah, lol, chat, this, that). Prefer nouns
  that also appear in the stream title or the last messages. "bucket" must win for messages
  like "NO WAY the bucket survived that", "THE BUCKET", "bucket did it again".
- Title-case it and keep titles to 2-5 words, using 3 distinct, fun templates chosen from a
  larger pool, e.g. "The Bucket Incident", "Saga of the Unbreakable Bucket", "The Great Bucket
  Landing", "Bucket Ascendant", "The Pillar Prophecy" (use a second keyword when available,
  like "pillar" or "landing").
- Story/explainer templates should read naturally with the phrase (2 sentences, mock-heroic,
  name the streamer). The trial question should not reveal the answer word-for-word.
- Add unit checks to scripts/smoke.js for this exact case.

No em dashes. Run npm run smoke. Summarize.

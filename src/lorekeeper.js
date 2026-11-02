const STOP_WORDS = new Set((
  'a an and are as at be because been before being between but by can could did do does doing down during each for from had has have having he her here hers him his how i if in into is it its just me more most my no nor not of off on once one or our out over own she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which who why will with would you your yours ' +
  'chat ekwk kekw lul lmao lmaoo lmaooo omegalul pog w l fr nah lol haha hahahaha xd gg omg brb afk ' +
  'again did do does doing is are was were be been being am has have had having go goes went going gone get gets got getting make makes made making see sees saw seen seeing say says said saying survive survives survived surviving happen happens happened happening fall falls fell fallen falling land lands landed hit hits hit hitting turn turns turned turning look looks looked looking think thinks thought know knows knew known want wants wanted try tries tried trying'
).split(/\s+/));

const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
const NON_NOUNS = new Set('quickly suddenly ordinary impossible amazing great good bad real sure way really very just offline'.split(' '));

function tokens(text) {
  return String(text ?? '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/![\p{L}\p{N}_]+/gu, ' ')
    .match(TOKEN_PATTERN)?.map((token) => token.replace(/[’']/g, '').toLowerCase()) ?? [];
}

function eligible(token) {
  return token.length > 1 && !/^\d+$/.test(token) && !STOP_WORDS.has(token);
}

function titleCase(phrase) {
  return phrase.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function candidatePhrases(messages, streamTitle) {
  const counts = new Map();
  const titleTokens = new Set(tokens(streamTitle).filter(eligible));
  const recentStart = Math.max(0, messages.length - 8);

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex];
    const chatter = String(message.login || message.user_id || '').toLowerCase();
    if (!chatter) continue;
    const words = tokens(message.text);
    const inMessage = new Set();
    for (let start = 0; start < words.length; start += 1) {
      for (let length = 1; length <= 3 && start + length <= words.length; length += 1) {
        const gram = words.slice(start, start + length);
        if (!gram.every(eligible)) continue;
        const phrase = gram.join(' ');
        inMessage.add(phrase);
      }
    }
    for (const phrase of inMessage) {
      let candidate = counts.get(phrase);
      if (!candidate) {
        const phraseWords = phrase.split(' ');
        candidate = {
          phrase,
          words: phraseWords,
          chatters: new Set(),
          recentChatters: new Set(),
          titleMatches: phraseWords.filter((word) => titleTokens.has(word)).length,
          lastSeen: -1,
          nounHint: phraseWords.filter((word) => !NON_NOUNS.has(word)).length,
        };
        counts.set(phrase, candidate);
      }
      candidate.chatters.add(chatter);
      if (messageIndex >= recentStart) candidate.recentChatters.add(chatter);
      candidate.lastSeen = messageIndex;
    }
  }

  return [...counts.values()].sort((a, b) =>
    b.chatters.size - a.chatters.size ||
    b.titleMatches - a.titleMatches ||
    b.recentChatters.size - a.recentChatters.size ||
    b.nounHint - a.nounHint ||
    b.words.length - a.words.length ||
    b.lastSeen - a.lastSeen ||
    a.phrase.localeCompare(b.phrase),
  );
}

function selectPhrase(candidates) {
  const best = candidates.find((candidate) => candidate.words.length <= 3);
  return best?.phrase || 'unwritten legend';
}

function selectSecondary(candidates, phrase, streamTitle) {
  const used = new Set(phrase.split(' '));
  const fromChat = candidates.filter((candidate) => candidate.words.length === 1 && !used.has(candidate.phrase));
  const streamWords = tokens(streamTitle).filter((word) => eligible(word) && !used.has(word) && !NON_NOUNS.has(word));
  const fromStream = streamWords.map((word) => ({ phrase: word, chatters: new Set(), titleMatches: 1, recentChatters: new Set(), nounHint: 1, lastSeen: -1 }));
  const secondary = [...fromChat, ...fromStream].filter((candidate) => !NON_NOUNS.has(candidate.phrase))
    .sort((a, b) => b.chatters.size - a.chatters.size || b.titleMatches - a.titleMatches || b.recentChatters.size - a.recentChatters.size || b.lastSeen - a.lastSeen)[0];
  return secondary?.phrase ? titleCase(secondary.phrase) : '';
}

function stableHash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function buildTitles(phrase, secondary, seed) {
  const key = titleCase(phrase);
  const templates = [
    () => `The ${key} Incident`,
    () => `Saga of the ${key}`,
    () => `The Great ${key} Landing`,
    () => `${key} Ascendant`,
    () => `The ${key} Prophecy`,
    () => `Ballad of ${key}`,
    () => `The ${key} Triumph`,
    () => `${key} Unbound`,
  ];
  const allowed = templates.filter((template) => {
    const title = template();
    const words = title.split(/\s+/);
    return words.length >= 2 && words.length <= 5;
  });
  const offset = stableHash(seed) % allowed.length;
  const ordered = [...allowed.slice(offset), ...allowed.slice(0, offset)];
  const selected = ordered.slice(0, Math.min(secondary ? 2 : 3, ordered.length)).map((template) => template());
  if (secondary) {
    const paired = [
      `The ${key} ${secondary}`,
      `The ${secondary} ${key}`,
      `${key} ${secondary} Oath`,
    ].find((title) => title.split(/\s+/).length <= 5 && title.split(/\s+/).length >= 2 && !selected.includes(title));
    if (paired) selected.push(paired);
  }
  for (const template of ordered) {
    if (selected.length === 3) break;
    const title = template();
    if (!selected.includes(title)) selected.push(title);
  }
  return selected;
}

function fallback(context) {
  const messages = context.messages ?? [];
  const streamTitle = context.stream?.title ?? '';
  const candidates = candidatePhrases(messages, streamTitle);
  const phrase = selectPhrase(candidates);
  const secondary = selectSecondary(candidates, phrase, streamTitle);
  const streamer = String(context.streamer || context.login || 'the streamer').trim();
  const titleSeed = `${phrase}|${streamTitle}|${messages.map((message) => message.text).join('|')}`;
  return {
    titles: buildTitles(phrase, secondary, titleSeed),
    story: `When chat rallied around the ${phrase}, ${streamer} faced a marvel worthy of the old songs. The witnesses raised a chorus, and the moment took its place in community legend.`,
    explainer: `The phrase "${phrase}" recalls a surprising moment from ${streamer}'s stream.`,
    sigil: '\u{1F4DC}',
    phrase,
    trial: { question: `What unexpected turn did ${streamer} face during the stream?` },
  };
}

function validateDraft(value, context) {
  if (!Array.isArray(value.titles) || value.titles.length !== 3 || value.titles.some((title) => typeof title !== 'string' || !title.trim())) {
    throw new Error('OpenAI draft did not contain three titles');
  }
  for (const key of ['story', 'explainer', 'sigil', 'phrase']) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(`OpenAI draft is missing ${key}`);
  }
  if (typeof value.trial?.question !== 'string' || !value.trial.question.trim()) throw new Error('OpenAI draft is missing trial.question');
  return {
    titles: value.titles.map((title) => title.trim()),
    story: value.story.trim(),
    explainer: value.explainer.trim(),
    sigil: value.sigil.trim(),
    phrase: value.phrase.trim(),
    trial: { question: value.trial.question.trim() },
  };
}

async function openAiDraft(context) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Create a Twitch community lore draft. Return JSON with titles (exactly 3 short epic/funny titles in distinct styles), story (exactly 2 mock-heroic sentences naming the streamer), explainer (one plain sentence for a newcomer), sigil (one emoji), phrase (the key phrase or emote chat repeated), and trial {question} (a quiz question whose answer is one of the titles).',
      },
      {
        role: 'user',
        content: JSON.stringify({ streamer: context.streamer, stream: context.stream, messages: context.messages }),
      },
    ],
  });
  return validateDraft(JSON.parse(response.choices[0].message.content), context);
}

export async function draft(context) {
  if (!process.env.OPENAI_API_KEY) return fallback(context);
  let timeout;
  try {
    return await Promise.race([
      openAiDraft(context),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('OpenAI draft exceeded 8 seconds')), 8000); }),
    ]);
  } catch (error) {
    console.warn(`[lorekeeper] Using deterministic fallback: ${error.message}`);
    return fallback(context);
  } finally {
    clearTimeout(timeout);
  }
}

export { fallback as fallbackDraft };

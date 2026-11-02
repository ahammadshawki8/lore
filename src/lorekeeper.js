function cleanPhrase(text) {
  return String(text ?? '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/![\p{L}\p{N}_]+/gu, '')
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallback(context) {
  const counts = new Map();
  for (const message of context.messages ?? []) {
    const text = cleanPhrase(message.text);
    if (!text || /^\d+$/.test(text)) continue;
    const key = text.toLowerCase();
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { phrase: text, count: 1 });
  }
  const repeated = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.phrase;
  const phrase = (repeated || 'Mystery').replace(/^(?:the|a|an)\s+/i, '');
  const titlePhrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  const monthDay = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const streamer = context.streamer || context.login || 'the streamer';
  return {
    titles: [`The ${titlePhrase} Incident`, `Saga of the ${titlePhrase}`, `The Great ${titlePhrase} of ${monthDay}`],
    story: `When ${phrase} echoed through the channel, ${streamer} faced a marvel fit for the old songs. The chat stood witness as an ordinary moment became a legend of laughter and daring.`,
    explainer: `The community remembers this moment because chat rallied around \u201c${phrase}\u201d while ${streamer} was live.`,
    sigil: '\u{1F4DC}',
    phrase,
    trial: { question: `Which title was chosen for the lore about ${phrase}?` },
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

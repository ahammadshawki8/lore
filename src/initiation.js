import { readFile } from 'node:fs/promises';
import { loadLore, saveLore, writeJsonAtomic } from './storage.js';

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'does', 'do', 'for', 'how', 'i', 'is', 'it', 'mean', 'of', 'or', 'the', 'this', 'to', 'what', 'when', 'where', 'who', 'why']);

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter((token) => token && !STOP_WORDS.has(token));
}

export function matchLore(query, entries) {
  const queryTokens = new Set(tokens(query));
  if (!queryTokens.size) return null;
  let best = null;
  for (const lore of entries) {
    let score = 0;
    for (const value of [lore.title, lore.phrase, lore.explainer]) {
      const fieldTokens = new Set(tokens(value));
      if (!fieldTokens.size) continue;
      let overlap = 0;
      for (const token of queryTokens) if (fieldTokens.has(token)) overlap += 1;
      score = Math.max(score, overlap / Math.max(queryTokens.size, fieldTokens.size));
    }
    if (score >= 0.25 && (!best || score > best.score)) best = { lore, score };
  }
  return best?.lore ?? null;
}

function requestedMeaning(text) {
  const value = String(text ?? '').trim();
  const patterns = [
    /^what\s+does\s+(.+?)\s+mean[?!.]*$/i,
    /^what\s+is\s+(.+?)[?!.]*$/i,
    /^what(?:'s|\u2019s)\s+(.+?)[?!.]*$/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  if (/\?\?\s*$/.test(value)) return value.replace(/\?+\s*$/, '').trim();
  return null;
}

async function loadInitiatedUsers(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    return new Set((Array.isArray(value) ? value : value.users ?? []).map((login) => String(login).toLowerCase()));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function saveInitiatedUsers(users, file) {
  await writeJsonAtomic(file, { users: [...users].sort() });
}

export async function startInitiation({
  chatEvents,
  broadcast,
  sendChat,
  getUsers,
  getLore,
  lorePath = 'data/lore.json',
  usersPath = 'data/initiation-users.json',
}) {
  const initiatedUsers = await loadInitiatedUsers(usersPath);
  const seenThisSession = new Set();
  const entries = getLore ?? (() => loadLore(lorePath));
  let persistQueue = Promise.resolve();
  const handleMessage = (message) => {
    void onMessage(message).catch((error) => console.error(`[initiation] Could not process chat message: ${error.message}`));
  };

  async function avatarFor(message) {
    if (message.avatar) return message.avatar;
    if (!getUsers) return null;
    try {
      const profiles = await getUsers([message.login]);
      return profiles?.[message.login] ?? null;
    } catch (error) {
      console.warn(`[initiation] Could not load chatter avatar: ${error.message}`);
      return null;
    }
  }

  function persist(users) {
    const initiatedSnapshot = new Set(initiatedUsers);
    const loreSnapshot = [...users];
    persistQueue = persistQueue.catch(() => {}).then(() => Promise.all([
      saveLore(loreSnapshot, lorePath),
      saveInitiatedUsers(initiatedSnapshot, usersPath),
    ]));
    return persistQueue;
  }

  async function initiate(message, lore) {
    const users = await Promise.resolve(entries());
    const liveLore = users.find((item) => item.id === lore.id) ?? lore;
    liveLore.initiates = (liveLore.initiates ?? 0) + 1;
    const login = message.login.toLowerCase();
    initiatedUsers.add(login);
    const avatar = await avatarFor(message);
    await persist(users);
    const clipUrl = liveLore.clip?.url ?? '';
    try {
      await sendChat(`@${message.login} \u{1F4DC} ${liveLore.title}: ${liveLore.explainer} ${clipUrl}`.trim());
    } catch (error) {
      console.error(`[initiation] Could not send initiation response: ${error.message}`);
    }
    broadcast('initiation', {
      user: { login: message.login, display_name: message.display_name || message.login, avatar },
      lore: liveLore,
      initiateNumber: initiatedUsers.size,
    });
  }

  async function onMessage(message) {
    const login = String(message.login ?? '').toLowerCase();
    const isFirst = Boolean(message.is_first_message) || !seenThisSession.has(login);
    seenThisSession.add(login);

    const command = String(message.text ?? '').match(/^!lore\s+(.+?)\s*$/i);
    if (command) {
      const lore = matchLore(command[1], await Promise.resolve(entries()));
      if (lore) await initiate(message, lore);
      else {
        try {
          await sendChat(`@${message.login} that lore is not yet written. Witness something legendary and type !lore`);
        } catch (error) {
          console.error(`[initiation] Could not send missing-lore response: ${error.message}`);
        }
      }
      return;
    }

    if (!isFirst) return;
    const query = requestedMeaning(message.text);
    if (!query) return;
    const lore = matchLore(query, await Promise.resolve(entries()));
    if (lore) await initiate(message, lore);
  }

  chatEvents.on('message', handleMessage);
  return {
    getInitiatedUsers: () => [...initiatedUsers],
    stop: () => chatEvents.off('message', handleMessage),
  };
}

import { loadLore, saveLore } from './storage.js';

const WINDOW_MS = 30_000;
const BASELINE_MS = 10 * 60_000;

function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}_ ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function loreMatch(text, phrase) {
  const normalizedText = normalize(text);
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase && normalizedText.includes(normalizedPhrase));
}

export function startDetector({ chatEvents, broadcast, dataPath = 'data/lore.json', getLore = () => loadLore(dataPath), save = (entries) => saveLore(entries, dataPath), now = Date.now }) {
  const messages = [];
  let saveTimer;

  function onMessage(message) {
    const at = now();
    const phrase = normalize(message.text);
    if (phrase && !phrase.startsWith('!') && !/^[123]$/.test(phrase)) messages.push({ phrase, login: message.login, at });
    while (messages.length && messages[0].at < at - BASELINE_MS) messages.shift();

    void Promise.resolve().then(() => getLore()).then((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (entry.phrase && loreMatch(message.text, entry.phrase)) {
          entry.uses = (entry.uses ?? 0) + 1;
          changed = true;
        }
      }
      if (changed) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void save(entries).catch((error) => console.error(`[detector] Could not save lore uses: ${error.message}`)), 1000);
      }
    }).catch((error) => console.error(`[detector] Could not load lore: ${error.message}`));
  }

  function tick() {
    const at = now();
    while (messages.length && messages[0].at < at - BASELINE_MS) messages.shift();
    const short = messages.filter((message) => message.at >= at - WINDOW_MS);
    const groups = new Map();
    for (const message of short) {
      let group = groups.get(message.phrase);
      if (!group) groups.set(message.phrase, group = { logins: new Set(), count: 0 });
      group.count += 1;
      group.logins.add(message.login);
    }
    const active = [...groups.entries()]
      .filter(([, group]) => group.logins.size >= 3)
      .sort((a, b) => b[1].count - a[1].count)[0];
    if (!active) {
      broadcast('pressure', { phrase: '', value: 0 });
      return;
    }
    const [phrase, group] = active;
    const baselineCount = messages.filter((message) => message.phrase === phrase).length;
    const baselineRate = baselineCount / (BASELINE_MS / WINDOW_MS);
    const lift = group.count / Math.max(1, baselineRate);
    broadcast('pressure', { phrase, value: Math.max(0, Math.min(1, (lift - 1) / 4)) });
  }

  chatEvents.on('message', onMessage);
  const timer = setInterval(tick, 500);
  return () => {
    chatEvents.off('message', onMessage);
    clearInterval(timer);
    clearTimeout(saveTimer);
  };
}

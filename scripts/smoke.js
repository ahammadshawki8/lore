import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { unlink } from 'node:fs/promises';
import { startDetector } from '../src/detector.js';
import { startRitualEngine } from '../src/ritual.js';

const dataPath = 'data/lore.smoke.json';
const events = [];
const sent = [];
const chatEvents = new EventEmitter();
const broadcast = (type, data) => events.push({ type, data });
const previousApiKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;

const engine = await startRitualEngine({
  chatEvents,
  broadcast,
  sendChat: async (text) => sent.push(text),
  createClip: async () => null,
  getStream: async () => ({ title: 'Offline smoke stream', game_name: 'Testing', is_live: false }),
  getUsers: async (logins) => Object.fromEntries(logins.map((login) => [login, `https://example.test/${login}.png`])),
  dataPath,
  config: { summonThreshold: 3, summonSeconds: 2, voteSeconds: 0.5 },
});
const stopDetector = startDetector({
  chatEvents,
  broadcast,
  dataPath,
  getLore: engine.getLore,
});

function inject(login, text) {
  chatEvents.emit('message', {
    id: `${login}-${Date.now()}-${Math.random()}`,
    user_id: `fake-${login}`,
    login,
    display_name: login,
    text,
    emotes: [],
    badges: [],
    color: null,
    ts: new Date().toISOString(),
    avatar: `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(login)}`,
  });
}

function waitFor(type, timeoutMs = 5000) {
  const existing = events.find((event) => event.type === type);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      const event = events.find((item) => item.type === type);
      if (event) {
        clearInterval(poll);
        resolve(event);
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(poll);
        reject(new Error(`Timed out waiting for ${type}`));
      }
    }, 10);
  });
}

try {
  inject('lore_fan_1', 'The dragon chair!');
  inject('lore_fan_2', 'The dragon chair!');
  inject('lore_fan_1', '!lore');
  inject('lore_fan_2', '!lore');
  inject('lore_fan_3', '!lore');

  await waitFor('vote_open');
  inject('voter_1', '1');
  inject('voter_2', '2');
  inject('voter_3', '3');
  const canonized = await waitFor('canonized');

  assert.equal(canonized.data.title, 'The Dragon chair Incident');
  assert.equal(canonized.data.n, 1);
  assert.equal(engine.getLore().length, 1);
  assert.ok(sent.some((message) => message.includes('CANONIZED')));
  const { readFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile(dataPath, 'utf8'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, canonized.data.id);
  console.log('[smoke] Ritual completed, vote tie selected title 1, and lore entry was saved.');
} finally {
  engine.stop();
  stopDetector();
  try { await unlink(dataPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
}

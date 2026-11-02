import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile, unlink } from 'node:fs/promises';
import { startDetector } from '../src/detector.js';
import { createRaidHandler } from '../src/raid.js';
import { startInitiation } from '../src/initiation.js';
import { fallbackDraft } from '../src/lorekeeper.js';
import { startRitualEngine } from '../src/ritual.js';
import { startTrials } from '../src/trials.js';

const dataPath = 'data/lore.smoke.json';
const initiatedPath = 'data/initiation-users.smoke.json';
const leaderboardPath = 'data/loremasters.smoke.json';
const events = [];
const sent = [];
const chatEvents = new EventEmitter();
const broadcast = (type, data) => events.push({ type, data });
const previousApiKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;

const featureEvents = [];
const featureChats = [];
const raidHandler = createRaidHandler({
  sendChat: async (text) => featureChats.push(text),
  broadcast: (type, data) => featureEvents.push({ type, data }),
  getUsers: async (logins) => Object.fromEntries(logins.map((login) => [login, `https://example.test/${login}.png`])),
  getLore: async () => [
    { id: 'lore-one', title: 'First legend', uses: 2 },
    { id: 'lore-two', title: 'Most remembered', uses: 12 },
    { id: 'lore-three', title: 'Second most remembered', uses: 8 },
    { id: 'lore-four', title: 'Third most remembered', uses: 5 },
  ],
});
await raidHandler({ from: { login: 'visiting_party', display_name: 'Visiting Party' }, viewers: 42 });
assert.deepEqual(featureChats, ['Welcome raiders from Visiting Party! New here? Type !lore to learn our legends.']);
const raidEvent = featureEvents.find((event) => event.type === 'raid');
assert.equal(raidEvent.data.viewers, 42);
assert.equal(raidEvent.data.from.avatar, 'https://example.test/visiting_party.png');
assert.deepEqual(raidEvent.data.top.map((entry) => entry.id), ['lore-two', 'lore-three', 'lore-four']);

const recallChat = new EventEmitter();
const recallEvents = [];
const recallLore = [{ id: 'recall-lore', title: 'The Dragon Chair', phrase: 'dragon chair', sigil: '✧', uses: 0 }];
let recallTime = 100_000;
const stopRecallDetector = startDetector({
  chatEvents: recallChat,
  broadcast: (type, data) => recallEvents.push({ type, data }),
  getLore: async () => recallLore,
  save: async () => {},
  now: () => recallTime,
});
const mention = (login) => recallChat.emit('message', { login, user_id: login, text: 'dragon chair' });
const flushDetector = async () => new Promise((resolve) => setImmediate(resolve));
for (let count = 0; count < 3; count += 1) mention('same_chatter');
mention('second_chatter');
mention('third_chatter');
mention('fourth_chatter');
await flushDetector();
const firstRecall = recallEvents.filter((event) => event.type === 'recall');
assert.equal(firstRecall.length, 1);
assert.equal(firstRecall[0].data.uses, 5);
for (const login of ['fifth_chatter', 'sixth_chatter', 'seventh_chatter']) mention(login);
await flushDetector();
assert.equal(recallEvents.filter((event) => event.type === 'recall').length, 1);
recallTime += 61_000;
for (const login of ['eighth_chatter', 'ninth_chatter', 'tenth_chatter']) mention(login);
await flushDetector();
assert.equal(recallEvents.filter((event) => event.type === 'recall').length, 2);
stopRecallDetector();

const fallbackCase = fallbackDraft({
  streamer: 'TestStreamer',
  stream: { title: 'Pillar Landing Challenge' },
  messages: [
    { login: 'witness_one', text: 'NO WAY the bucket survived that KEKW' },
    { login: 'witness_two', text: 'THE BUCKET' },
    { login: 'witness_three', text: 'bucket did it again' },
    { login: 'witness_one', text: 'impossible landing masterpiece' },
    { login: 'witness_one', text: 'impossible landing masterpiece' },
    { login: 'witness_one', text: 'impossible landing masterpiece' },
  ],
});
assert.equal(fallbackCase.phrase, 'bucket');
assert.equal(fallbackCase.titles.length, 3);
assert.equal(new Set(fallbackCase.titles).size, 3);
assert.ok(fallbackCase.titles.every((title) => {
  const words = title.trim().split(/\s+/);
  return words.length >= 2 && words.length <= 5;
}));
assert.ok(fallbackCase.titles.some((title) => /Pillar|Landing/.test(title)));
assert.equal((fallbackCase.story.match(/[.!?](?:\s|$)/g) ?? []).length, 2);
assert.ok(fallbackCase.story.includes('TestStreamer'));
assert.ok(!fallbackCase.trial.question.toLowerCase().includes(fallbackCase.phrase));
assert.ok(fallbackCase.titles.every((title) => !fallbackCase.trial.question.includes(title)));

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
const initiation = await startInitiation({
  chatEvents,
  broadcast,
  sendChat: async (text) => sent.push(text),
  getUsers: async (logins) => Object.fromEntries(logins.map((login) => [login, `https://example.test/${login}.png`])),
  getLore: engine.getLore,
  lorePath: dataPath,
  usersPath: initiatedPath,
});
const trials = await startTrials({
  chatEvents,
  broadcast,
  sendChat: async (text) => sent.push(text),
  getUsers: async (logins) => Object.fromEntries(logins.map((login) => [login, `https://example.test/${login}.png`])),
  getLore: engine.getLore,
  getRitualState: engine.getState,
  leaderboardPath,
  trialSeconds: 0.5,
  random: () => 0.25,
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

function waitForCount(type, count, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      const matching = events.filter((event) => event.type === type);
      if (matching.length >= count) {
        clearInterval(poll);
        resolve(matching);
      } else if (Date.now() - started >= timeoutMs) {
        clearInterval(poll);
        reject(new Error(`Timed out waiting for ${count} ${type} events`));
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

  const voteOpen = await waitFor('vote_open');
  inject('voter_1', '1');
  inject('voter_2', '2');
  inject('voter_3', '3');
  const canonized = await waitFor('canonized');

  assert.equal(canonized.data.title, voteOpen.data.titles[0]);
  assert.equal(canonized.data.phrase, 'dragon chair');
  assert.equal(canonized.data.n, 1);
  assert.equal(engine.getLore().length, 1);
  assert.ok(sent.some((message) => message.includes('CANONIZED')));
  const saved = JSON.parse(await readFile(dataPath, 'utf8'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, canonized.data.id);

  inject('init_fan', '!lore dragon chair');
  const firstInitiation = await waitFor('initiation');
  assert.equal(firstInitiation.data.lore.id, canonized.data.id);
  assert.equal(firstInitiation.data.initiateNumber, 1);
  assert.equal(engine.getLore()[0].initiates, 1);
  assert.ok(sent.some((message) => message.includes('@init_fan')));

  inject('auto_reader', 'what is the dragon chair?');
  const initiationEvents = await waitForCount('initiation', 2);
  assert.equal(initiationEvents[1].data.initiateNumber, 2);
  assert.deepEqual(JSON.parse(await readFile(initiatedPath, 'utf8')).users, ['auto_reader', 'init_fan']);

  const idleStarted = Date.now();
  while (engine.getState().phase !== 'IDLE' && Date.now() - idleStarted < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(engine.getState().phase, 'IDLE');
  inject('streamer_host', '!trial');
  const trialOpen = await waitFor('trial_open');
  assert.equal(trialOpen.data.options.length, 4);
  const correctIndex = trialOpen.data.options.findIndex((option) => option.title === canonized.data.title);
  assert.notEqual(correctIndex, -1);
  const answer = trialOpen.data.options[correctIndex].letter;
  inject('trial_player', answer);
  inject('trial_player', 'A');
  inject('trial_wrong', answer === 'A' ? 'B' : 'A');
  const result = await waitFor('trial_result');
  assert.equal(result.data.correctIndex, correctIndex);
  assert.equal(result.data.correctUsers.length, 1);
  assert.equal(result.data.correctUsers[0].login, 'trial_player');
  assert.equal(result.data.leaderboard[0].login, 'trial_player');
  assert.equal(JSON.parse(await readFile(leaderboardPath, 'utf8'))[0].score, result.data.leaderboard[0].score);
  console.log('[smoke] Raid welcome, distinct-chatter lore recall, rituals, initiations, and Lore Trials passed.');
} finally {
  engine.stop();
  stopDetector();
  initiation.stop();
  trials.stop();
  for (const file of [dataPath, initiatedPath, leaderboardPath]) {
    try { await unlink(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
}

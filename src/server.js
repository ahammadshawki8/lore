import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { chatEvents, raidEvents, connectTwitch, createClip, getStream, getUsers, sendChat, twitchState, disconnectTwitch } from './twitch.js';
import { startDetector } from './detector.js';
import { startInitiation } from './initiation.js';
import { startRitualEngine } from './ritual.js';
import { saveLore } from './storage.js';
import { startTrials } from './trials.js';
import { createRaidHandler } from './raid.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const port = Number(process.env.PORT) || 3000;

app.use(express.static('public'));
app.use(express.json());
app.get('/api/health', (_request, response) => {
  response.json({ connected: twitchState.connected, login: twitchState.login, error: twitchState.error });
});

let trialEngine;
const ritual = await startRitualEngine({
  chatEvents,
  broadcast,
  sendChat,
  createClip,
  getUsers,
  getStream,
  streamer: () => twitchState.login,
  onPhaseChange: ({ phase }) => {
    if (phase !== 'IDLE') trialEngine?.cancelForRitual();
    broadcast('ritual_state', { phase });
  },
});
const initiation = await startInitiation({
  chatEvents,
  broadcast,
  sendChat,
  getUsers,
  getLore: ritual.getLore,
});
trialEngine = await startTrials({
  chatEvents,
  broadcast,
  sendChat,
  getUsers,
  getLore: ritual.getLore,
  getRitualState: ritual.getState,
});
const stopDetector = startDetector({
  chatEvents,
  broadcast,
  getLore: ritual.getLore,
  save: (entries) => saveLore(entries),
});
const handleRaid = createRaidHandler({ sendChat, broadcast, getUsers, getLore: ritual.getLore });
raidEvents.on('raid', handleRaid);

function simulateMessage(login, text, index = 1) {
  const displayName = login.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  chatEvents.emit('message', {
    id: randomUUID(),
    user_id: `fake-${login}`,
    login,
    display_name: displayName,
    text: String(text),
    emotes: [],
    badges: [],
    color: null,
    ts: new Date().toISOString(),
    avatar: `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(login)}`,
    fake: true,
    sequence: index,
  });
}

app.post('/api/simulate', (request, response) => {
  const { login, text } = request.body ?? {};
  if (typeof login !== 'string' || !login.trim() || typeof text !== 'string') {
    response.status(400).json({ error: 'login and text are required' });
    return;
  }
  simulateMessage(login.trim().toLowerCase(), text);
  response.json({ ok: true });
});

app.post('/api/simulate/crowd', async (request, response) => {
  const { texts, users = 1, intervalMs = 0 } = request.body ?? {};
  if (!Array.isArray(texts) || !texts.every((text) => typeof text === 'string') || !Number.isInteger(Number(users)) || Number(users) < 1) {
    response.status(400).json({ error: 'texts must be an array of strings and users must be a positive integer' });
    return;
  }
  const delayMs = Math.max(0, Math.min(60_000, Number(intervalMs) || 0));
  for (let index = 0; index < texts.length; index += 1) {
    const login = `lurker_${(index % Number(users)) + 1}`;
    simulateMessage(login, texts[index], index + 1);
    if (delayMs && index < texts.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  response.json({ ok: true, injected: texts.length, users: Number(users) });
});

app.post('/api/simulate/raid', (request, response) => {
  const { from, viewers = 24 } = request.body ?? {};
  const source = typeof from === 'string' ? { display_name: from } : from;
  const count = Number(viewers);
  if (!source || typeof source !== 'object' || !Number.isInteger(count) || count < 0) {
    response.status(400).json({ error: 'from and a non-negative integer viewers count are required' });
    return;
  }
  const displayName = String(source.display_name || source.displayName || source.login || '').trim();
  if (!displayName) {
    response.status(400).json({ error: 'from must include a channel name' });
    return;
  }
  const login = String(source.login || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_')).trim();
  raidEvents.emit('raid', {
    from: { login, display_name: displayName, avatar: typeof source.avatar === 'string' ? source.avatar : null },
    viewers: count,
  });
  response.json({ ok: true, from: displayName, viewers: count });
});

app.route('/api/config')
  .get((_request, response) => response.json({ ...ritual.getConfig(), ...trialEngine.getConfig() }))
  .post((request, response) => {
    try {
      const changes = request.body ?? {};
      for (const key of ['summonThreshold', 'summonSeconds', 'voteSeconds', 'trialSeconds']) {
        if (changes[key] === undefined) continue;
        const value = Number(changes[key]);
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number`);
        changes[key] = value;
      }
      const ritualConfig = ritual.updateConfig(changes);
      const trialConfig = trialEngine.updateConfig(changes);
      response.json({ ...ritualConfig, ...trialConfig });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

app.get('/api/lore', (_request, response) => response.json(ritual.getLore()));
app.get('/api/loremasters', (_request, response) => response.json(trialEngine.getLeaderboard()));
app.get('/api/state', (_request, response) => response.json({ ritual: ritual.getState(), trial: trialEngine.getState() }));

app.post('/api/control/summon', (_request, response) => {
  simulateMessage('streamer_control', '!lore');
  response.json({ ok: true, state: ritual.getState() });
});

app.post('/api/control/trial', (_request, response) => {
  simulateMessage('streamer_control', '!trial');
  response.json({ ok: true, state: trialEngine.getState() });
});

app.delete('/api/lore/:id', async (request, response) => {
  try {
    const deleted = await ritual.deleteLore(request.params.id);
    if (!deleted) { response.status(404).json({ error: 'Lore entry not found' }); return; }
    response.json({ ok: true, id: request.params.id });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request));
});

export function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

chatEvents.on('message', (message) => {
  console.log(`[chat] ${message.login}: ${message.text}`);
  broadcast('chat', message);
});

server.on('close', () => {
  stopDetector();
  raidEvents.off('raid', handleRaid);
  initiation.stop();
  trialEngine.stop();
  ritual.stop();
  disconnectTwitch();
});

server.listen(port, async () => {
  console.log(`[server] Listening on http://localhost:${port}`);
  try {
    await connectTwitch();
  } catch (error) {
    twitchState.error = error.message;
    console.error(`[twitch] Startup failed: ${error.message}`);
  }
});

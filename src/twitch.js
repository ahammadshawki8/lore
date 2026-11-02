import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const HELIX = 'https://api.twitch.tv/helix';
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const REQUIRED_SCOPES = 'user:read:chat user:write:chat user:bot clips:edit';
const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

export const chatEvents = new EventEmitter();
export const twitchState = {
  connected: false,
  login: null,
  userId: null,
  sessionId: null,
  error: null,
};

let accessToken;
let clientId;
let socket;
let reconnecting = false;
let reconnectTimer = null;
let reconnectDelay = 500;
let stopped = false;
const usersCache = new Map();

function tokenExpiredMessage() {
  console.error(`\n[!] TWITCH TOKEN EXPIRED OR INVALID. Regenerate it at twitchtokengenerator.com with scopes: ${REQUIRED_SCOPES}\n`);
}

async function helix(path, options = {}) {
  if (!accessToken || !clientId || !twitchState.userId) {
    throw new Error('Twitch is not configured. Set ACCESS_TOKEN and CLIENT_ID, then restart LORE.');
  }
  const response = await fetch(`${HELIX}${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401) {
    tokenExpiredMessage();
    const error = new Error('Twitch access token expired or invalid');
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twitch API ${response.status} for ${path}: ${detail}`);
  }
  if (path === '/eventsub/subscriptions' && options.method === 'POST') {
    console.log(`[twitch] EventSub subscription response: ${response.status}`);
  }
  return response.json();
}

async function subscribeToChat(sessionId) {
  await helix('/eventsub/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.userId,
        user_id: twitchState.userId,
      },
      transport: { method: 'websocket', session_id: sessionId },
    }),
  });
}

function handleNotification(payload) {
  const message = payload.event;
  if (payload.subscription?.type !== 'channel.chat.message' || !message) return;
  let cursor = 0;
  const emotes = [];
  for (const fragment of message.message?.fragments ?? []) {
    const begin = cursor;
    cursor += fragment.text?.length ?? 0;
    if (fragment.type === 'emote') {
      emotes.push({ id: fragment.emote?.id, name: fragment.text, begin, end: cursor - 1 });
    }
  }
  const normalized = {
    id: message.message_id,
    user_id: message.chatter_user_id,
    login: message.chatter_user_login,
    display_name: message.chatter_user_name,
    text: message.message?.text ?? '',
    emotes,
    badges: (message.badges ?? []).map((badge) => ({ set_id: badge.set_id, id: badge.id, info: badge.info })),
    color: message.color || null,
    ts: message.message_timestamp,
    is_first_message: Boolean(message.is_first_message),
  };
  chatEvents.emit('message', normalized);
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  const delay = reconnectDelay + Math.random() * Math.min(500, reconnectDelay * .2);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket(EVENTSUB_URL, false);
  }, delay);
  reconnectDelay = Math.min(30_000, reconnectDelay * 1.8);
}

function connectSocket(url, isReconnect = false) {
  if (stopped) return;
  let nextSocket;
  try {
    nextSocket = new WebSocket(url);
  } catch (error) {
    twitchState.connected = false;
    twitchState.error = error.message;
    scheduleReconnect();
    return;
  }
  socket = nextSocket;

  nextSocket.on('message', async (raw) => {
    if (socket !== nextSocket) return;
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      console.error('[twitch] Ignoring malformed EventSub message.');
      return;
    }

    const metadata = payload.metadata ?? {};
    const body = payload.payload ?? {};
    switch (metadata.message_type) {
      case 'session_welcome': {
        twitchState.connected = true;
        twitchState.error = null;
        twitchState.sessionId = body.session?.id ?? null;
        reconnecting = false;
        reconnectDelay = 500;
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        console.log(`[twitch] EventSub connected${isReconnect ? ' (reconnected)' : ''}.`);
        if (!isReconnect && twitchState.sessionId) {
          try {
            await subscribeToChat(twitchState.sessionId);
          } catch (error) {
            twitchState.error = error.message;
            console.error(`[twitch] Could not subscribe to chat: ${error.message}`);
            if (socket === nextSocket) nextSocket.close();
          }
        }
        break;
      }
      case 'session_keepalive':
        break;
      case 'session_reconnect': {
        if (reconnecting || !body.session?.reconnect_url) break;
        reconnecting = true;
        console.log('[twitch] EventSub requested a session reconnect.');
        connectSocket(body.session.reconnect_url, true);
        break;
      }
      case 'revocation':
        twitchState.connected = false;
        twitchState.error = `EventSub subscription revoked: ${payload.subscription?.status ?? 'unknown'}`;
        console.error(`[twitch] ${twitchState.error}`);
        nextSocket.close();
        break;
      case 'notification':
        handleNotification(body);
        break;
      default:
        break;
    }
  });

  nextSocket.on('close', () => {
    if (socket !== nextSocket) return;
    socket = null;
    twitchState.connected = false;
    twitchState.sessionId = null;
    reconnecting = false;
    scheduleReconnect();
  });
  nextSocket.on('error', (error) => {
    if (socket !== nextSocket) return;
    twitchState.error = error.message;
    console.error(`[twitch] EventSub WebSocket error: ${error.message}`);
    nextSocket.close();
  });
}

export async function connectTwitch() {
  stopped = false;
  accessToken = process.env.ACCESS_TOKEN;
  clientId = process.env.CLIENT_ID;
  if (!accessToken || !clientId) {
    throw new Error('ACCESS_TOKEN and CLIENT_ID must be set in .env');
  }

  let response;
  try {
    response = await fetch(VALIDATE_URL, { headers: { Authorization: `OAuth ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(`Could not validate Twitch token: ${error.message}`);
  }
  if (!response.ok) {
    tokenExpiredMessage();
    throw new Error('Twitch token validation failed; regenerate the token with the required scopes.');
  }
  const identity = await response.json();
  twitchState.userId = identity.user_id;
  twitchState.login = identity.login;
  console.log(`[twitch] Validated account @${identity.login}.`);
  connectSocket(EVENTSUB_URL);
}

export function disconnectTwitch() {
  stopped = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnecting = false;
  const current = socket;
  socket = null;
  twitchState.connected = false;
  twitchState.sessionId = null;
  if (current && current.readyState !== WebSocket.CLOSED) current.close();
}

export async function sendChat(text) {
  const result = await helix('/chat/messages', {
    method: 'POST',
    body: JSON.stringify({
      broadcaster_id: twitchState.userId,
      sender_id: twitchState.userId,
      message: String(text),
    }),
  });
  return result.data?.[0] ?? null;
}

export async function createClip() {
  try {
    const result = await helix(`/clips?broadcaster_id=${encodeURIComponent(twitchState.userId)}`, { method: 'POST' });
    const clipId = result.data?.[0]?.id;
    if (!clipId) return null;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      const clips = await helix(`/clips?id=${encodeURIComponent(clipId)}`);
      const clip = clips.data?.[0];
      if (clip) return { id: clip.id, url: clip.url, thumbnail_url: clip.thumbnail_url };
    }
    return null;
  } catch (error) {
    if (error.status !== 401) console.warn(`[twitch] Clip creation unavailable (the channel may be offline): ${error.message}`);
    return null;
  }
}

export async function getUsers(logins = []) {
  const wanted = [...new Set(logins.map((login) => login.toLowerCase()).filter(Boolean))];
  const missing = wanted.filter((login) => !usersCache.has(login));
  for (let offset = 0; offset < missing.length; offset += 100) {
    const params = new URLSearchParams();
    for (const login of missing.slice(offset, offset + 100)) params.append('login', login);
    const result = await helix(`/users?${params}`);
    for (const user of result.data ?? []) usersCache.set(user.login.toLowerCase(), user.profile_image_url);
  }
  return Object.fromEntries(wanted.map((login) => [login, usersCache.get(login) ?? null]));
}

export async function getStream() {
  const [streamResult, channelResult] = await Promise.all([
    helix(`/streams?user_id=${encodeURIComponent(twitchState.userId)}`),
    helix(`/channels?broadcaster_id=${encodeURIComponent(twitchState.userId)}`),
  ]);
  const stream = streamResult.data?.[0];
  const channel = channelResult.data?.[0];
  return {
    title: stream?.title ?? channel?.title ?? '',
    game_name: stream?.game_name ?? channel?.game_name ?? '',
    is_live: Boolean(stream),
  };
}

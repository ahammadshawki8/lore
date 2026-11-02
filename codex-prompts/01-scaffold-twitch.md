We're building "Lore Codex" for the Codex x TwitchCon hackathon: chat summons memorable
stream moments into a community "canon" via an on-stream ritual (summon -> AI drafts 3
titles -> chat votes -> cinematic canonization with auto clip), plus newcomer initiation,
a lore quiz, and a public archive page. This first step is ONLY the foundation: Twitch
connection + server. Work in the current directory (Windows, Node 24 installed).

Set up Node (ESM, plain JS, no build step) with express, ws, dotenv, openai. Implement
src/twitch.js: connect to EventSub WebSocket (wss://eventsub.wss.twitch.tv/ws), handle
session_welcome / session_keepalive / session_reconnect / revocation, and subscribe to
channel.chat.message (version 1) via POST https://api.twitch.tv/helix/eventsub/subscriptions
with transport { method: "websocket", session_id }.

Auth / config:
- .env already exists (do not overwrite or print it) and uses ACCESS_TOKEN, REFRESH_TOKEN,
  CLIENT_ID (no client secret). Optional: OPENAI_API_KEY, PORT (default 3000).
- On startup call GET https://id.twitch.tv/oauth2/validate with "Authorization: OAuth
  <ACCESS_TOKEN>" to get user_id and login. Use that user as BOTH broadcaster_user_id and
  user_id (the bot and the streamer are the same account).
- All Helix calls send "Authorization: Bearer <ACCESS_TOKEN>" and "Client-Id: <CLIENT_ID>".
- If validate fails or any call returns 401, log a clear, loud message explaining the token
  expired and must be regenerated (scopes: user:read:chat user:write:chat user:bot clips:edit).

Helpers to export from src/twitch.js:
- sendChat(text) -> POST /helix/chat/messages (broadcaster_id, sender_id = our user).
- createClip() -> POST /helix/clips?broadcaster_id=..., then poll GET /helix/clips?id=...
  every 1s for up to 15s until it exists; return { id, url, thumbnail_url } or null
  (it fails when the channel is offline, so handle that gracefully).
- getUsers(logins[]) -> GET /helix/users, return profile_image_url per login, cached in memory.
- getStream() -> { title, game_name, is_live }.

Emit normalized chat events on an EventEmitter:
{ id, user_id, login, display_name, text, emotes[], badges[], color, ts }.

src/server.js: Express serving /public statically; a ws server at /ws that broadcasts JSON
events { type, data } to all browser clients (export a broadcast(type, data) function);
GET /api/health returns connection state + login. Log each incoming chat message to the
console as "[chat] login: text". Add a minimal public/index.html that links to the future
pages (overlay.html, codex.html, control.html).

Also create: package.json with "start" script (node src/server.js), .env.example (keys only,
no values), keep the existing .gitignore (.env, node_modules, data/), and a README.md with
setup steps: generate a token at twitchtokengenerator.com (Custom Scope Token) with scopes
user:read:chat user:write:chat user:bot clips:edit, fill .env, npm install, npm start.

Keep files small and well organized. Never print the access token in logs. Run npm install
yourself, then start the server briefly to verify it validates the token and the EventSub
subscription succeeds (look for the subscription 202 response), then stop it. Summarize
what you built and the verification result.

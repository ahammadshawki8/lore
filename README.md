# Lore Codex

Lore Codex turns memorable Twitch chat moments into community canon. This first scaffold provides the Twitch EventSub connection and a small web server.

## Setup

1. Generate a token at [twitchtokengenerator.com](https://twitchtokengenerator.com/) using **Custom Scope Token** and these scopes: `user:read:chat user:write:chat user:bot clips:edit`.
2. Copy `.env.example` to `.env` and fill in `ACCESS_TOKEN`, `REFRESH_TOKEN`, and `CLIENT_ID`. `OPENAI_API_KEY` and `PORT` are optional; the default port is `3000`.
3. Install dependencies with `npm install`.
4. Start the app with `npm start`.

The server listens at `http://localhost:3000` by default. Its WebSocket endpoint is `/ws`, and `GET /api/health` reports Twitch connection status and the authenticated login.

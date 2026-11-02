import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { chatEvents, connectTwitch, twitchState } from './twitch.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const port = Number(process.env.PORT) || 3000;

app.use(express.static('public'));
app.get('/api/health', (_request, response) => {
  response.json({ connected: twitchState.connected, login: twitchState.login });
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

server.listen(port, async () => {
  console.log(`[server] Listening on http://localhost:${port}`);
  try {
    await connectTwitch();
  } catch (error) {
    twitchState.error = error.message;
    console.error(`[twitch] Startup failed: ${error.message}`);
  }
});

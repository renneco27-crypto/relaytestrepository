// ──────────────────────────────────────────────────────────────────────
// INTERVIEW COPILOT — WebSocket Relay Server
// Deploy on Render (free tier). Phone sends transcript → Electron receives it.
//
// Roles:
//   "phone"    — the mobile browser, sends transcript chunks
//   "electron" — the overlay app, receives transcript chunks
//
// Message format (JSON):
//   Phone    → server: { type: "transcript", text: "...", isFinal: true }
//   Server   → electron: same payload, plus { from: "phone" }
//   Either   → server: { type: "ping" }  (keepalive, Render sleeps after 50s)
// ──────────────────────────────────────────────────────────────────────

const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const SECRET = process.env.RELAY_SECRET || 'interview-copilot-secret';

// HTTP server required by Render free tier — handles health checks
// AND lets us manually handle the WebSocket upgrade (no separate port needed)
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Interview Copilot Relay — OK');
});

// Attach WebSocket server to the HTTP server instead of its own port
const wss = new WebSocketServer({ server: httpServer });

// Track connected clients by role
const clients = {
  phone: new Set(),
  electron: new Set(),
};

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function broadcast(targetRole, payload) {
  const dead = [];
  for (const ws of clients[targetRole]) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      dead.push(ws);
    }
  }
  dead.forEach(ws => clients[targetRole].delete(ws));
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const role = url.searchParams.get('role');     // "phone" or "electron"
  const secret = url.searchParams.get('secret');

  // Auth check
  if (secret !== SECRET) {
    ws.close(4001, 'Unauthorized');
    log(`Rejected connection — bad secret (role=${role})`);
    return;
  }

  // Role check
  if (role !== 'phone' && role !== 'electron') {
    ws.close(4002, 'Unknown role');
    log(`Rejected connection — unknown role: ${role}`);
    return;
  }

  clients[role].add(ws);
  log(`Connected: ${role} (phones=${clients.phone.size}, electrons=${clients.electron.size})`);

  // Notify electron that phone connected (useful for UI status indicator)
  if (role === 'phone') {
    broadcast('electron', { type: 'status', phone_connected: true });
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore malformed
    }

    // Keepalive ping — just pong back
    if (msg.type === 'ping') {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    // Phone sends transcript → forward to all electron clients
    if (role === 'phone' && msg.type === 'transcript') {
      const payload = {
        type: 'transcript',
        text: msg.text ?? '',
        isFinal: msg.isFinal ?? false,
        from: 'phone',
        ts: Date.now(),
      };
      broadcast('electron', payload);
      log(`Transcript (final=${payload.isFinal}): "${payload.text.slice(0, 60)}"`);
    }
  });

  ws.on('close', () => {
    clients[role].delete(ws);
    log(`Disconnected: ${role} (phones=${clients.phone.size}, electrons=${clients.electron.size})`);
    if (role === 'phone') {
      broadcast('electron', { type: 'status', phone_connected: false });
    }
  });

  ws.on('error', (err) => {
    log(`Error (${role}):`, err.message);
    clients[role].delete(ws);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  log(`Relay server running on port ${PORT}`);
  log(`Connect with: ws://localhost:${PORT}?role=phone&secret=${SECRET}`);
});

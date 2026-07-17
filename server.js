const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const fs   = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const PORT      = process.env.PORT         || 8080;
const SECRET    = process.env.RELAY_SECRET || 'interview-copilot-secret';
const RELAY_URL = process.env.RELAY_URL    || '';

// ──────────────────────────────────────────────────────────────────────
// HTTP SERVER — serves phone.html at / and /phone.html
// ──────────────────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; // strip query string for routing

  if (url === '/' || url === '/phone.html') {
    const file = path.join(__dirname, 'phone.html');
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('phone.html not found — make sure it is deployed alongside server.js');
        return;
      }
      // Inject relay URL and secret so the page can connect without hardcoding.
      const injected = data
        .replace(/\{\{RELAY_URL\}\}/g,    RELAY_URL)
        .replace(/\{\{RELAY_SECRET\}\}/g, SECRET);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);
    });
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      phones:    clients.phone.size,
      electrons: clients.electron.size,
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ──────────────────────────────────────────────────────────────────────
// WEBSOCKET RELAY
// ──────────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer });

const clients = {
  phone:    new Set(),
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
  const params = new URL(req.url, 'http://localhost').searchParams;
  const role   = params.get('role');
  const secret = params.get('secret');

  if (secret !== SECRET) {
    ws.close(4001, 'Unauthorized');
    log(`Rejected connection — bad secret (role=${role})`);
    return;
  }

  if (role !== 'phone' && role !== 'electron') {
    ws.close(4002, 'Unknown role');
    log(`Rejected connection — unknown role: ${role}`);
    return;
  }

  clients[role].add(ws);
  log(`Connected: ${role} (phones=${clients.phone.size}, electrons=${clients.electron.size})`);

  if (role === 'phone') {
    broadcast('electron', { type: 'status', phone_connected: true });
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (role === 'phone' && msg.type === 'transcript') {
      const payload = {
        type:    'transcript',
        text:    msg.text    ?? '',
        isFinal: msg.isFinal ?? false,
        // 'you' = candidate mic, 'interviewer' = tab audio capture
        speaker: msg.speaker ?? 'you',
        phase:   msg.phase   ?? 'interim',
        from:    'phone',
        ts:      Date.now(),
      };
      broadcast('electron', payload);
      log(`Transcript [${payload.speaker}] (final=${payload.isFinal}): "${payload.text.slice(0, 60)}"`);
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

// ──────────────────────────────────────────────────────────────────────
// START
// ──────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  log(`Relay server running on port ${PORT}`);
  log(`Phone page: http://localhost:${PORT}/`);
  log(`WebSocket:  ws://localhost:${PORT}?role=phone&secret=${SECRET}`);
});
 

const http = require('http');
const fs   = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
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

const PORT        = process.env.PORT         || 8080;
const RELAY_URL   = process.env.RELAY_URL    || '';
const RELAY_SECRET = process.env.RELAY_SECRET || '';
const DEEPGRAM_KEY = process.env.DEEPGRAM_KEY || '';

const httpServer = http.createServer((req, res) => {
  const file = path.join(__dirname, 'phone.html');
  fs.readFile(file, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('phone.html not found');
      return;
    }
    const injected = data
      .replace(/\{\{RELAY_URL\}\}/g,     RELAY_URL)
      .replace(/\{\{RELAY_SECRET\}\}/g,  RELAY_SECRET)
      .replace(/\{\{DEEPGRAM_KEY\}\}/g,  DEEPGRAM_KEY);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(injected);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Test phone server: http://localhost:${PORT}/`);
});

# Interview Copilot — Relay Server

WebSocket relay: phone mic → Render server → Electron overlay.

## Deploy to Render (free, 3 minutes)

1. Push this folder to a GitHub repo
2. Go to https://render.com → New → Web Service → connect your repo
3. It auto-detects `render.yaml` — just click Deploy
4. After deploy, go to Environment tab → copy the `RELAY_SECRET` value
5. Your server URL will be: `wss://your-app-name.onrender.com`

## Environment Variables

| Key | Description |
|-----|-------------|
| `RELAY_SECRET` | Shared secret between phone and Electron. Keep private. |
| `PORT` | Set automatically by Render. Don't touch. |

## WebSocket URL format

```
wss://your-app.onrender.com?role=phone&secret=YOUR_SECRET
wss://your-app.onrender.com?role=electron&secret=YOUR_SECRET
```

## Message Protocol

**Phone → Server:**
```json
{ "type": "transcript", "text": "Tell me about yourself", "isFinal": true }
{ "type": "ping" }
```

**Server → Electron:**
```json
{ "type": "transcript", "text": "Tell me about yourself", "isFinal": true, "from": "phone", "ts": 1234567890 }
{ "type": "status", "phone_connected": true }
{ "type": "pong" }
```

## Note on Render free tier

Render spins down free services after 50s of inactivity. The phone app sends
a `ping` every 20s to keep it alive during interviews.

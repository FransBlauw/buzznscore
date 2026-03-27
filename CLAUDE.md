# BuzzNScore

Gameshow buzzer and score management app. Three views per session: Host, Scoreboard, Player.

## Stack

- **Server:** Node.js, Express, Socket.io, TypeScript (`server/src/server.ts`)
- **Client:** React, Vite, Socket.io-client, TypeScript (`client/src`)
- **Persistence:** `data/sessions.json` (auto-created, written with 500ms debounce)

## Running

```bash
# Dev (two terminals)
npm run dev:server              # server on :3001
npm run dev:client # Vite on :5173, proxies /socket.io → :3001

# Production
npm run build   # builds client → client/dist, compiles server → server/dist
npm start       # serves everything from Express on :3001
```

## Environment

**Server** (`.env` at repo root):
```
HOST=0.0.0.0
PORT=3001
```

**Client** (`client/.env`):
```
VITE_SERVER_URL=http://<LAN_IP>:3001   # omit for localhost-only use
```

## Architecture

### URL routing
No React Router. `?view=host|player|scoreboard` query param. `App.tsx` switches on it.

### Socket.io rooms
- `<CODE>` — main session room (host, players, scoreboard)
- `<CODE>:peek` — pre-join room; players subscribe here while on the pick-team screen to receive live team list updates (`session:peek-update`)

### Socket events (client → server)
| Event | Description |
|---|---|
| `session:create` | Host creates a new session |
| `host:rejoin` | Host reconnects with saved code+token |
| `session:peek` | Player peeks at teams before joining |
| `scoreboard:watch` | Scoreboard subscribes to a session |
| `player:join` | Player joins a team (creates if new, enforces cap) |
| `team:create` | Host creates an empty team |
| `team:delete` | Host deletes a team (emits `team:deleted` to members) |
| `team:allow-creation` | Host toggles player team creation |
| `team:set-max-size` | Host sets/clears max devices per team |
| `session:qr-mode` | Host sets QR display mode (`off`/`small`/`big`) |
| `buzzer:enable` | Host opens/closes buzzing |
| `buzzer:reset` | Host clears buzz order for the round |
| `player:buzz` | Player buzzes in |
| `score:adjust` | Host adjusts a team's score by delta |

### Host session persistence
`hostToken` (UUID) is stored in the URL: `?view=host&code=X&token=Y`. On refresh, `host:rejoin` validates the token and reassigns the host socket. No localStorage.

### Player join flow
`enter-code` → `pick-team` → `in-game` (React state machine in `PlayerView.tsx`)

## Key files

```
server/src/server.ts             # all server logic
client/src/
  App.tsx                        # view routing
  socket.ts                      # socket singleton (uses VITE_SERVER_URL or origin)
  types.ts                       # shared TS interfaces (TeamState, SessionState, BuzzEntry)
  views/
    HostView.tsx
    PlayerView.tsx
    ScoreboardView.tsx
  index.css                      # dark gameshow theme
```

## Gotchas

- `navigator.clipboard` is undefined over plain HTTP (LAN). `HostView` uses `execCommand('copy')` fallback.
- `existsSync` guards static file serving so the dev server doesn't crash without a built client.
- Windows `sed -i` with `\n` writes literal `\n`, not newlines — use the Write tool for multi-line edits.
- Socket IDs change on reconnect; `socketMeta` maps current socket ID → session/team. Transient — not persisted.

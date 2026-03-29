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
Two entry points:
- `/` — standalone static HTML landing page (`client/index.html`). No React. Buttons navigate to `/host`, `/play`, `/score`.
- `/host`, `/play`, `/score` — React app (`client/app/index.html`). No React Router; `App.tsx` switches on pathname prefix. Unknown path redirects to `/`.

URL structure:
| Path | Description |
|---|---|
| `/host` | Host lobby (no session yet) |
| `/host/<CODE>?token=<TOKEN>` | Host live session; token used for rejoin on refresh |
| `/play` | Player enter-code screen |
| `/play/<CODE>` | Player pick-team screen |
| `/play/<CODE>?team=<TEAMID>` | Player in-game; team param used for rejoin on refresh |
| `/score` | Scoreboard enter-code screen |
| `/score/<CODE>` | Scoreboard watching a session |

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
| `player:join` | Player joins/creates a team; 3rd arg is `isRejoin` boolean (true on socket reconnect) |
| `player:rejoin` | Player reconnects by saved `teamId` (`?team=` URL param); skips team-name step |
| `team:create` | Host creates an empty team |
| `team:delete` | Host deletes a team |
| `team:rename` | Host renames a team; also updates any buzz order entries with the new name |
| `team:allow-creation` | Host toggles player team creation |
| `team:set-max-size` | Host sets/clears max devices per team |
| `session:joining` | Host enables/disables player joining entirely |
| `session:qr-mode` | Host sets QR display mode (`off`/`small`/`big`) |
| `session:state_request` | Any client requests a full state refresh |
| `buzzer:enable` | Host opens/closes buzzing |
| `buzzer:reset` | Host clears buzz order and closes buzzing |
| `buzzer:unbuzz` | Host removes a single team from the buzz order |
| `player:buzz` | Player buzzes in |
| `score:adjust` | Host adjusts a team's score by delta |

### Socket events (server → client)
| Event | Description |
|---|---|
| `session:state` | Full `SessionState` snapshot; broadcast to the session room on any change |
| `session:peek-update` | Partial peek payload (teams, joiningEnabled, allowTeamCreation, maxTeamSize) sent to `<CODE>:peek` room |
| `team:deleted` | Sent directly to members of a deleted team |
| `buzzer:accepted` | Sent to the player whose buzz was accepted |
| `buzzer:rejected` | Sent to a player who buzzed when buzzing was closed or their team already buzzed |

### Host session persistence
`hostToken` (UUID) is stored in the URL: `/host/<CODE>?token=<TOKEN>`. On refresh, `host:rejoin` validates the token and reassigns the host socket. No localStorage.

### Player join flow
`enter-code` → `pick-team` → `in-game` (React state machine in `PlayerView.tsx`)

URL advances with each step: `/play` → `/play/<CODE>` → `/play/<CODE>?team=<TEAMID>`. On refresh at any step, the URL is read to restore state. `player:rejoin` (by teamId) skips team-selection; if the team no longer exists, falls back to `pick-team`.

### SessionState fields
`code`, `buzzingEnabled`, `joiningEnabled`, `allowTeamCreation`, `maxTeamSize`, `qrCodeMode`, `teams` (array of `TeamState`), `buzzOrder` (array of `BuzzEntry`), `scoreboardCount`, `waitingCount` (players currently in the `:peek` room).

## Key files

```
server/src/server.ts             # all server logic
client/index.html                # standalone landing page (pure HTML/CSS/JS, no React)
client/app/index.html            # React app entry point (served at /host, /play, /score)
client/src/
  App.tsx                        # view routing (pathname-based: /host|/play|/score; redirects to / if no match)
  socket.ts                      # socket singleton (uses VITE_SERVER_URL or origin)
  types.ts                       # shared TS interfaces (TeamState, SessionState, BuzzEntry)
  views/
    HostView.tsx                 # includes inline TeamRow component; edit mode (toggle in card header) reveals per-row Rename and Delete actions
    PlayerView.tsx
    ScoreboardView.tsx           # uses qrcode.react (QRCodeSVG) for QR codes
  index.css                      # dark gameshow theme
```

## Gotchas

- `navigator.clipboard` is undefined over plain HTTP (LAN). `HostView` uses `execCommand('copy')` fallback.
- `existsSync` guards static file serving so the dev server doesn't crash without a built client.
- Windows `sed -i` with `\n` writes literal `\n`, not newlines — use the Write tool for multi-line edits.
- Socket IDs change on reconnect; `socketMeta` maps current socket ID → session/team. Transient — not persisted.
- `buzzer:reset` also sets `buzzingEnabled = false` (not just clears the order).
- `joiningEnabled` is separate from `allowTeamCreation`: the former blocks all joins, the latter only blocks creating new teams.
- **Edit mode** (Teams & Scores card): toggled by an Edit/Done button in the card header. While active, each `TeamRow` shows a bottom action bar with **Rename** (inline input, Enter/Escape, error display) and **Delete** (two-step confirm). Exiting edit mode cancels any open rename or confirmation. Delete buttons and rename UI are hidden during normal gameplay.
- `team:rename` validates uniqueness (case-insensitive, allows same-cased rename), updates `teamsByName` index, and patches `teamName` in any in-flight `buzzOrder` entries.

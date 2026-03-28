import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  score: number;
  members: Set<string>; // socket IDs
}

interface BuzzEntry {
  teamId: string;
  teamName: string;
}

interface Session {
  code: string;
  hostSocketId: string;
  hostToken: string;
  teams: Map<string, Team>;
  teamsByName: Map<string, string>; // lowercase name → teamId
  buzzingEnabled: boolean;
  joiningEnabled: boolean;
  allowTeamCreation: boolean;
  maxTeamSize: number | null; // null = unlimited
  qrCodeMode: 'off' | 'small' | 'big';
  buzzOrder: BuzzEntry[];
  buzzedTeams: Set<string>;
}

// Serialisable snapshot sent to clients
interface TeamState {
  id: string;
  name: string;
  score: number;
  memberCount: number;
}

interface SessionState {
  code: string;
  buzzingEnabled: boolean;
  joiningEnabled: boolean;
  allowTeamCreation: boolean;
  maxTeamSize: number | null;
  qrCodeMode: 'off' | 'small' | 'big';
  teams: TeamState[];
  buzzOrder: BuzzEntry[];
  scoreboardCount: number;
  waitingCount: number;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();
const socketMeta = new Map<
  string,
  { sessionCode: string; role: 'host' | 'scoreboard' | 'player' | 'peek'; teamId?: string }
>();

// ─── Persistence ──────────────────────────────────────────────────────────────

const DATA_FILE = path.resolve('data/sessions.json');

interface PersistedTeam { id: string; name: string; score: number; }
interface PersistedSession {
  code: string;
  hostToken: string;
  teams: PersistedTeam[];
  buzzingEnabled: boolean;
  joiningEnabled: boolean;
  allowTeamCreation: boolean;
  maxTeamSize: number | null;
  qrCodeMode: 'off' | 'small' | 'big';
  buzzOrder: BuzzEntry[];
}

async function loadSessions(): Promise<void> {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw) as Record<string, PersistedSession>;
    for (const p of Object.values(data)) {
      const session: Session = {
        code: p.code,
        hostSocketId: '',
        hostToken: p.hostToken,
        teams: new Map(),
        teamsByName: new Map(),
        buzzingEnabled: p.buzzingEnabled,
        joiningEnabled: p.joiningEnabled ?? true,
        allowTeamCreation: p.allowTeamCreation,
        maxTeamSize: p.maxTeamSize ?? null,
        qrCodeMode: p.qrCodeMode ?? 'small',
        buzzOrder: p.buzzOrder,
        buzzedTeams: new Set(p.buzzOrder.map((e) => e.teamId)),
      };
      for (const t of p.teams) {
        session.teams.set(t.id, { ...t, members: new Set() });
        session.teamsByName.set(t.name.toLowerCase(), t.id);
      }
      sessions.set(p.code, session);
    }
    console.log(`Loaded ${Object.keys(data).length} session(s) from ${DATA_FILE}`);
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await mkdir(path.dirname(DATA_FILE), { recursive: true });
      const data: Record<string, PersistedSession> = {};
      for (const [code, s] of sessions) {
        data[code] = {
          code: s.code,
          hostToken: s.hostToken,
          teams: Array.from(s.teams.values()).map((t) => ({ id: t.id, name: t.name, score: t.score })),
          buzzingEnabled: s.buzzingEnabled,
          joiningEnabled: s.joiningEnabled,
          allowTeamCreation: s.allowTeamCreation,
          maxTeamSize: s.maxTeamSize,
          qrCodeMode: s.qrCodeMode,
          buzzOrder: [...s.buzzOrder],
        };
      }
      await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save sessions:', err);
    }
  }, 500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (sessions.has(code));
  return code;
}

function toState(session: Session, io?: Server): SessionState {
  const scoreboardCount = Array.from(socketMeta.values()).filter(
    (m) => m.sessionCode === session.code && m.role === 'scoreboard'
  ).length;
  const waitingCount = io
    ? (io.sockets.adapter.rooms.get(`${session.code}:peek`)?.size ?? 0)
    : 0;
  return {
    code: session.code,
    buzzingEnabled: session.buzzingEnabled,
    joiningEnabled: session.joiningEnabled,
    allowTeamCreation: session.allowTeamCreation,
    maxTeamSize: session.maxTeamSize,
    qrCodeMode: session.qrCodeMode,
    teams: Array.from(session.teams.values()).map((t) => ({
      id: t.id,
      name: t.name,
      score: t.score,
      memberCount: t.members.size,
    })),
    buzzOrder: [...session.buzzOrder],
    scoreboardCount,
    waitingCount,
  };
}

function peekPayload(session: Session) {
  return {
    teams: Array.from(session.teams.values()).map((t) => ({
      id: t.id, name: t.name, score: t.score, memberCount: t.members.size,
    })),
    joiningEnabled: session.joiningEnabled,
    allowTeamCreation: session.allowTeamCreation,
    maxTeamSize: session.maxTeamSize,
  };
}

function broadcast(io: Server, session: Session) {
  io.to(session.code).emit('session:state', toState(session, io));
  io.to(`${session.code}:peek`).emit('session:peek-update', peekPayload(session));
  scheduleSave();
}

// ─── Express + Socket.io setup ────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Serve built client (production only — in dev the Vite server handles the client)
const clientDist = path.join(__dirname, '../../client/dist');
if (existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  console.log('No client/dist found — run "npm run build:client" for production serving.');
  app.get('*', (_req, res) => {
    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#0a0a18;color:#fff">
        <h2 style="color:#ffd700">BuzzNScore — Dev mode</h2>
        <p>The API server is running on port <strong>3001</strong>.</p>
        <p>Open the client at <a href="http://localhost:5173" style="color:#ffd700">http://localhost:5173</a>
        (run <code>cd client &amp;&amp; npm run dev</code> if you haven't already).</p>
      </body></html>
    `);
  });
}

// ─── Socket events ────────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  // ── Host: create session ──────────────────────────────────────────────────
  socket.on('session:create', (callback: (result: { state: SessionState; hostToken: string }) => void) => {
    const code = generateCode();
    const hostToken = randomUUID();
    const session: Session = {
      code,
      hostSocketId: socket.id,
      hostToken,
      teams: new Map(),
      teamsByName: new Map(),
      buzzingEnabled: false,
      joiningEnabled: true,
      allowTeamCreation: true,
      maxTeamSize: null,
      qrCodeMode: 'small',
      buzzOrder: [],
      buzzedTeams: new Set(),
    };
    sessions.set(code, session);
    socketMeta.set(socket.id, { sessionCode: code, role: 'host' });
    socket.join(code);
    callback({ state: toState(session, io), hostToken });
    scheduleSave();
    console.log(`Session created: ${code}`);
  });

  // ── Host: rejoin after page refresh ──────────────────────────────────────
  socket.on(
    'host:rejoin',
    (code: string, hostToken: string, callback: (state: SessionState | null) => void) => {
      const session = sessions.get(code.toUpperCase().trim());
      if (!session || session.hostToken !== hostToken) { callback(null); return; }
      if (session.hostSocketId !== socket.id) socketMeta.delete(session.hostSocketId);
      session.hostSocketId = socket.id;
      socketMeta.set(socket.id, { sessionCode: session.code, role: 'host' });
      socket.join(session.code);
      callback(toState(session, io));
      console.log(`Host rejoined session: ${code}`);
    }
  );

  // ── Player: peek at session teams (before joining) ────────────────────────
  socket.on(
    'session:peek',
    (code: string, callback: (result: { teams: TeamState[]; allowTeamCreation: boolean; maxTeamSize: number | null } | null) => void) => {
      const session = sessions.get(code.toUpperCase().trim());
      if (!session) { callback(null); return; }
      socketMeta.set(socket.id, { sessionCode: session.code, role: 'peek' });
      socket.join(`${session.code}:peek`);
      callback(peekPayload(session));
      broadcast(io, session);
    }
  );

  // ── Scoreboard: watch session ─────────────────────────────────────────────
  socket.on(
    'scoreboard:watch',
    (code: string, callback: (state: SessionState | null) => void) => {
      const session = sessions.get(code.toUpperCase().trim());
      if (!session) { callback(null); return; }
      socketMeta.set(socket.id, { sessionCode: session.code, role: 'scoreboard' });
      socket.join(session.code);
      callback(toState(session, io));
      broadcast(io, session);
    }
  );

  // ── Player: join session ──────────────────────────────────────────────────
  socket.on(
    'player:join',
    (
      code: string,
      teamName: string,
      isRejoinOrCallback: boolean | ((result: { success: boolean; teamId?: string; state?: SessionState; error?: string }) => void),
      maybeCallback?: (result: { success: boolean; teamId?: string; state?: SessionState; error?: string }) => void
    ) => {
      const isRejoin = typeof isRejoinOrCallback === 'boolean' ? isRejoinOrCallback : false;
      const callback = (typeof isRejoinOrCallback === 'function' ? isRejoinOrCallback : maybeCallback)!;
      const session = sessions.get(code.toUpperCase().trim());
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }

      const name = teamName.trim();
      if (!name) { callback({ success: false, error: 'Name is required' }); return; }

      if (!session.joiningEnabled && !isRejoin) {
        callback({ success: false, error: 'The host has disabled joining. Please wait.' });
        return;
      }

      const nameKey = name.toLowerCase();
      let teamId: string;

      if (session.teamsByName.has(nameKey)) {
        // Join existing team — enforce size cap
        teamId = session.teamsByName.get(nameKey)!;
        const team = session.teams.get(teamId)!;
        if (session.maxTeamSize !== null && team.members.size >= session.maxTeamSize) {
          callback({ success: false, error: `That team is full (max ${session.maxTeamSize} device${session.maxTeamSize !== 1 ? 's' : ''}).` });
          return;
        }
        team.members.add(socket.id);
      } else {
        // Create new team — check permission
        if (!session.allowTeamCreation) {
          callback({ success: false, error: 'The host has disabled creating new teams. Please choose an existing team.' });
          return;
        }
        teamId = randomUUID();
        session.teams.set(teamId, {
          id: teamId,
          name,
          score: 0,
          members: new Set([socket.id]),
        });
        session.teamsByName.set(nameKey, teamId);
      }

      socketMeta.set(socket.id, { sessionCode: session.code, role: 'player', teamId });
      socket.leave(`${session.code}:peek`);
      socket.join(session.code);
      callback({ success: true, teamId, state: toState(session, io) });
      broadcast(io, session);
    }
  );

  // ── Player: rejoin after page refresh (by teamId) ────────────────────────
  socket.on(
    'player:rejoin',
    (
      code: string,
      teamId: string,
      callback: (result: { success: boolean; teamId?: string; teamName?: string; state?: SessionState; error?: string }) => void
    ) => {
      const session = sessions.get(code.toUpperCase().trim());
      if (!session) { callback({ success: false, error: 'Session not found' }); return; }
      const team = session.teams.get(teamId);
      if (!team) { callback({ success: false, error: 'Team not found' }); return; }
      team.members.add(socket.id);
      socketMeta.set(socket.id, { sessionCode: session.code, role: 'player', teamId });
      socket.leave(`${session.code}:peek`);
      socket.join(session.code);
      callback({ success: true, teamId, teamName: team.name, state: toState(session, io) });
      broadcast(io, session);
    }
  );

  // ── Host: create an empty team ────────────────────────────────────────────
  socket.on(
    'team:create',
    (code: string, teamName: string, callback: (error?: string) => void) => {
      const session = sessions.get(code);
      if (!session || session.hostSocketId !== socket.id) return;
      const name = teamName.trim();
      if (!name) { callback('Name is required'); return; }
      if (session.teamsByName.has(name.toLowerCase())) { callback('A team with that name already exists'); return; }
      const teamId = randomUUID();
      session.teams.set(teamId, { id: teamId, name, score: 0, members: new Set() });
      session.teamsByName.set(name.toLowerCase(), teamId);
      callback();
      broadcast(io, session);
    }
  );

  // ── Host: delete a team ───────────────────────────────────────────────────
  socket.on('team:delete', (code: string, teamId: string) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    const team = session.teams.get(teamId);
    if (!team) return;
    for (const memberId of team.members) {
      io.to(memberId).emit('team:deleted');
      socketMeta.delete(memberId);
    }
    session.buzzOrder = session.buzzOrder.filter((e) => e.teamId !== teamId);
    session.buzzedTeams.delete(teamId);
    session.teamsByName.delete(team.name.toLowerCase());
    session.teams.delete(teamId);
    broadcast(io, session);
  });

  // ── Host: enable/disable player joining ──────────────────────────────────
  socket.on('session:joining', (code: string, enabled: boolean) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.joiningEnabled = enabled;
    broadcast(io, session);
  });

  // ── Host: toggle player team creation ────────────────────────────────────
  socket.on('team:allow-creation', (code: string, allowed: boolean) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.allowTeamCreation = allowed;
    broadcast(io, session);
  });

  // ── Host: set max team size ───────────────────────────────────────────────
  socket.on('team:set-max-size', (code: string, max: number | null) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.maxTeamSize = max;
    broadcast(io, session);
  });

  // ── Host: toggle QR code visibility on scoreboard ────────────────────────
  socket.on('session:qr-mode', (code: string, mode: 'off' | 'small' | 'big') => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.qrCodeMode = mode;
    broadcast(io, session);
  });

  // ── Host: enable/disable buzzing ──────────────────────────────────────────
  socket.on('buzzer:enable', (code: string, enabled: boolean) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.buzzingEnabled = enabled;
    broadcast(io, session);
  });

  // ── Player: buzz in ───────────────────────────────────────────────────────
  socket.on('player:buzz', (code: string) => {
    const session = sessions.get(code);
    if (!session || !session.buzzingEnabled) { socket.emit('buzzer:rejected'); return; }
    const meta = socketMeta.get(socket.id);
    if (!meta || meta.role !== 'player' || !meta.teamId) return;
    if (session.buzzedTeams.has(meta.teamId)) { socket.emit('buzzer:rejected'); return; }
    const team = session.teams.get(meta.teamId);
    if (!team) return;
    session.buzzedTeams.add(meta.teamId);
    session.buzzOrder.push({ teamId: meta.teamId, teamName: team.name });
    socket.emit('buzzer:accepted');
    broadcast(io, session);
  });

  // ── Host: unbuzz a team ───────────────────────────────────────────────────
  socket.on('buzzer:unbuzz', (code: string, teamId: string) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.buzzOrder = session.buzzOrder.filter((e) => e.teamId !== teamId);
    session.buzzedTeams.delete(teamId);
    broadcast(io, session);
  });

  // ── Host: reset buzzing ───────────────────────────────────────────────────
  socket.on('buzzer:reset', (code: string) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    session.buzzOrder = [];
    session.buzzedTeams.clear();
    session.buzzingEnabled = false;
    broadcast(io, session);
  });

  // ── Host: adjust score ────────────────────────────────────────────────────
  socket.on('score:adjust', (code: string, teamId: string, delta: number) => {
    const session = sessions.get(code);
    if (!session || session.hostSocketId !== socket.id) return;
    const team = session.teams.get(teamId);
    if (!team) return;
    team.score += delta;
    broadcast(io, session);
  });

  // ── Any client: request full state refresh ────────────────────────────────
  socket.on('session:state_request', (code: string) => {
    const session = sessions.get(code);
    if (session) socket.emit('session:state', toState(session, io));
  });

  // ── Disconnect cleanup ────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;
    socketMeta.delete(socket.id);
    const session = sessions.get(meta.sessionCode);
    if (!session) return;
    if (meta.role === 'player' && meta.teamId) {
      const team = session.teams.get(meta.teamId);
      if (team) {
        team.members.delete(socket.id);
        broadcast(io, session);
      }
    } else if (meta.role === 'scoreboard' || meta.role === 'peek') {
      broadcast(io, session);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

loadSessions().then(() => {
  httpServer.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`BuzzNScore running on http://${displayHost}:${PORT}`);
  });
});

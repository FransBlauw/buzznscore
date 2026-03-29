import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../socket';
import { SessionState, TeamState } from '../types';

// ── localStorage helpers ────────────────────────────────────────────────────

const STORAGE_KEY = 'buzznscore:host-sessions';
type SavedSession = { code: string; token: string; savedAt: number };

function loadSavedSessions(): SavedSession[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function persistSession(code: string, token: string) {
  const sessions = loadSavedSessions().filter(s => s.code !== code);
  sessions.unshift({ code, token, savedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 10)));
}

function dropSession(code: string) {
  const sessions = loadSavedSessions().filter(s => s.code !== code);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function HostView() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [copied, setCopied] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [teamError, setTeamError] = useState('');
  const [editTeams, setEditTeams] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(loadSavedSessions);

  const [connected, setConnected] = useState(socket.connected);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      if (!window.location.pathname.split('/')[2]) setSession(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    socket.on('session:state', setSession);

    const rejoin = (code: string, token: string, isFirstConnect: boolean) => {
      if (isFirstConnect) setRejoining(true);
      socket.emit('host:rejoin', code, token, (state: SessionState | null) => {
        setRejoining(false);
        if (state) {
          persistSession(code, token);
          setSavedSessions(loadSavedSessions());
          setSession(state);
        } else if (isFirstConnect) {
          // Session expired or token invalid — drop from storage and URL
          dropSession(code);
          setSavedSessions(loadSavedSessions());
          window.history.replaceState({}, '', '/host');
        }
      });
    };

    const onConnect = () => {
      const isFirst = !hasConnectedRef.current;
      hasConnectedRef.current = true;
      setConnected(true);
      const code = window.location.pathname.split('/')[2] ?? '';
      const token = new URLSearchParams(window.location.search).get('token') ?? '';
      if (code && token) rejoin(code, token, isFirst);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', () => setConnected(false));

    if (socket.connected) onConnect();

    return () => {
      socket.off('session:state', setSession);
      socket.off('connect', onConnect);
    };
  }, []);

  const createSession = () => {
    socket.emit('session:create', (result: { state: SessionState; hostToken: string }) => {
      const { code } = result.state;
      const token = result.hostToken;
      window.history.pushState({}, '', `/host/${code}?token=${token}`);
      persistSession(code, token);
      setSavedSessions(loadSavedSessions());
      setSession(result.state);
    });
  };

  const continueSession = (saved: SavedSession) => {
    window.history.pushState({}, '', `/host/${saved.code}?token=${saved.token}`);
    setRejoining(true);
    socket.emit('host:rejoin', saved.code, saved.token, (state: SessionState | null) => {
      setRejoining(false);
      if (state) {
        persistSession(saved.code, saved.token);
        setSavedSessions(loadSavedSessions());
        setSession(state);
      } else {
        dropSession(saved.code);
        setSavedSessions(loadSavedSessions());
        window.history.replaceState({}, '', '/host');
      }
    });
  };

  if (rejoining) {
    return (
      <div className="container text-center" style={{ paddingTop: 80 }}>
        <p className="text-dim">Reconnecting to session…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container" style={{ paddingTop: 80 }}>
        <h1 className="title">BuzzNScore</h1>
        <p className="subtitle">Host a new game session</p>
        {savedSessions.length > 0 && (
          <div style={{ maxWidth: 420, margin: '32px auto 0' }}>
            <div className="text-dim text-sm" style={{ marginBottom: 10 }}>Previous sessions</div>
            <div className="flex flex-col gap-8" style={{ marginBottom: 24 }}>
              {savedSessions.map(s => (
                <div key={s.code} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="session-code" style={{ fontSize: '1.4rem', lineHeight: 1.2 }}>{s.code}</div>
                    <div className="text-dim text-sm">{relativeTime(s.savedAt)}</div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => continueSession(s)}>Continue</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Remove"
                    style={{ color: 'var(--text-dim)', padding: '4px 8px' }}
                    onClick={() => { dropSession(s.code); setSavedSessions(loadSavedSessions()); }}
                  >✕</button>
                </div>
              ))}
            </div>
            <div className="divider" style={{ marginBottom: 24 }} />
          </div>
        )}
        <div className="text-center" style={{ marginTop: savedSessions.length === 0 ? 32 : 0 }}>
          <button className="btn btn-gold btn-large" onClick={createSession}>
            Create New Session
          </button>
        </div>
      </div>
    );
  }

  const hostToken = new URLSearchParams(window.location.search).get('token') ?? '';
  const hostUrl = `${window.location.origin}/host/${session.code}?token=${hostToken}`;
  const playerUrl = `${window.location.origin}/play/${session.code}`;
  const scoreboardUrl = `${window.location.origin}/score/${session.code}`;

  const copyLink = (url: string, key: string) => {
    const finish = () => { setCopied(key); setTimeout(() => setCopied(''), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(finish).catch(finish);
    } else {
      // Fallback for non-secure contexts (HTTP over LAN)
      const el = document.createElement('textarea');
      el.value = url;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try { document.execCommand('copy'); } catch (_) { /* ignore */ }
      document.body.removeChild(el);
      finish();
    }
  };

  const enableBuzzing  = () => socket.emit('buzzer:enable', session.code, true);
  const disableBuzzing = () => socket.emit('buzzer:enable', session.code, false);
  const resetBuzzing   = () => socket.emit('buzzer:reset', session.code);
  const adjustScore    = (teamId: string, delta: number) =>
    socket.emit('score:adjust', session.code, teamId, delta);

  const toggleJoining = (enabled: boolean) =>
    socket.emit('session:joining', session.code, enabled);

  const toggleTeamCreation = (allowed: boolean) =>
    socket.emit('team:allow-creation', session.code, allowed);

  const setQrMode = (mode: 'off' | 'small' | 'big') =>
    socket.emit('session:qr-mode', session.code, mode);

  const createTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    socket.emit('team:create', session.code, name, (error?: string) => {
      if (error) { setTeamError(error); return; }
      setNewTeamName('');
      setTeamError('');
    });
  };

  return (
    <div className="container">
      {!connected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(255,107,107,0.12)', borderBottom: '1px solid rgba(255,107,107,0.25)', color: '#ff9999', textAlign: 'center', padding: '7px', fontSize: '0.82rem', zIndex: 1000 }}>
          Reconnecting…
        </div>
      )}
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-16" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="text-dim text-sm" style={{ marginBottom: 2 }}>SESSION CODE</div>
          <div className="session-code" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)' }}>
            {session.code}
          </div>
        </div>
        <div className="flex gap-8 ml-auto flex-wrap host-topbar-actions">
          <button className="btn btn-secondary" onClick={resetBuzzing}>Reset Round</button>
          {session.buzzingEnabled ? (
            <button className="btn btn-red" style={{ minWidth: 180 }} onClick={disableBuzzing}>Disable Buzzing</button>
          ) : (
            <button className="btn btn-green" style={{ minWidth: 180 }} onClick={enableBuzzing}>Enable Buzzing</button>
          )}
        </div>
      </div>

      <div className="host-grid">
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-16">

          {/* Teams & Scores */}
          <div className="card">
            <div className="flex items-center" style={{ marginBottom: 12 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Teams &amp; Scores</div>
              <div className="flex items-center gap-8 ml-auto">
                {session.buzzingEnabled && (
                  <span className="badge badge-green">BUZZING OPEN</span>
                )}
                <button
                  className={`btn btn-sm ${editTeams ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setEditTeams(v => !v)}
                >
                  {editTeams ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>
            {session.teams.length === 0 ? (
              <p className="text-dim text-sm" style={{ marginBottom: 12 }}>No teams yet.</p>
            ) : (
              <div className="flex flex-col gap-8" style={{ marginBottom: 16 }}>
                {[...session.teams]
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                  .map((team) => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      buzzedPosition={session.buzzOrder.findIndex((e) => e.teamId === team.id)}
                      onAdjust={(d) => adjustScore(team.id, d)}
                      onDelete={() => socket.emit('team:delete', session.code, team.id)}
                      onRename={(name, cb) => socket.emit('team:rename', session.code, team.id, name, cb)}
                      editMode={editTeams}
                    />
                  ))}
              </div>
            )}
            <div className="divider" style={{ margin: '4px 0 12px' }} />
            <div className="flex gap-8">
              <input
                className="input"
                placeholder="New team name…"
                value={newTeamName}
                onChange={(e) => { setNewTeamName(e.target.value); setTeamError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && createTeam()}
                maxLength={30}
              />
              <button
                className="btn btn-secondary"
                onClick={createTeam}
                disabled={!newTeamName.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                + Add Team
              </button>
            </div>
            {teamError && <p style={{ color: '#ff6b6b', fontSize: '0.85rem', marginTop: 6 }}>{teamError}</p>}
          </div>

          {/* Buzz Order */}
          <div className="card">
            <div className="section-title">Buzz Order</div>
            {session.buzzOrder.length === 0 ? (
              <p className="text-dim text-sm">No buzzes yet this round.</p>
            ) : (
              <div className="flex flex-col gap-8">
                {session.buzzOrder.map((entry, i) => {
                  const prevMs = i === 0 ? session.buzzingOpenedAt : session.buzzOrder[i - 1].buzzedAt;
                  const deltaMs = prevMs != null ? entry.buzzedAt - prevMs : null;
                  const deltaLabel = deltaMs != null ? `+${(deltaMs / 1000).toFixed(2)}s` : null;
                  return (
                    <div key={entry.teamId} className="buzz-entry">
                      <span className={`buzz-rank buzz-rank-${i + 1}`}>
                        {`#${i + 1}`}
                      </span>
                      <span className="font-bold" style={{ flex: 1 }}>{entry.teamName}</span>
                      {deltaLabel && (
                        <span className="text-dim" style={{ fontSize: '0.78rem', marginRight: 6 }}>{deltaLabel}</span>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '2px 10px', fontSize: '0.8rem' }}
                        onClick={() => socket.emit('buzzer:unbuzz', session.code, entry.teamId)}
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-16">

          {/* Options */}
          <div className="card">
            <div className="section-title">Options</div>
            <div className="flex flex-col gap-16">

              {/* QR code display */}
              <div>
                <div className="text-dim text-sm" style={{ marginBottom: 8 }}>QR code on scoreboard</div>
                <div className="flex gap-4" style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius)', padding: 3 }}>
                  {(['off', 'small', 'big'] as const).map((mode) => (
                    <button
                      key={mode}
                      className="btn btn-sm"
                      style={{
                        flex: 1,
                        background: session.qrCodeMode === mode ? 'rgba(255,255,255,0.15)' : 'transparent',
                        color: session.qrCodeMode === mode ? 'var(--text)' : 'var(--text-dim)',
                        border: 'none',
                        textTransform: 'capitalize',
                      }}
                      onClick={() => setQrMode(mode)}
                    >
                      {mode === 'off' ? 'Off' : mode === 'small' ? 'Small' : 'Full screen'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player joining */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ fontWeight: 600 }}>Player joining</div>
                  <div className="text-dim text-sm">Allow players to join or create teams</div>
                </div>
                <button
                  className={`btn btn-sm ${session.joiningEnabled ? 'btn-green' : 'btn-ghost'}`}
                  onClick={() => toggleJoining(!session.joiningEnabled)}
                  style={{ minWidth: 64 }}
                >
                  {session.joiningEnabled ? 'Open' : 'Locked'}
                </button>
              </div>

              {/* Team creation */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ fontWeight: 600 }}>Player team creation</div>
                  <div className="text-dim text-sm">Allow players to create new teams</div>
                </div>
                <button
                  className={`btn btn-sm ${session.allowTeamCreation ? 'btn-green' : 'btn-ghost'}`}
                  onClick={() => toggleTeamCreation(!session.allowTeamCreation)}
                  style={{ minWidth: 64 }}
                >
                  {session.allowTeamCreation ? 'On' : 'Off'}
                </button>
              </div>

              {/* Max devices per team */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ fontWeight: 600 }}>Max devices per team</div>
                  <div className="text-dim text-sm">Cap how many devices can join one team</div>
                </div>
                <div className="flex items-center gap-8">
                  {session.maxTeamSize !== null && (
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={session.maxTeamSize}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value) || 1);
                        socket.emit('team:set-max-size', session.code, v);
                      }}
                      className="input"
                      style={{ width: 64, textAlign: 'center', padding: '6px 8px' }}
                    />
                  )}
                  <button
                    className={`btn btn-sm ${session.maxTeamSize !== null ? 'btn-green' : 'btn-ghost'}`}
                    onClick={() => socket.emit('team:set-max-size', session.code, session.maxTeamSize !== null ? null : 2)}
                    style={{ minWidth: 64 }}
                  >
                    {session.maxTeamSize !== null ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Links */}
          <div className="card">
            <div className="section-title">Links</div>
            <div className="flex flex-col gap-12">
              <LinkRow
                label="Player join"
                url={playerUrl}
                copyKey="player"
                copied={copied}
                onCopy={() => copyLink(playerUrl, 'player')}
                badge={session.waitingCount > 0 ? `${session.waitingCount} waiting` : undefined}
              />
              <div className="divider" style={{ margin: 0 }} />
              <LinkRow
                label="Scoreboard"
                url={scoreboardUrl}
                copyKey="scoreboard"
                copied={copied}
                onCopy={() => copyLink(scoreboardUrl, 'scoreboard')}
                badge={session.scoreboardCount > 0 ? `${session.scoreboardCount} watching` : undefined}
              />
              <div className="divider" style={{ margin: 0 }} />
              <LinkRow
                label="Host"
                url={hostUrl}
                copyKey="host"
                copied={copied}
                onCopy={() => copyLink(hostUrl, 'host')}
                showQrButton
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Link row ───────────────────────────────────────────────────────────────────

function LinkRow({
  label,
  url,
  copyKey,
  copied,
  onCopy,
  badge,
  showQrButton,
}: {
  label: string;
  url: string;
  copyKey: string;
  copied: string;
  onCopy: () => void;
  badge?: string;
  showQrButton?: boolean;
}) {
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-8" style={{ marginBottom: 4 }}>
        <div className="text-dim text-sm" style={{ flex: 1 }}>{label}</div>
        {badge && <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{badge}</span>}
        {showQrButton && (
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title="Show QR code"
            onClick={() => setQrOpen(v => !v)}
            style={{ color: qrOpen ? 'var(--text)' : undefined }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="3" height="3" /><rect x="18" y="14" width="3" height="3" /><rect x="14" y="18" width="3" height="3" /><rect x="18" y="18" width="3" height="3" />
            </svg>
          </button>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" title="Copy link" onClick={onCopy}>
          {copied === copyKey ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
        <a className="btn btn-ghost btn-icon btn-sm" href={url} target="_blank" rel="noopener noreferrer" title="Open in new tab">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
      <div className="text-dim" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>{url}</div>
      {qrOpen && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 10, display: 'inline-flex' }}>
            <QRCodeSVG value={url} size={160} bgColor="#ffffff" fgColor="#000000" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team row ───────────────────────────────────────────────────────────────────

function TeamRow({
  team,
  buzzedPosition,
  onAdjust,
  onDelete,
  onRename,
  editMode,
}: {
  team: TeamState;
  buzzedPosition: number;
  onAdjust: (delta: number) => void;
  onDelete: () => void;
  onRename: (name: string, cb: (error?: string) => void) => void;
  editMode: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  useEffect(() => {
    if (!editMode) {
      setConfirming(false);
      setRenaming(false);
      setRenameError('');
    }
  }, [editMode]);

  const startRename = () => {
    setRenameValue(team.name);
    setRenameError('');
    setRenaming(true);
  };

  const submitRename = () => {
    const name = renameValue.trim();
    if (!name || name === team.name) { setRenaming(false); return; }
    onRename(name, (error) => {
      if (error) { setRenameError(error); return; }
      setRenaming(false);
    });
  };

  const handleDelete = () => {
    if (confirming) {
      onDelete();
    } else {
      setConfirming(true);
    }
  };

  return (
    <div className="team-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div className="flex items-center gap-8 team-row-inner">
        <div style={{ minWidth: 0, flex: 1 }}>
          {renaming ? (
            <div className="flex gap-8 items-center" style={{ flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 100, padding: '4px 10px', fontSize: '1rem' }}
                value={renameValue}
                autoFocus
                maxLength={30}
                onChange={(e) => { setRenameValue(e.target.value); setRenameError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
              />
              <button className="btn btn-secondary btn-sm" onClick={submitRename} disabled={!renameValue.trim()}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>Cancel</button>
              {renameError && <span style={{ color: '#ff6b6b', fontSize: '0.8rem', width: '100%' }}>{renameError}</span>}
            </div>
          ) : (
            <>
              <div className="team-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {team.name}
                {buzzedPosition >= 0 && (
                  <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                    #{buzzedPosition + 1}
                  </span>
                )}
              </div>
              <div className="text-dim text-sm">
                {team.memberCount} device{team.memberCount !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
        <div className="score-buttons">
          {([-5, -1] as const).map((d) => (
            <button key={d} className="btn btn-ghost btn-sm" onClick={() => onAdjust(d)}>
              {d}
            </button>
          ))}
          <div className="team-score">{team.score}</div>
          {([1, 5] as const).map((d) => (
            <button key={d} className="btn btn-gold btn-sm" onClick={() => onAdjust(d)}>
              +{d}
            </button>
          ))}
        </div>
      </div>

      {/* Edit-mode action row — only visible in edit mode */}
      {editMode && !renaming && (
        confirming ? (
          <div className="flex gap-8 items-center" style={{ paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-sm" style={{ color: '#ff6b6b', flex: 1 }}>
              Delete {team.name}?{team.memberCount > 0 ? ` (${team.memberCount} player${team.memberCount !== 1 ? 's' : ''} will be removed)` : ''}
            </span>
            <button className="btn btn-red btn-sm" onClick={handleDelete}>Yes, delete</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <div className="flex gap-8" style={{ justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }} onClick={startRename}>
              Rename
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }} onClick={handleDelete}>
              Delete
            </button>
          </div>
        )
      )}
    </div>
  );
}

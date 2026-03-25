import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../socket';
import { SessionState, TeamState } from '../types';

export function HostView() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [copied, setCopied] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [teamError, setTeamError] = useState('');
  const [rejoining, setRejoining] = useState(false);

  useEffect(() => {
    socket.on('session:state', setSession);

    // Attempt to rejoin if the URL already has a code + token
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const token = params.get('token');
    if (code && token) {
      setRejoining(true);
      socket.emit('host:rejoin', code, token, (state: SessionState | null) => {
        setRejoining(false);
        if (state) {
          setSession(state);
        } else {
          // Session expired or token invalid — drop back to create screen
          window.history.replaceState({}, '', '?view=host');
        }
      });
    }

    return () => { socket.off('session:state', setSession); };
  }, []);

  const createSession = () => {
    socket.emit('session:create', (result: { state: SessionState; hostToken: string }) => {
      const { code } = result.state;
      window.history.replaceState({}, '', `?view=host&code=${code}&token=${result.hostToken}`);
      setSession(result.state);
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
        <div className="text-center mt-32">
          <button className="btn btn-gold btn-large" onClick={createSession}>
            Create Session
          </button>
        </div>
      </div>
    );
  }

  const playerUrl = `${window.location.origin}?view=player&code=${session.code}`;
  const scoreboardUrl = `${window.location.origin}?view=scoreboard&code=${session.code}`;

  const copyLink = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const enableBuzzing  = () => socket.emit('buzzer:enable', session.code, true);
  const disableBuzzing = () => socket.emit('buzzer:enable', session.code, false);
  const resetBuzzing   = () => socket.emit('buzzer:reset', session.code);
  const adjustScore    = (teamId: string, delta: number) =>
    socket.emit('score:adjust', session.code, teamId, delta);

  const toggleTeamCreation = (allowed: boolean) =>
    socket.emit('team:allow-creation', session.code, allowed);

  const toggleQrCode = (show: boolean) =>
    socket.emit('session:show-qr', session.code, show);

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
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-16" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="text-dim text-sm" style={{ marginBottom: 2 }}>SESSION CODE</div>
          <div className="session-code" style={{ fontSize: 'clamp(1.8rem, 5vw, 2.8rem)' }}>
            {session.code}
          </div>
        </div>
        <div className="flex gap-8 ml-auto flex-wrap">
          {session.showQrCode ? (
            <button className="btn btn-ghost" onClick={() => toggleQrCode(false)}>Hide QR</button>
          ) : (
            <button className="btn btn-secondary" onClick={() => toggleQrCode(true)}>Show QR</button>
          )}
          {session.allowTeamCreation ? (
            <button className="btn btn-ghost" onClick={() => toggleTeamCreation(false)}>Lock Teams</button>
          ) : (
            <button className="btn btn-secondary" onClick={() => toggleTeamCreation(true)}>Unlock Teams</button>
          )}
          {session.buzzingEnabled ? (
            <button className="btn btn-ghost" onClick={disableBuzzing}>Disable Buzzing</button>
          ) : (
            <button className="btn btn-green" onClick={enableBuzzing}>Enable Buzzing</button>
          )}
          <button className="btn btn-secondary" onClick={resetBuzzing}>Reset Round</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 24 }}>
        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-16">

          {/* Teams & Scores */}
          <div className="card">
            <div className="flex items-center" style={{ marginBottom: 12 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Teams &amp; Scores</div>
              {session.buzzingEnabled && (
                <span className="badge badge-green ml-auto">BUZZING OPEN</span>
              )}
            </div>
            {session.teams.length === 0 ? (
              <p className="text-dim text-sm" style={{ marginBottom: 12 }}>No teams yet.</p>
            ) : (
              <div className="flex flex-col gap-8" style={{ marginBottom: 16 }}>
                {[...session.teams]
                  .sort((a, b) => b.score - a.score)
                  .map((team) => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      buzzedPosition={session.buzzOrder.findIndex((e) => e.teamId === team.id)}
                      onAdjust={(d) => adjustScore(team.id, d)}
                      onDelete={() => socket.emit('team:delete', session.code, team.id)}
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
                {session.buzzOrder.map((entry, i) => (
                  <div key={entry.teamId} className="buzz-entry">
                    <span className={`buzz-rank buzz-rank-${i + 1}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <span className="font-bold">{entry.teamName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-16">

          {/* Player join QR */}
          <div className="card text-center">
            <div className="section-title">Player Join Link</div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
              <QRCodeSVG
                value={playerUrl}
                size={150}
                bgColor="transparent"
                fgColor="#ffd700"
                style={{ borderRadius: 8 }}
              />
            </div>
            <div className="text-dim text-sm" style={{ wordBreak: 'break-all', marginBottom: 10 }}>
              {playerUrl}
            </div>
            <button
              className="btn btn-secondary btn-sm w-full"
              onClick={() => copyLink(playerUrl, 'player')}
            >
              {copied === 'player' ? '✓ Copied!' : 'Copy Player Link'}
            </button>
          </div>

          {/* Scoreboard link */}
          <div className="card">
            <div className="section-title">Scoreboard Link</div>
            <div className="text-dim text-sm" style={{ wordBreak: 'break-all', margin: '8px 0 12px' }}>
              {scoreboardUrl}
            </div>
            <button
              className="btn btn-secondary btn-sm w-full"
              onClick={() => copyLink(scoreboardUrl, 'scoreboard')}
            >
              {copied === 'scoreboard' ? '✓ Copied!' : 'Copy Scoreboard Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Team row ───────────────────────────────────────────────────────────────────

function TeamRow({
  team,
  buzzedPosition,
  onAdjust,
  onDelete,
}: {
  team: TeamState;
  buzzedPosition: number;
  onAdjust: (delta: number) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    if (confirming) {
      onDelete();
    } else {
      setConfirming(true);
    }
  };

  return (
    <div className="team-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div className="flex items-center gap-8">
        <div style={{ minWidth: 0, flex: 1 }}>
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

      {/* Delete / confirm row */}
      {confirming ? (
        <div className="flex gap-8 items-center" style={{ paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-sm" style={{ color: '#ff6b6b', flex: 1 }}>
            Delete {team.name}?{team.memberCount > 0 ? ` (${team.memberCount} player${team.memberCount !== 1 ? 's' : ''} will be removed)` : ''}
          </span>
          <button className="btn btn-red btn-sm" onClick={handleDelete}>Yes, delete</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <div className="flex" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }} onClick={handleDelete}>
            Delete team
          </button>
        </div>
      )}
    </div>
  );
}

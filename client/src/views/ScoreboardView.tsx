import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { SessionState } from '../types';

export function ScoreboardView() {
  const initialCode = new URLSearchParams(window.location.search).get('code') ?? '';

  const [code, setCode] = useState(initialCode.toUpperCase());
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    socket.on('session:state', setSession);
    return () => { socket.off('session:state', setSession); };
  }, []);

  // Auto-watch when a code is in the URL
  useEffect(() => {
    if (initialCode) watchSession(initialCode.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchSession = (sessionCode: string) => {
    socket.emit(
      'scoreboard:watch',
      sessionCode,
      (state: SessionState | null) => {
        if (!state) { setError('Session not found. Check the code and try again.'); return; }
        setSession(state);
        setWatching(true);
        setError('');
      }
    );
  };

  // ── Enter code view ────────────────────────────────────────────────────────
  if (!watching) {
    return (
      <div className="container" style={{ paddingTop: 72 }}>
        <h1 className="title">Scoreboard</h1>
        <p className="subtitle">Enter a session code to watch live</p>
        <div className="card mt-32" style={{ maxWidth: 400, margin: '48px auto 0' }}>
          <div className="flex flex-col gap-12">
            <input
              className="input"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textAlign: 'center', fontSize: '1.6rem', letterSpacing: '0.2em' }}
              onKeyDown={(e) => e.key === 'Enter' && watchSession(code)}
            />
            {error && <p style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>{error}</p>}
            <button
              className="btn btn-gold"
              onClick={() => watchSession(code)}
              disabled={code.length < 4}
            >
              Watch Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="scoreboard-container flex items-center justify-between text-center" style={{ padding: 48 }}>
        <p className="text-dim">Connecting…</p>
      </div>
    );
  }

  const sortedTeams = [...session.teams].sort((a, b) => b.score - a.score);

  return (
    <div className="scoreboard-container">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="scoreboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="text-dim text-sm" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              BuzzNScore
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,215,0,0.7)' }}>
              Code: {session.code}
            </div>
          </div>
          <div className="ml-auto">
            {session.buzzingEnabled ? (
              <span className="badge badge-green" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                🔴 BUZZING OPEN
              </span>
            ) : (
              <span className="badge badge-dim" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                Waiting…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Buzz Order Banner ───────────────────────────────────────────── */}
      {session.buzzOrder.length > 0 && (
        <div
          style={{
            background: 'rgba(255,215,0,0.05)',
            borderBottom: '1px solid rgba(255,215,0,0.15)',
            padding: '16px 24px',
          }}
        >
          <div className="section-title">Buzz Order</div>
          <div className="flex gap-8 flex-wrap">
            {session.buzzOrder.map((entry, i) => (
              <div key={entry.teamId} className="buzz-entry" style={{ flex: '0 0 auto' }}>
                <span className={`buzz-rank buzz-rank-${i + 1}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span className="font-bold">{entry.teamName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scores ──────────────────────────────────────────────────────── */}
      <div>
        {sortedTeams.map((team, i) => {
          const buzzPos = session.buzzOrder.findIndex((e) => e.teamId === team.id);
          return (
            <div key={team.id} className="score-row">
              <div className={`score-rank-label rank-${i + 1}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </div>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{team.name}</div>
                <div className="text-dim text-sm" style={{ display: 'flex', gap: 8 }}>
                  <span>{team.memberCount} player{team.memberCount !== 1 ? 's' : ''}</span>
                  {buzzPos >= 0 && (
                    <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                      buzzed #{buzzPos + 1}
                    </span>
                  )}
                </div>
              </div>
              <div className="score-value">{team.score}</div>
            </div>
          );
        })}
        {sortedTeams.length === 0 && (
          <div className="text-center text-dim" style={{ padding: '64px 24px' }}>
            Waiting for teams to join…
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../socket';
import { SessionState, TeamState } from '../types';

export function ScoreboardView() {
  const initialCode = new URLSearchParams(window.location.search).get('code') ?? '';

  const [code, setCode] = useState(initialCode.toUpperCase());
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [watching, setWatching] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const hasConnectedRef = useRef(false);

  // Refs so reconnect handler always sees current values
  const watchingRef = useRef(watching);
  const codeRef = useRef(code);
  watchingRef.current = watching;
  codeRef.current = code;

  // ── FLIP animation ─────────────────────────────────────────────────────────
  // displayedSorted: the order actually rendered (debounced ~700ms after score changes)
  // Scores shown are always live from session; only the card positions are debounced.
  const [displayedSorted, setDisplayedSorted] = useState<TeamState[]>([]);
  const latestSorted = useRef<TeamState[]>([]);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const prevPositions = useRef(new Map<string, DOMRect>());
  const shouldAnimate = useRef(false);
  const sortedInitialized = useRef(false);

  // Compute sort order from live session (null-safe for hook ordering)
  const sortedTeams = session ? [...session.teams].sort((a, b) => b.score - a.score) : [];
  const sortedIds = sortedTeams.map(t => t.id).join(',');
  latestSorted.current = sortedTeams;

  // Debounce re-ordering: wait 700ms after the last score change before re-sorting
  useEffect(() => {
    if (!session) return;
    if (!sortedInitialized.current) {
      setDisplayedSorted(sortedTeams);
      sortedInitialized.current = true;
      return;
    }
    const timer = setTimeout(() => {
      // Capture current card positions before React re-renders
      cardRefs.current.forEach((el, id) => {
        if (el) prevPositions.current.set(id, el.getBoundingClientRect());
      });
      shouldAnimate.current = true;
      setDisplayedSorted([...latestSorted.current]);
    }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedIds]);

  // FLIP: after the re-sort re-render, invert each card's position and animate to 0
  useLayoutEffect(() => {
    if (!shouldAnimate.current) return;
    shouldAnimate.current = false;
    cardRefs.current.forEach((el, teamId) => {
      const prev = prevPositions.current.get(teamId);
      if (!prev || !el) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // force reflow
      el.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      el.style.transform = '';
    });
  }, [displayedSorted]);

  useEffect(() => {
    const onConnect = () => {
      const isFirst = !hasConnectedRef.current;
      hasConnectedRef.current = true;
      setConnected(true);
      if (isFirst || !watchingRef.current) return;
      socket.emit('scoreboard:watch', codeRef.current, (state: SessionState | null) => {
        if (state) setSession(state);
      });
    };

    socket.on('session:state', setSession);
    socket.on('connect', onConnect);
    socket.on('disconnect', () => setConnected(false));

    if (socket.connected) onConnect();

    return () => {
      socket.off('session:state', setSession);
      socket.off('connect', onConnect);
    };
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

  // Render in debounced order, but show live scores from session
  const teamById = new Map(session.teams.map(t => [t.id, t]));
  const liveDisplayed = displayedSorted
    .filter(t => teamById.has(t.id))
    .map(t => teamById.get(t.id)!);
  const topTeams = liveDisplayed.slice(0, 3);
  const restTeams = liveDisplayed.slice(3);

  const setCardRef = (teamId: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(teamId, el);
    else cardRefs.current.delete(teamId);
  };

  const playerUrl = `${window.location.origin}?view=player&code=${session.code}`;

  return (
    <div className="scoreboard-container">
      {!connected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(255,107,107,0.12)', borderBottom: '1px solid rgba(255,107,107,0.25)', color: '#ff9999', textAlign: 'center', padding: '7px', fontSize: '0.82rem', zIndex: 1000 }}>
          Reconnecting…
        </div>
      )}
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
          {session.qrCodeMode === 'small' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <QRCodeSVG value={playerUrl} size={72} bgColor="transparent" fgColor="#ffd700" style={{ borderRadius: 6 }} />
              <div>
                <div className="text-dim text-sm">Scan to join</div>
                <div style={{ fontWeight: 700, letterSpacing: '0.12em', color: 'var(--gold)', fontSize: '1.1rem' }}>
                  {session.code}
                </div>
              </div>
            </div>
          )}
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
      {(session.buzzingEnabled || session.buzzOrder.length > 0) && (
        <div
          style={{
            background: 'rgba(255,215,0,0.05)',
            borderBottom: '1px solid rgba(255,215,0,0.15)',
            padding: '16px 24px',
          }}
        >
          <div className="section-title">Buzz Order</div>
          <div className="flex gap-8 flex-wrap">
            {session.buzzOrder.length === 0 ? (
              <div className="buzz-entry text-dim" style={{ fontSize: '1.3rem' }}>Waiting for buzzes…</div>
            ) : session.buzzOrder.map((entry, i) => (
              <div key={entry.teamId} className="buzz-entry" style={{ flex: '0 0 auto' }}>
                <span className={`buzz-rank buzz-rank-${i + 1}`}>
                  {`#${i + 1}`}
                </span>
                <span className="font-bold">{entry.teamName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scores ──────────────────────────────────────────────────────── */}
      {liveDisplayed.length === 0 ? (
        <div className="text-center text-dim" style={{ padding: '64px 24px' }}>
          Waiting for teams to join…
        </div>
      ) : (
        <>
          {/* Top 3 */}
          <div className="scoreboard-top">
            {topTeams.map((team, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const buzzPos = session.buzzOrder.findIndex((e) => e.teamId === team.id);
              return (
                <div key={team.id} className={`top-card rank-${i + 1}`} ref={setCardRef(team.id)}>
                  <div className="top-card-medal">{medals[i]}</div>
                  <div className="top-card-name">{team.name}</div>
                  <div className="top-card-score">{team.score}</div>
                  <div className="top-card-meta text-dim text-sm">
                    {/* Temporarily disabled. Maybe make it an option later. */}
                    {/* <span>{team.memberCount} player{team.memberCount !== 1 ? 's' : ''}</span> */}
                    {buzzPos >= 0 && (
                      <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                        buzzed #{buzzPos + 1}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Remaining teams */}
          {restTeams.length > 0 && (
            <div className="scoreboard-rest">
              {restTeams.map((team, i) => {
                const buzzPos = session.buzzOrder.findIndex((e) => e.teamId === team.id);
                return (
                  <div key={team.id} className="rest-card" ref={setCardRef(team.id)}>
                    <div className="rest-card-rank">#{i + 4}</div>
                    <div className="rest-card-name">{team.name}</div>
                    <div className="rest-card-score">{team.score}</div>
                    <div className="rest-card-meta text-dim text-sm">
                      {/* <span>{team.memberCount} player{team.memberCount !== 1 ? 's' : ''}</span> */}
                      {buzzPos >= 0 && (
                        <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                          buzzed #{buzzPos + 1}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Big QR overlay ──────────────────────────────────────────────── */}
      {session.qrCodeMode === 'big' && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 32, zIndex: 100,
        }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Scan to join
          </div>
          <QRCodeSVG
            value={playerUrl}
            size={Math.min(window.innerWidth, window.innerHeight) * 0.55}
            bgColor="transparent"
            fgColor="#ffd700"
            style={{ borderRadius: 12 }}
          />
          <div style={{ fontSize: 'clamp(2.5rem, 8vw, 5rem)', fontWeight: 900, letterSpacing: '0.2em', color: 'var(--gold)', fontFamily: 'monospace' }}>
            {session.code}
          </div>
        </div>
      )}
    </div>
  );
}

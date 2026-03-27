import { useState, useEffect, useRef, useMemo } from 'react';
import { socket } from '../socket';
import { SessionState, TeamState } from '../types';

type Step = 'enter-code' | 'pick-team' | 'in-game';

export function PlayerView() {
  const params = new URLSearchParams(window.location.search);
  const initialCode = (params.get('code') ?? '').toUpperCase();

  const [step, setStep] = useState<Step>(initialCode ? 'pick-team' : 'enter-code');
  const [code, setCode] = useState(initialCode);
  const [availableTeams, setAvailableTeams] = useState<TeamState[]>([]);
  const [teamCreationAllowed, setTeamCreationAllowed] = useState(true);
  const [maxTeamSize, setMaxTeamSize] = useState<number | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [optimisticBuzzed, setOptimisticBuzzed] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const hasConnectedRef = useRef(false);

  // Refs so the reconnect handler always sees current values without being recreated
  const stepRef = useRef(step);
  const codeRef = useRef(code);
  const teamNameRef = useRef(teamName);
  stepRef.current = step;
  codeRef.current = code;
  teamNameRef.current = teamName;

  useEffect(() => {
    const onState = (state: SessionState) => {
      setSession(state);
      setTeamCreationAllowed(state.allowTeamCreation);
      setMaxTeamSize(state.maxTeamSize);
      if (!state.buzzingEnabled && state.buzzOrder.length === 0) {
        setOptimisticBuzzed(false);
      }
    };
    const onTeamDeleted = () => {
      setStep('pick-team');
      setTeamId('');
      setTeamName('');
      setSession(null);
      setOptimisticBuzzed(false);
      setError('Your team was deleted by the host.');
      // Re-peek so the team list is fresh
      socket.emit(
        'session:peek',
        code,
        (result: { teams: TeamState[]; allowTeamCreation: boolean } | null) => {
          if (result) { setAvailableTeams(result.teams); setTeamCreationAllowed(result.allowTeamCreation); }
        }
      );
    };
    const onPeekUpdate = (result: { teams: TeamState[]; allowTeamCreation: boolean; maxTeamSize: number | null }) => {
      setAvailableTeams(result.teams);
      setTeamCreationAllowed(result.allowTeamCreation);
      setMaxTeamSize(result.maxTeamSize);
    };

    const onConnect = () => {
      const isFirst = !hasConnectedRef.current;
      hasConnectedRef.current = true;
      setConnected(true);
      if (isFirst) return; // initial mount effects handle the first connection

      const s = stepRef.current;
      const c = codeRef.current;
      const tn = teamNameRef.current;

      if (s === 'pick-team' && c) {
        socket.emit(
          'session:peek',
          c,
          (result: { teams: TeamState[]; allowTeamCreation: boolean; maxTeamSize: number | null } | null) => {
            if (!result) { setError('Session not found.'); setStep('enter-code'); return; }
            setAvailableTeams(result.teams);
            setTeamCreationAllowed(result.allowTeamCreation);
            setMaxTeamSize(result.maxTeamSize);
          }
        );
      } else if (s === 'in-game' && c && tn) {
        socket.emit(
          'player:join',
          c,
          tn,
          (result: { success: boolean; teamId?: string; state?: SessionState; error?: string }) => {
            if (!result.success) {
              setStep('pick-team');
              setTeamId('');
              setSession(null);
              setOptimisticBuzzed(false);
              setError(result.error ?? 'Could not rejoin team. Please select again.');
              socket.emit('session:peek', c, (peek: { teams: TeamState[]; allowTeamCreation: boolean; maxTeamSize: number | null } | null) => {
                if (peek) { setAvailableTeams(peek.teams); setTeamCreationAllowed(peek.allowTeamCreation); setMaxTeamSize(peek.maxTeamSize); }
              });
              return;
            }
            setTeamId(result.teamId!);
            if (result.state) setSession(result.state);
          }
        );
      }
    };

    socket.on('session:state', onState);
    socket.on('session:peek-update', onPeekUpdate);
    socket.on('team:deleted', onTeamDeleted);
    socket.on('connect', onConnect);
    socket.on('disconnect', () => setConnected(false));

    if (socket.connected) onConnect();

    return () => {
      socket.off('session:state', onState);
      socket.off('session:peek-update', onPeekUpdate);
      socket.off('team:deleted', onTeamDeleted);
      socket.off('connect', onConnect);
    };
  }, []);

  // If code was in the URL, peek immediately on mount
  useEffect(() => {
    if (initialCode) peekSession(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const peekSession = (sessionCode: string) => {
    setError('');
    socket.emit(
      'session:peek',
      sessionCode,
      (result: { teams: TeamState[]; allowTeamCreation: boolean; maxTeamSize: number | null } | null) => {
        if (!result) { setError('Session not found.'); setStep('enter-code'); return; }
        setAvailableTeams(result.teams);
        setTeamCreationAllowed(result.allowTeamCreation);
        setMaxTeamSize(result.maxTeamSize);
        setStep('pick-team');
      }
    );
  };

  const joinTeam = (name: string) => {
    socket.emit(
      'player:join',
      code,
      name,
      (result: { success: boolean; teamId?: string; state?: SessionState; error?: string }) => {
        if (!result.success) { setError(result.error ?? 'Failed to join'); return; }
        setTeamId(result.teamId!);
        setTeamName(name);
        if (result.state) setSession(result.state);
        setStep('in-game');
        setError('');
      }
    );
  };

  const buzz = () => {
    if (!session || !buzzState.canBuzz) return;
    setOptimisticBuzzed(true);
    socket.emit('player:buzz', session.code);
  };

  const buzzState = useMemo(() => {
    if (!session || step !== 'in-game') return { canBuzz: false, buzzed: false, position: -1 };
    const pos = session.buzzOrder.findIndex((e) => e.teamId === teamId);
    const buzzed = pos >= 0 || optimisticBuzzed;
    return { canBuzz: session.buzzingEnabled && !buzzed, buzzed, position: pos };
  }, [session, step, teamId, optimisticBuzzed]);

  const reconnectBanner = !connected && (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(255,107,107,0.12)', borderBottom: '1px solid rgba(255,107,107,0.25)', color: '#ff9999', textAlign: 'center', padding: '7px', fontSize: '0.82rem', zIndex: 1000 }}>
      Reconnecting…
    </div>
  );

  // ── Step 1: Enter session code ─────────────────────────────────────────────
  if (step === 'enter-code') {
    return (
      <div className="container" style={{ paddingTop: 60, maxWidth: 440 }}>{reconnectBanner}
        <h1 className="title">Join Game</h1>
        <div className="card mt-32">
          <div className="flex flex-col gap-16">
            <div>
              <label className="text-dim text-sm">Session Code</label>
              <input
                className="input mt-8"
                placeholder="ABC123"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.2em' }}
                onKeyDown={(e) => e.key === 'Enter' && peekSession(code)}
                autoFocus
              />
            </div>
            {error && <p style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>{error}</p>}
            <button
              className="btn btn-gold"
              onClick={() => peekSession(code)}
              disabled={code.trim().length < 4}
            >
              Find Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Pick or create a team ──────────────────────────────────────────
  if (step === 'pick-team') {
    return (
      <div className="container" style={{ paddingTop: 60, maxWidth: 480 }}>{reconnectBanner}
        <h1 className="title">Join Game</h1>
        <p className="subtitle" style={{ marginTop: 6 }}>
          Code: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{code}</span>
        </p>

        {/* Existing teams */}
        {availableTeams.length > 0 && (
          <div className="card mt-24">
            <div className="section-title">Join an existing team</div>
            <div className="flex flex-col gap-8">
              {availableTeams.map((team) => {
                const isFull = maxTeamSize !== null && team.memberCount >= maxTeamSize;
                return (
                  <button
                    key={team.id}
                    className="team-card"
                    disabled={isFull}
                    style={{
                      cursor: isFull ? 'not-allowed' : 'pointer',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 'var(--radius)',
                      width: '100%',
                      textAlign: 'left',
                      color: 'var(--text)',
                      opacity: isFull ? 0.5 : 1,
                    }}
                    onClick={() => !isFull && joinTeam(team.name)}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="team-name">{team.name}</div>
                      <div className="text-dim text-sm">
                        {team.memberCount}{maxTeamSize !== null ? `/${maxTeamSize}` : ''} device{team.memberCount !== 1 ? 's' : ''} · {team.score} pts
                      </div>
                    </div>
                    <span className="btn btn-secondary btn-sm" style={{ pointerEvents: 'none' }}>
                      {isFull ? 'Full' : 'Join'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Create new team — hidden when host has locked team creation */}
        {teamCreationAllowed && (
          <div className="card mt-16">
            <div className="section-title">
              {availableTeams.length === 0 ? 'Create your team' : 'Or create a new team'}
            </div>
            <div className="flex flex-col gap-12">
              <input
                className="input"
                placeholder="Team name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                maxLength={30}
                onKeyDown={(e) => e.key === 'Enter' && newTeamName.trim() && joinTeam(newTeamName.trim())}
                autoComplete="off"
              />
              {error && <p style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>{error}</p>}
              <button
                className="btn btn-gold"
                onClick={() => joinTeam(newTeamName.trim())}
                disabled={!newTeamName.trim()}
              >
                Create &amp; Join
              </button>
            </div>
          </div>
        )}

        <button
          className="btn btn-ghost btn-sm mt-16"
          onClick={() => { setStep('enter-code'); setError(''); }}
        >
          ← Back
        </button>
      </div>
    );
  }

  // ── Step 3: In-game ────────────────────────────────────────────────────────
  const { canBuzz, buzzed, position } = buzzState;
  const buzzLabel = buzzed ? (position === 0 ? 'FIRST!' : 'BUZZED!') : canBuzz ? 'BUZZ!' : 'WAITING…';
  const buzzClass = buzzed ? 'buzz-button-buzzed' : canBuzz ? 'buzz-button-active' : 'buzz-button-waiting';

  return (
    <div className="container text-center" style={{ paddingTop: 32, maxWidth: 500 }}>{reconnectBanner}
      <div className="text-dim text-sm">Playing as</div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, marginTop: 4 }}>{teamName}</div>

      <div style={{ marginTop: 14 }}>
        {session?.buzzingEnabled ? (
          <span className="badge badge-green">BUZZING OPEN</span>
        ) : (
          <span className="badge badge-dim">Waiting for host…</span>
        )}
      </div>

      <button className={`buzz-button ${buzzClass}`} onClick={buzz} disabled={!canBuzz}>
        {buzzLabel}
      </button>

      {buzzed && position >= 0 && (
        <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>
          {position === 0 ? '🥇 You were first!' : position === 1 ? '🥈 Second place' : position === 2 ? '🥉 Third place' : `You buzzed in #${position + 1}`}
        </div>
      )}
      {buzzed && position < 0 && (
        <div className="text-dim" style={{ marginTop: 4 }}>Buzz registered…</div>
      )}

      {session && session.teams.length > 0 && (
        <div className="card mt-24" style={{ textAlign: 'left' }}>
          <div className="section-title">Scores</div>
          <div className="flex flex-col gap-4">
            {[...session.teams].sort((a, b) => b.score - a.score).map((team, i) => {
              const isMe = team.id === teamId;
              return (
                <div
                  key={team.id}
                  className="flex items-center"
                  style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span style={{ color: 'var(--text-dim)', minWidth: 24, fontSize: '0.85rem' }}>{i + 1}.</span>
                  <span style={{ fontWeight: isMe ? 700 : 400, color: isMe ? 'var(--gold)' : 'var(--text)', flex: 1 }}>
                    {isMe ? '▶ ' : ''}{team.name}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{team.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

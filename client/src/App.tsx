import { useState, useEffect } from 'react';
import { HostView } from './views/HostView';
import { ScoreboardView } from './views/ScoreboardView';
import { PlayerView } from './views/PlayerView';

function getView() {
  return new URLSearchParams(window.location.search).get('view') ?? 'landing';
}

export default function App() {
  const [view, setView] = useState(getView);

  useEffect(() => {
    function onPopState() {
      setView(getView());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(v: string) {
    const url = new URL(window.location.href);
    url.search = `?view=${v}`;
    window.history.pushState({}, '', url);
    setView(v);
  }

  if (view === 'host') return <HostView />;
  if (view === 'scoreboard') return <ScoreboardView />;
  if (view === 'player') return <PlayerView />;

  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <h1 className="title">BuzzNScore</h1>
      <p className="subtitle">Live gameshow buzzer &amp; score manager</p>
      <div className="landing-buttons">
        <button className="btn btn-gold btn-large" onClick={() => navigate('host')}>
          Host a Game
        </button>
        <button className="btn btn-secondary btn-large" onClick={() => navigate('player')}>
          Join as Player
        </button>
        <button className="btn btn-secondary btn-large" onClick={() => navigate('scoreboard')}>
          View Scoreboard
        </button>
      </div>
    </div>
  );
}

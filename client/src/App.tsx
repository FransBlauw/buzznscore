import { useState, useEffect } from 'react';
import { HostView } from './views/HostView';
import { ScoreboardView } from './views/ScoreboardView';
import { PlayerView } from './views/PlayerView';
import { LandingView } from './views/LandingView';

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

  return <LandingView navigate={navigate} />;
}

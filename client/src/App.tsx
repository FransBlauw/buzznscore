import { useState, useEffect } from 'react';
import { HostView } from './views/HostView';
import { ScoreboardView } from './views/ScoreboardView';
import { PlayerView } from './views/PlayerView';

function getView() {
  const p = window.location.pathname;
  if (p.startsWith('/host')) return 'host';
  if (p.startsWith('/play')) return 'player';
  if (p.startsWith('/score')) return 'scoreboard';
  return '';
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

  if (view === 'host') return <HostView />;
  if (view === 'scoreboard') return <ScoreboardView />;
  if (view === 'player') return <PlayerView />;

  window.location.replace('/');
  return null;
}

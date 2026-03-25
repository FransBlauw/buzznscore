import { HostView } from './views/HostView';
import { ScoreboardView } from './views/ScoreboardView';
import { PlayerView } from './views/PlayerView';

const view = new URLSearchParams(window.location.search).get('view') ?? 'landing';

export default function App() {
  if (view === 'host') return <HostView />;
  if (view === 'scoreboard') return <ScoreboardView />;
  if (view === 'player') return <PlayerView />;

  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <h1 className="title">BuzzNScore</h1>
      <p className="subtitle">Live gameshow buzzer &amp; score manager</p>
      <div className="landing-buttons">
        <a href="?view=host" className="btn btn-gold btn-large">
          Host a Game
        </a>
        <a href="?view=player" className="btn btn-secondary btn-large">
          Join as Player
        </a>
        <a href="?view=scoreboard" className="btn btn-secondary btn-large">
          View Scoreboard
        </a>
      </div>
    </div>
  );
}

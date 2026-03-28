interface LandingViewProps {
  navigate: (view: string) => void;
}

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant Buzzer',
    desc: 'First team to tap wins. Millisecond-accurate timestamps rank every buzz in order.',
  },
  {
    icon: '📊',
    title: 'Live Scoreboard',
    desc: 'Scores update in real time across all screens. Animated reordering as points change.',
  },
  {
    icon: '📱',
    title: 'QR Code Joining',
    desc: 'Display a QR code on the scoreboard screen, players scan and join instantly.',
  },
  {
    icon: '👥',
    title: 'Multiple Teams',
    desc: "Create and name as many teams as you need. Players pick or create their own team.",
  },
  {
    icon: '🎛️',
    title: 'Host Controls',
    desc: 'Enable and disable buzzing, reset rounds, adjust scores, lock joining, all in one place.',
  },
  {
    icon: '🔓',
    title: 'No Account Needed',
    desc: 'Sessions are code-based and ephemeral. No sign-up, no passwords, no friction.',
  },
];

const USE_CASES = [
  { icon: '🍺', label: 'Trivia Nights', desc: 'Pub quizzes and bar trivia with real buzz-in drama.' },
  { icon: '📚', label: 'Classroom Quizzes', desc: 'Engage students with competitive, instant-feedback rounds.' },
  { icon: '🎉', label: 'Party Games', desc: 'Keep everyone on their toes at birthdays and gatherings.' },
  { icon: '🏆', label: 'Team Competitions', desc: 'Corporate events, hackathons, and any team challenge.' },
];

export function LandingView({ navigate }: LandingViewProps) {
  return (
    <div className="landing-page">
      {/* Hero */}
      <section className="landing-hero">
        <div className="container">
          <div className="landing-hero-badge">
            Free · No account required · Works on any device
          </div>
          <h1 className="title landing-hero-title">BuzzNScore</h1>
          <p className="landing-hero-tagline">
            Real-time buzzer and score management for game nights, classrooms, and competitions
          </p>
          <div className="landing-cta-group">
            <button className="btn btn-gold btn-large" onClick={() => navigate('host')}>
              Host a New Game
            </button>
            <div className="landing-cta-secondary">
              <button className="btn btn-secondary" onClick={() => navigate('player')}>
                Join a Game
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('scoreboard')}>
                Watch Scoreboard
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section">
        <div className="container">
          <h2 className="landing-section-heading">Everything you need to run the show</h2>
          <div className="landing-features-grid">
            {FEATURES.map(f => (
              <div className="card landing-feature-card" key={f.title}>
                <div className="landing-feature-icon">{f.icon}</div>
                <h3 className="landing-feature-title">{f.title}</h3>
                <p className="landing-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-section landing-section-alt">
        <div className="container">
          <h2 className="landing-section-heading">Up and running in seconds</h2>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-num">1</div>
              <h3 className="landing-step-title">Host creates a session</h3>
              <p className="landing-step-desc">
                Click "Host a New Game." A unique session code is generated instantly.
                Share the code or QR with players.
              </p>
            </div>
            <div className="landing-step-connector" aria-hidden="true" />
            <div className="landing-step">
              <div className="landing-step-num">2</div>
              <h3 className="landing-step-title">Players join by code</h3>
              <p className="landing-step-desc">
                Players open the link, enter the code (or scan the QR), pick a team,
                and they're in. No download. No account.
              </p>
            </div>
            <div className="landing-step-connector" aria-hidden="true" />
            <div className="landing-step">
              <div className="landing-step-num">3</div>
              <h3 className="landing-step-title">Play and keep score</h3>
              <p className="landing-step-desc">
                Host enables buzzing. Teams race to buzz first. Award points from the host panel.
                Scoreboard updates live for everyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="landing-section">
        <div className="container">
          <h2 className="landing-section-heading">Perfect for</h2>
          <div className="landing-usecases-grid">
            {USE_CASES.map(u => (
              <div className="card landing-usecase-card" key={u.label}>
                <span className="landing-usecase-icon">{u.icon}</span>
                <div>
                  <div className="landing-usecase-label">{u.label}</div>
                  <div className="landing-usecase-desc">{u.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="landing-section landing-footer-cta">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 className="landing-section-heading">Ready to play?</h2>
          <p className="subtitle" style={{ marginBottom: 32 }}>
            No setup required. Your session is ready in one click.
          </p>
          <button className="btn btn-gold btn-large" onClick={() => navigate('host')}>
            Host a New Game
          </button>
        </div>
      </section>
    </div>
  );
}

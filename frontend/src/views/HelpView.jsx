export default function HelpView({ appSettings, onNavigate }) {
  if (!appSettings?.howItWorks) {
    return (
      <section className="panel settings-panel">
        <p className="settings-desc">Loading guide…</p>
      </section>
    );
  }

  const { howItWorks } = appSettings;

  return (
    <section className="panel settings-panel">
      <h2>{howItWorks.title}</h2>
      <p className="settings-desc">
        RDM is a personal remote download manager. Queue links from any device; files save to your home server.
      </p>

      <div className="auth-form-block">
        <h3>How to download</h3>
        <ol className="cookie-steps">
          {howItWorks.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </div>

      <div className="auth-form-block">
        <h3>Works without login</h3>
        <ul className="works-list">
          {howItWorks.worksWithoutLogin.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="platform-note">
        <h4>Cannot download (platform privacy)</h4>
        <ul>
          {howItWorks.needsPublicLink.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{howItWorks.alternative}</p>
      </div>

      <div className="quick-links-grid help-links">
        <button type="button" className="quick-link-card accent-blue" onClick={() => onNavigate('new')}>
          <span>New Download</span>
        </button>
        <button type="button" className="quick-link-card accent-purple" onClick={() => onNavigate('platform-settings')}>
          <span>Platform Auth</span>
        </button>
        <button type="button" className="quick-link-card accent-orange" onClick={() => onNavigate('logs')}>
          <span>Activity Logs</span>
        </button>
        <button type="button" className="quick-link-card accent-orange" onClick={() => onNavigate('system')}>
          <span>System Health</span>
        </button>
      </div>
    </section>
  );
}

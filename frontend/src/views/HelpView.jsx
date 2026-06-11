import SectionEyebrow from '../components/SectionEyebrow.jsx';
import AsyncPanel from '../components/AsyncPanel.jsx';

export default function HelpView({ appSettings, onNavigate }) {
  if (!appSettings) {
    return <AsyncPanel title="HELP & GUIDE" tint="lime" loading />;
  }

  if (!appSettings.howItWorks) {
    return (
      <AsyncPanel
        title="HELP & GUIDE"
        tint="lime"
        loading={false}
        error="Guide content is not available on this server."
      />
    );
  }

  const { howItWorks } = appSettings;

  return (
    <section className="panel settings-panel">
      <SectionEyebrow title={howItWorks.title?.toUpperCase() || 'HELP & GUIDE'} tint="lime" />
      <div className="panel-body">
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
      </div>
    </section>
  );
}

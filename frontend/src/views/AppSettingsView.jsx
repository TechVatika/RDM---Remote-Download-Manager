export default function AppSettingsView({ appSettings, onNavigate }) {
  if (!appSettings) {
    return (
      <section className="panel settings-panel">
        <p className="settings-desc">Loading settings…</p>
      </section>
    );
  }

  return (
    <section className="panel settings-panel">
      <h2>Application settings</h2>
      <p className="settings-desc">
        Server-side configuration. Most values are set in <code>backend/.env</code> and require a backend restart.
      </p>

      <div className="cookie-status-card">
        <div className="cookie-status-row">
          <span>Download base path</span>
          <strong>{appSettings.downloadPaths?.base}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Folders</span>
          <strong>{appSettings.downloadPaths?.folders?.join(', ')}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Default connections</span>
          <strong>{appSettings.speed?.defaultConnections ?? appSettings.connections?.default ?? 16}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Max connections</span>
          <strong>{appSettings.speed?.maxConnections ?? appSettings.connections?.max ?? 32}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Concurrent downloads</span>
          <strong>{appSettings.speed?.maxConcurrentDownloads ?? 4}</strong>
        </div>
        <div className="cookie-status-row">
          <span>yt-dlp parallel fragments</span>
          <strong>{appSettings.speed?.ytdlp?.concurrentFragments ?? 8}</strong>
        </div>
        <div className="cookie-status-row">
          <span>Public-only mode</span>
          <strong>{appSettings.publicMediaOnly ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div className="cookie-status-row">
          <span>AI smart naming</span>
          <strong>
            {appSettings.aiRename?.enabled
              ? `${appSettings.aiRename.provider} · ${appSettings.aiRename.model}`
              : appSettings.aiRename?.configured
                ? 'Configured but disabled (AI_RENAME=false)'
                : 'Not configured'}
          </strong>
        </div>
      </div>

      <div className="auth-form-block">
        <h3>AI naming</h3>
        <p className="block-help">
          When enabled, RDM uses Gemini or OpenAI to rename files after download based on URL, title, and context.
          Toggle AI naming per download on the New Download page.
        </p>
        <ul className="works-list">
          <li>Provider: {appSettings.aiRename?.provider || 'None'}</li>
          <li>Model: {appSettings.aiRename?.model || '—'}</li>
          <li>Status: {appSettings.aiRename?.enabled ? 'Active' : 'Inactive'}</li>
        </ul>
      </div>

      <div className="auth-form-block">
        <h3>Platform authentication</h3>
        <p className="block-help">
          Configure Instagram/Facebook cookies and session tokens for private content.
        </p>
        <button type="button" className="btn-primary" onClick={() => onNavigate('platform-settings')}>
          Open Platform Auth
        </button>
      </div>

      <div className="auth-form-block">
        <h3>Environment variables</h3>
        <ul className="works-list">
          <li><code>DOWNLOAD_BASE_PATH</code> — where files are saved</li>
          <li><code>DOWNLOAD_CONNECTIONS</code> / <code>DOWNLOAD_MAX_CONNECTIONS</code></li>
          <li><code>PUBLIC_MEDIA_ONLY</code> — disable for private platform auth</li>
          <li><code>GEMINI_API_KEY</code> / <code>AI_RENAME</code> — AI file naming</li>
          <li><code>MAX_CONCURRENT_DOWNLOADS</code> — worker parallelism</li>
        </ul>
      </div>
    </section>
  );
}

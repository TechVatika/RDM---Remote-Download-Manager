import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { confirmAction, toastError, toastSuccess } from '../utils/swal.js';
import SectionEyebrow from './SectionEyebrow.jsx';

const METHOD_LABELS = {
  browser: 'Browser on server',
  session: 'Session tokens',
  credentials: 'Username & password',
  upload: 'cookies.txt upload',
  none: 'None',
  public: 'Public-only mode',
  env: 'Environment file',
};

export default function PlatformSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [authMethod, setAuthMethod] = useState('none');
  const [authBrowser, setAuthBrowser] = useState('chrome');
  const [authBrowserProfile, setAuthBrowserProfile] = useState('');
  const [igSessionid, setIgSessionid] = useState('');
  const [igDsUserId, setIgDsUserId] = useState('');
  const [igCsrf, setIgCsrf] = useState('');
  const [fbCUser, setFbCUser] = useState('');
  const [fbXs, setFbXs] = useState('');
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [savingAuth, setSavingAuth] = useState(false);
  const [cookieUploading, setCookieUploading] = useState(false);
  const [adultProxyUrl, setAdultProxyUrl] = useState('');
  const [adultProxyEnabled, setAdultProxyEnabled] = useState(false);
  const [adultProxyMode, setAdultProxyMode] = useState('warp');
  const [savingProxy, setSavingProxy] = useState(false);
  const [connectingWarp, setConnectingWarp] = useState(false);

  const applyStatus = useCallback((data) => {
    setStatus(data);
    if (data.method) setAuthMethod(data.method);
    if (data.browser) setAuthBrowser(data.browser);
    if (data.browserProfile) setAuthBrowserProfile(data.browserProfile);
    if (data.credentialsUsername) setCredUser(data.credentialsUsername);
    if (data.adultProxy) {
      setAdultProxyEnabled(Boolean(data.adultProxy.enabled));
      setAdultProxyMode(data.adultProxy.uiMode || data.adultProxy.mode || 'warp');
      if (data.adultProxy.uiProxy && !data.adultProxy.envLocked) {
        setAdultProxyUrl(data.adultProxy.uiProxy || '');
      }
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/settings/auth');
      if (res.ok) applyStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSaveAuth = async () => {
    setSavingAuth(true);
    setMessage('');
    try {
      const body = {
        method: authMethod,
        browser: authBrowser,
        browserProfile: authBrowserProfile || null,
        instagram: {
          sessionid: igSessionid,
          ds_user_id: igDsUserId,
          csrftoken: igCsrf,
        },
        facebook: { c_user: fbCUser, xs: fbXs },
        credentials: {
          username: credUser,
          ...(credPass ? { password: credPass } : {}),
        },
      };
      const res = await apiFetch('/api/settings/auth', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      applyStatus(data);
      setCredPass('');
      setMessage('Authentication settings saved.');
      toastSuccess('Platform auth saved');
    } catch (err) {
      setMessage(err.message);
      toastError(err.message);
    } finally {
      setSavingAuth(false);
    }
  };

  const handleClearAuth = async () => {
    const ok = await confirmAction({
      title: 'Clear platform authentication?',
      text: 'Private Instagram/Facebook downloads will stop working until you configure auth again.',
      confirmText: 'Clear',
      icon: 'warning',
    });
    if (!ok) return;

    setMessage('');
    try {
      const res = await apiFetch('/api/settings/auth', { method: 'DELETE' });
      const data = await res.json();
      applyStatus(data);
      setAuthMethod('none');
      setIgSessionid('');
      setIgDsUserId('');
      setIgCsrf('');
      setFbCUser('');
      setFbXs('');
      setCredUser('');
      setCredPass('');
      setMessage('Authentication cleared.');
      toastSuccess('Authentication cleared');
    } catch (err) {
      setMessage(err.message);
      toastError(err.message);
    }
  };

  const handleSaveAdultProxy = async () => {
    setSavingProxy(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/settings/adult-proxy', {
        method: 'POST',
        body: JSON.stringify({
          proxy: adultProxyUrl.trim(),
          enabled: adultProxyEnabled,
          mode: adultProxyMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      await loadStatus();
      setMessage('Adult-site proxy saved.');
      toastSuccess('Adult-site VPN/proxy enabled');
    } catch (err) {
      setMessage(err.message);
      toastError(err.message);
    } finally {
      setSavingProxy(false);
    }
  };

  const handleConnectWarp = async () => {
    setConnectingWarp(true);
    setMessage('');
    try {
      const res = await apiFetch('/api/settings/adult-proxy/warp-connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'WARP connect failed');
      await loadStatus();
      setMessage('WARP test OK — turned off again (only runs during adult downloads).');
      toastSuccess('WARP test passed');
    } catch (err) {
      setMessage(err.message);
      toastError(err.message);
    } finally {
      setConnectingWarp(false);
    }
  };

  const handleClearAdultProxy = async () => {
    const ok = await confirmAction({
      title: 'Disable adult-site proxy?',
      text: 'Pornhub/XVideos downloads will use the server IP again.',
      confirmText: 'Disable',
      icon: 'question',
    });
    if (!ok) return;
    try {
      const res = await apiFetch('/api/settings/adult-proxy', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await loadStatus();
      setAdultProxyUrl('');
      setAdultProxyEnabled(false);
      toastSuccess('Adult-site proxy disabled');
    } catch (err) {
      toastError(err.message);
    }
  };

  const handleCookieUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCookieUploading(true);
    setMessage('');
    try {
      const content = await file.text();
      const res = await apiFetch('/api/settings/cookies', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      applyStatus(data);
      setAuthMethod('upload');
      setMessage('Cookies uploaded.');
      toastSuccess('Cookies uploaded');
    } catch (err) {
      setMessage(err.message);
      toastError(err.message);
    } finally {
      setCookieUploading(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return (
      <section className="panel settings-panel">
        <SectionEyebrow title="PLATFORM AUTHENTICATION" tint="periwinkle" />
        <div className="panel-body">
          <p className="settings-desc">Loading platform settings…</p>
        </div>
      </section>
    );
  }

  const publicOnly = status?.publicMediaOnly !== false;
  const active = status?.configured && !publicOnly;

  return (
    <section className="panel settings-panel platform-settings-panel">
      <SectionEyebrow title="PLATFORM AUTHENTICATION" tint="periwinkle" />
      <div className="panel-body">
      <p className="settings-desc">
        Configure how RDM authenticates with Instagram, Facebook, and other cookie-gated sites.
        Most methods do not require a cookies.txt file.
      </p>

      {publicOnly && (
        <div className="platform-note platform-settings-banner">
          <h4>Public-only mode is enabled</h4>
          <p>
            Auth settings can be saved here but will not be used until you set{' '}
            <code>PUBLIC_MEDIA_ONLY=false</code> in <code>backend/.env</code> and restart the backend.
          </p>
        </div>
      )}

      <div className="cookie-status-card">
        <div className="cookie-status-row">
          <span>Status</span>
          <strong className={active ? 'text-ok' : publicOnly && status?.configured ? 'text-warn' : status?.configured ? 'text-ok' : 'text-warn'}>
            {publicOnly && status?.configured
              ? 'Saved (inactive — public-only mode)'
              : status?.configured
                ? 'Active'
                : 'Not configured'}
          </strong>
        </div>
        {status?.configured && (
          <>
            <div className="cookie-status-row">
              <span>Method</span>
              <strong>{METHOD_LABELS[status.method] || status.method}</strong>
            </div>
            <div className="cookie-badges">
              <span className={`domain-badge ${status.hasInstagram ? 'ok' : 'missing'}`}>
                Instagram {status.hasInstagram ? '✓' : '✗'}
              </span>
              <span className={`domain-badge ${status.hasFacebook ? 'ok' : 'missing'}`}>
                Facebook {status.hasFacebook ? '✓' : '✗'}
              </span>
            </div>
            {status.file?.updatedAt && (
              <div className="cookie-status-row">
                <span>Cookies file updated</span>
                <strong>{new Date(status.file.updatedAt).toLocaleString()}</strong>
              </div>
            )}
          </>
        )}
      </div>

      {status?.adultProxy && (
        <div className="auth-form-block adult-proxy-block">
          <h3>Adult sites — Cloudflare WARP</h3>
          <p className="block-help">
            WARP turns <strong>on</strong> only while an adult-site download is running, then turns{' '}
            <strong>off</strong> automatically. YouTube, Instagram, and direct HTTP files never use
            WARP.
          </p>
          {status.adultProxy.envLocked ? (
            <p className="settings-ok">
              Active via backend/.env (
              {status.adultProxy.envWarpLocked ? 'ADULT_SITES_USE_WARP' : 'ADULT_SITES_PROXY'}) →{' '}
              {status.adultProxy.proxy}
            </p>
          ) : (
            <>
              <label className="ai-toggle">
                <input
                  type="checkbox"
                  checked={adultProxyEnabled}
                  onChange={(e) => setAdultProxyEnabled(e.target.checked)}
                />
                <span>Use proxy for adult sites only</span>
              </label>

              <div className="auth-methods adult-proxy-modes">
                <label className={`auth-method-card ${adultProxyMode === 'warp' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="adultProxyMode"
                    value="warp"
                    checked={adultProxyMode === 'warp'}
                    onChange={() => setAdultProxyMode('warp')}
                  />
                  <div className="auth-method-text">
                    <strong>Cloudflare WARP (recommended)</strong>
                    <span>Local SOCKS proxy — only yt-dlp adult URLs use WARP</span>
                  </div>
                </label>
                <label className={`auth-method-card ${adultProxyMode === 'custom' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="adultProxyMode"
                    value="custom"
                    checked={adultProxyMode === 'custom'}
                    onChange={() => setAdultProxyMode('custom')}
                  />
                  <div className="auth-method-text">
                    <strong>Custom proxy</strong>
                    <span>SSH tunnel, Tor, or another SOCKS/HTTP proxy</span>
                  </div>
                </label>
              </div>

              {adultProxyMode === 'warp' ? (
                <>
                  <p className="block-help">
                    Install once: <code>sudo bash scripts/install-cloudflare-warp.sh</code>
                    <br />
                    Default proxy: <code>socks5h://127.0.0.1:40000</code>
                  </p>
                  {status.adultProxy.warp && (
                    <p className={status.adultProxy.warp.activeSessions > 0 ? 'settings-ok' : 'block-help'}>
                      WARP:{' '}
                      {status.adultProxy.warp.installed
                        ? status.adultProxy.warp.activeSessions > 0
                          ? `ON (${status.adultProxy.warp.activeSessions} adult download${status.adultProxy.warp.activeSessions === 1 ? '' : 's'})`
                          : status.adultProxy.warp.connected
                            ? 'connected but idle — will disconnect'
                            : 'OFF (connects only during adult downloads)'
                        : 'not installed'}
                    </p>
                  )}
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={connectingWarp}
                      onClick={handleConnectWarp}
                    >
                      {connectingWarp ? 'Testing…' : 'Test WARP (connect then turn off)'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="adult-proxy-url">Proxy URL</label>
                  <input
                    id="adult-proxy-url"
                    type="text"
                    placeholder="socks5h://127.0.0.1:1080"
                    value={adultProxyUrl}
                    onChange={(e) => setAdultProxyUrl(e.target.value)}
                    autoComplete="off"
                  />
                </>
              )}

              <div className="settings-actions">
                <button type="button" className="btn-primary" disabled={savingProxy} onClick={handleSaveAdultProxy}>
                  {savingProxy ? 'Saving…' : 'Save adult-site settings'}
                </button>
                {status.adultProxy.enabled && (
                  <button type="button" className="btn-secondary" onClick={handleClearAdultProxy}>
                    Disable
                  </button>
                )}
              </div>
              {status.adultProxy.enabled && (
                <p className="settings-ok">
                  Active ({status.adultProxy.mode === 'warp' ? 'WARP' : 'custom'}): {status.adultProxy.proxy}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="auth-methods">
        {(status?.methods || []).map((m) => (
          <label key={m.id} className={`auth-method-card ${authMethod === m.id ? 'selected' : ''}`}>
            <input
              type="radio"
              name="authMethod"
              value={m.id}
              checked={authMethod === m.id}
              onChange={() => setAuthMethod(m.id)}
            />
            <div className="auth-method-text">
              <strong>{m.label}</strong>
              <span>{m.description}</span>
            </div>
          </label>
        ))}
      </div>

      {authMethod === 'browser' && (
        <div className="auth-form-block">
          <h3>Use browser on this server</h3>
          <p className="block-help">
            Open Chrome/Firefox on the server, log in once (Instagram, Facebook, or pass 18+ age
            verification on adult sites). RDM reads cookies directly — no export file needed.
          </p>
          <label htmlFor="auth-browser">Browser</label>
          <select id="auth-browser" value={authBrowser} onChange={(e) => setAuthBrowser(e.target.value)}>
            {(status?.availableBrowsers || ['chrome', 'firefox', 'chromium', 'brave', 'edge']).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <label htmlFor="auth-profile">Profile (optional, e.g. Default)</label>
          <input
            id="auth-profile"
            type="text"
            placeholder="Default"
            value={authBrowserProfile}
            onChange={(e) => setAuthBrowserProfile(e.target.value)}
          />
        </div>
      )}

      {authMethod === 'session' && (
        <div className="auth-form-block">
          <h3>Paste session tokens</h3>
          <p className="block-help">
            In your browser: DevTools → Application → Cookies. Copy the values below.
          </p>
          <p className="block-sub">Instagram (instagram.com)</p>
          <label htmlFor="ig-sessionid">sessionid</label>
          <input
            id="ig-sessionid"
            type="text"
            value={igSessionid}
            onChange={(e) => setIgSessionid(e.target.value)}
            placeholder="Required for private Instagram"
          />
          <label htmlFor="ig-ds">ds_user_id (optional)</label>
          <input id="ig-ds" type="text" value={igDsUserId} onChange={(e) => setIgDsUserId(e.target.value)} />
          <label htmlFor="ig-csrf">csrftoken (optional)</label>
          <input id="ig-csrf" type="text" value={igCsrf} onChange={(e) => setIgCsrf(e.target.value)} />
          <p className="block-sub">Facebook (facebook.com)</p>
          <label htmlFor="fb-cuser">c_user</label>
          <input
            id="fb-cuser"
            type="text"
            value={fbCUser}
            onChange={(e) => setFbCUser(e.target.value)}
            placeholder="Required for private Facebook"
          />
          <label htmlFor="fb-xs">xs</label>
          <input
            id="fb-xs"
            type="text"
            value={fbXs}
            onChange={(e) => setFbXs(e.target.value)}
            placeholder="Required for private Facebook"
          />
        </div>
      )}

      {authMethod === 'credentials' && (
        <div className="auth-form-block">
          <h3>Username & password</h3>
          <p className="block-help">
            yt-dlp logs in directly. May fail with 2FA or captcha. Password is encrypted at rest.
          </p>
          <label htmlFor="cred-user">Username / email</label>
          <input
            id="cred-user"
            type="text"
            value={credUser}
            onChange={(e) => setCredUser(e.target.value)}
            autoComplete="username"
          />
          <label htmlFor="cred-pass">Password</label>
          <input
            id="cred-pass"
            type="password"
            value={credPass}
            onChange={(e) => setCredPass(e.target.value)}
            autoComplete="current-password"
            placeholder={status?.hasCredentials ? 'Leave blank to keep current' : ''}
          />
        </div>
      )}

      {authMethod === 'upload' && (
        <div className="auth-form-block">
          <h3>Upload cookies.txt</h3>
          <p className="block-help">Netscape-format cookies file export from your browser.</p>
          <label className="btn-primary file-label">
            {cookieUploading ? 'Uploading…' : 'Choose cookies.txt'}
            <input type="file" accept=".txt,text/plain" disabled={cookieUploading} onChange={handleCookieUpload} hidden />
          </label>
        </div>
      )}

      <div className="settings-actions">
        {authMethod !== 'upload' && (
          <button type="button" className="btn-primary" disabled={savingAuth} onClick={handleSaveAuth}>
            {savingAuth ? 'Saving…' : 'Save authentication'}
          </button>
        )}
        {status?.configured && (
          <button type="button" className="btn-secondary" onClick={handleClearAuth}>
            Clear all auth
          </button>
        )}
      </div>

      {message && (
        <p className={message.toLowerCase().includes('fail') || message.toLowerCase().includes('invalid') || message.toLowerCase().includes('error') ? 'form-error' : 'settings-ok'}>
          {message}
        </p>
      )}

      {status?.cookiesGuide?.steps?.length > 0 && (
        <div className="auth-form-block">
          <h3>{status.cookiesGuide.title || 'cookies.txt guide'}</h3>
          <ol className="cookie-steps">
            {status.cookiesGuide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <ul className="cookie-tips">
        <li><strong>Home server:</strong> Browser method — log in on the server once.</li>
        <li><strong>Remote setup:</strong> Session tokens — copy from DevTools on your laptop.</li>
        <li>Session tokens expire — refresh when downloads fail with &quot;login required&quot;.</li>
        <li>Never share session tokens — they grant full account access.</li>
      </ul>
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import {
  HiShieldCheck,
  HiCheckCircle,
  HiExclamationTriangle,
  HiLockClosed,
} from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import SectionEyebrow from '../components/SectionEyebrow.jsx';
import AsyncPanel from '../components/AsyncPanel.jsx';

function Protection({ ok, children }) {
  const Icon = ok ? HiCheckCircle : HiExclamationTriangle;
  return (
    <li className={`security-item ${ok ? 'is-ok' : 'is-warn'}`}>
      <Icon size={18} />
      <span>{children}</span>
    </li>
  );
}

export default function SecurityView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/system/security');
      if (!res.ok) throw new Error('Could not load security status');
      setData(await res.json());
    } catch (err) {
      setData(null);
      setError(err.message || 'Could not load security status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <AsyncPanel title="SECURITY" tint="olive" loading />;
  }

  if (error && !data) {
    return <AsyncPanel title="SECURITY" tint="olive" error={error} onRetry={load} />;
  }

  const protections = [
    { ok: true, label: 'Password login with bcrypt hashing' },
    {
      ok: Boolean(data?.jwt?.configured),
      label: data?.jwt?.configured
        ? `Strong JWT session secret (sessions expire after ${data?.jwt?.expiresIn})`
        : 'JWT secret is weak — set a long, random JWT_SECRET in backend/.env',
    },
    {
      ok: Boolean(data?.rateLimiting?.enabled),
      label: `Brute-force protection on login (${data?.rateLimiting?.login})`,
    },
    {
      ok: Boolean(data?.securityHeaders),
      label: 'Hardened headers — CSP, anti-clickjacking, MIME-sniff protection',
    },
    {
      ok: Boolean(data?.ssrfProtection?.enabled),
      label: 'SSRF firewall — refuses to fetch internal / cloud-metadata addresses',
    },
    { ok: true, label: `Platform cookies encrypted at rest (${data?.cookieEncryption})` },
  ];
  const activeCount = protections.filter((p) => p.ok).length;

  const recommendations = [];
  if (!data?.https) {
    recommendations.push('Serve RDM over HTTPS via a TLS reverse proxy (Caddy, Nginx, Traefik).');
  }
  if (!data?.cors?.restricted) {
    recommendations.push('Lock cross-origin access by setting CORS_ORIGINS in backend/.env.');
  }
  if (!data?.ssrfProtection?.strict) {
    recommendations.push('Set SSRF_STRICT=true to also block private LAN ranges (skip if you download from your LAN).');
  }
  if (!data?.publicMediaOnly) {
    recommendations.push('PUBLIC_MEDIA_ONLY is off — platform credentials/cookies are active; disable when not needed.');
  }

  return (
    <>
      <section className="security-hero">
        <div className="security-hero-icon">
          <HiShieldCheck size={30} />
        </div>
        <div className="security-hero-text">
          <h2>YOUR SERVER IS HARDENED</h2>
          <p className="settings-desc">
            {activeCount} of {protections.length} core protections active ·{' '}
            {data?.https ? 'served over HTTPS' : 'served over HTTP'}
          </p>
        </div>
        <div className={`security-score ${activeCount === protections.length ? 'is-full' : ''}`}>
          {activeCount}/{protections.length}
        </div>
      </section>

      <section className="panel">
        <SectionEyebrow
          title="ACTIVE PROTECTIONS"
          tint="lime"
          action={(
            <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
              Refresh
            </button>
          )}
        />
        <div className="panel-body">
        <ul className="security-list">
          {protections.map((p) => (
            <Protection key={p.label} ok={p.ok}>
              {p.label}
            </Protection>
          ))}
        </ul>
        </div>
      </section>

      <div className="analytics-grid">
        <section className="panel">
          <SectionEyebrow title="DOWNLOAD FIREWALL (SSRF)" tint="sky" />
          <div className="panel-body">
          <ul className="analytics-list">
            {(data?.ssrfProtection?.blocks || []).map((b) => (
              <li key={b}>
                <span className="analytics-label">Blocks</span>
                <span>{b}</span>
              </li>
            ))}
            <li>
              <span className="analytics-label">Strict LAN block</span>
              <span className={data?.ssrfProtection?.strict ? 'text-ok' : ''}>
                {data?.ssrfProtection?.strict ? 'On' : 'Off'}
              </span>
            </li>
          </ul>
          </div>
        </section>

        <section className="panel">
          <SectionEyebrow title="ACCESS CONTROL" tint="peach" />
          <div className="panel-body">
          <ul className="analytics-list">
            <li>
              <span className="analytics-label">Authentication</span>
              <span>{data?.authentication?.method}</span>
            </li>
            <li>
              <span className="analytics-label">Password hashing</span>
              <span>{data?.authentication?.passwordHashing}</span>
            </li>
            <li>
              <span className="analytics-label">Login limit</span>
              <span>{data?.rateLimiting?.login}</span>
            </li>
            <li>
              <span className="analytics-label">API limit</span>
              <span>{data?.rateLimiting?.api}</span>
            </li>
            <li>
              <span className="analytics-label">CORS</span>
              <span>
                {data?.cors?.restricted
                  ? `${data.cors.origins.length} allowed origin(s)`
                  : 'Open (proxy-only)'}
              </span>
            </li>
            <li>
              <span className="analytics-label">Transport</span>
              <span className={data?.https ? 'text-ok' : 'text-warn'}>
                {data?.https ? 'HTTPS' : 'HTTP'}
              </span>
            </li>
          </ul>
          </div>
        </section>
      </div>

      {recommendations.length > 0 && (
        <section className="panel panel-alert">
          <SectionEyebrow title="RECOMMENDED HARDENING" tint="salmon" />
          <div className="panel-body">
          <ul className="security-tips">
            {recommendations.map((r) => (
              <li key={r}>
                <HiLockClosed size={15} />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          </div>
        </section>
      )}
    </>
  );
}

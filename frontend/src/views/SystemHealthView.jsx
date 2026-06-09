import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { formatBytes } from '../utils/format.js';

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SystemHealthView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/system');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !data) {
    return (
      <section className="panel">
        <p className="settings-desc">Loading system health…</p>
      </section>
    );
  }

  const memUsed = data?.memory
    ? ((data.memory.total - data.memory.free) / data.memory.total) * 100
    : 0;

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>System status</h2>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
        <div className="cookie-status-card">
          <div className="cookie-status-row">
            <span>Overall</span>
            <strong className={data?.status === 'ok' ? 'text-ok' : 'text-warn'}>
              {data?.status === 'ok' ? 'Healthy' : 'Degraded'}
            </strong>
          </div>
          <div className="cookie-status-row">
            <span>Database</span>
            <strong className={data?.database === 'connected' ? 'text-ok' : 'text-warn'}>
              {data?.database}
            </strong>
          </div>
          <div className="cookie-status-row">
            <span>API uptime</span>
            <strong>{formatUptime(data?.uptime)}</strong>
          </div>
          <div className="cookie-status-row">
            <span>Host</span>
            <strong>{data?.hostname}</strong>
          </div>
          <div className="cookie-status-row">
            <span>Platform</span>
            <strong>{data?.platform}</strong>
          </div>
          <div className="cookie-status-row">
            <span>Memory used</span>
            <strong>{memUsed.toFixed(0)}% ({formatBytes(data?.memory?.total - data?.memory?.free)} / {formatBytes(data?.memory?.total)})</strong>
          </div>
        </div>
      </section>

      <div className="analytics-grid">
        <section className="panel">
          <h2>Download worker</h2>
          <ul className="analytics-list">
            <li><span className="analytics-label">Max concurrent</span><span>{data?.worker?.maxConcurrent}</span></li>
            <li><span className="analytics-label">Poll interval</span><span>{data?.worker?.pollMs}ms</span></li>
            <li><span className="analytics-label">Queued</span><span>{data?.worker?.queue?.queued ?? 0}</span></li>
            <li><span className="analytics-label">Downloading</span><span>{data?.worker?.queue?.downloading ?? 0}</span></li>
            <li><span className="analytics-label">Paused</span><span>{data?.worker?.queue?.paused ?? 0}</span></li>
          </ul>
        </section>

        <section className="panel">
          <h2>Engines</h2>
          <ul className="analytics-list">
            <li>
              <span className="analytics-label">yt-dlp</span>
              <span>{data?.engines?.ytdlp?.version || 'Not found'}</span>
            </li>
            <li>
              <span className="analytics-label">ffmpeg</span>
              <span className={data?.engines?.ffmpeg?.available ? 'text-ok' : 'text-warn'}>
                {data?.engines?.ffmpeg?.available ? 'Available' : 'Not installed'}
              </span>
            </li>
            <li>
              <span className="analytics-label">Public-only mode</span>
              <span>{data?.publicMediaOnly ? 'On' : 'Off'}</span>
            </li>
            <li>
              <span className="analytics-label">Platform auth</span>
              <span>{data?.platformAuth?.configured ? data.platformAuth.method : 'None'}</span>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel">
        <h2>Storage</h2>
        <div className="folder-stats-grid">
          {Object.entries(data?.storage || {}).map(([id, folder]) => (
            <div key={id} className="folder-stat-card">
              <strong>{id}</strong>
              <span>{folder.fileCount} files</span>
              <span className="folder-stat-bytes">{formatBytes(folder.totalBytes)}</span>
              <code className="folder-path">{folder.path}</code>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

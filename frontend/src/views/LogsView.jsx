import { useCallback, useEffect, useRef, useState } from 'react';
import { HiArrowPath, HiTrash, HiArrowDownTray } from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import { confirmAction, toastSuccess, toastError } from '../utils/swal.js';

const LEVELS = ['all', 'debug', 'info', 'warn', 'error'];

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function LogsView() {
  const [entries, setEntries] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [level, setLevel] = useState('all');
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '400' });
      if (level !== 'all') params.set('level', level);
      if (scope !== 'all') params.set('scope', scope);
      if (queryRef.current.trim()) params.set('q', queryRef.current.trim());
      const res = await apiFetch(`/api/system/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setScopes(data.scopes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [level, scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [auto, load]);

  const onClear = async () => {
    const ok = await confirmAction({
      title: 'Clear all logs?',
      text: 'This permanently deletes the log history on the server.',
      confirmText: 'Clear logs',
      icon: 'warning',
    });
    if (!ok) return;
    const res = await apiFetch('/api/system/logs', { method: 'DELETE' });
    if (res.ok) {
      setEntries([]);
      toastSuccess('Logs cleared');
    } else {
      toastError('Could not clear logs');
    }
  };

  const onExport = () => {
    const text = entries
      .slice()
      .reverse()
      .map(
        (e) =>
          `[${e.t}] ${e.level.toUpperCase()} [${e.proc}:${e.scope}] ${e.msg}` +
          (e.meta ? ` ${JSON.stringify(e.meta)}` : ''),
      )
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rdm-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Activity logs</h2>
        <div className="logs-actions">
          <label className="logs-auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-refresh
          </label>
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            <HiArrowPath /> Refresh
          </button>
          <button type="button" className="btn-secondary" onClick={onExport} disabled={!entries.length}>
            <HiArrowDownTray /> Export
          </button>
          <button type="button" className="btn-danger" onClick={onClear}>
            <HiTrash /> Clear
          </button>
        </div>
      </div>

      <p className="settings-desc">
        Server-side events for downloads, the 18+ queue, Cloudflare WARP on/off, and the API. Logs
        from the worker and API processes are merged here.
      </p>

      <div className="logs-filters">
        <div className="logs-filter-group">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`logs-chip ${level === l ? 'active' : ''} logs-chip-${l}`}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <select
          className="logs-select"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All sources</option>
          {scopes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="logs-search"
          placeholder="Search messages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
      </div>

      <div className="logs-console">
        {entries.length === 0 ? (
          <p className="settings-desc logs-empty">
            {loading ? 'Loading logs…' : 'No log entries match your filters yet.'}
          </p>
        ) : (
          entries.map((e, i) => (
            <div key={`${e.t}-${i}`} className={`logs-row logs-${e.level}`}>
              <span className="logs-time">{formatTime(e.t)}</span>
              <span className={`logs-level logs-level-${e.level}`}>{e.level}</span>
              <span className="logs-scope">{e.proc}:{e.scope}</span>
              <span className="logs-msg">
                {e.msg}
                {e.meta ? <span className="logs-meta"> {JSON.stringify(e.meta)}</span> : null}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

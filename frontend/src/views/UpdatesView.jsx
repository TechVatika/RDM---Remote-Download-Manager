import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiArrowPath,
  HiArrowTopRightOnSquare,
  HiArrowUpCircle,
  HiCheckCircle,
  HiCodeBracket,
  HiClock,
  HiExclamationTriangle,
} from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import { toastSuccess, toastError } from '../utils/swal.js';
import SectionEyebrow from '../components/SectionEyebrow.jsx';

const GITHUB_REPO = 'https://github.com/TechVatika/RDM---Remote-Download-Manager';

function timeAgo(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function CommitList({ commits, emptyText }) {
  if (!commits?.length) {
    return <p className="settings-desc updates-empty">{emptyText}</p>;
  }
  return (
    <ul className="updates-changelog">
      {commits.map((c) => (
        <li key={c.hash} className="updates-changelog-item">
          <div className="updates-changelog-head">
            <code className="updates-changelog-hash">{c.shortHash}</code>
            <span className="updates-changelog-date">{formatDate(c.date)}</span>
          </div>
          <p className="updates-changelog-msg">{c.message}</p>
          {c.author && <span className="updates-changelog-author">{c.author}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function UpdatesView() {
  const [status, setStatus] = useState(null);
  const [changelog, setChangelog] = useState(null);
  const [logs, setLogs] = useState([]);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateOutput, setUpdateOutput] = useState([]);
  const [updateDone, setUpdateDone] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const logEndRef = useRef(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await apiFetch('/api/updates/status');
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadChangelog = useCallback(async () => {
    const res = await apiFetch('/api/updates/changelog');
    if (res.ok) setChangelog(await res.json());
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await apiFetch('/api/updates/logs?lines=200');
    if (res.ok) {
      const data = await res.json();
      setLogs(data.lines || []);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStatus(), loadChangelog(), loadLogs()]);
  }, [loadStatus, loadChangelog, loadLogs]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const ms = status?.autoUpdate?.checkIntervalMs || 300000;
    const id = setInterval(() => {
      loadStatus();
      loadChangelog();
      loadLogs();
    }, ms);
    return () => clearInterval(id);
  }, [status?.autoUpdate?.checkIntervalMs, loadStatus, loadChangelog, loadLogs]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [updateOutput]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await apiFetch('/api/updates/check', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      await refreshAll();
      if (data.updateAvailable) {
        toastSuccess(`Update available — ${data.behindBy} commit(s) on GitHub`);
      } else {
        toastSuccess('Already up to date with GitHub');
      }
    } catch (err) {
      toastError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateOutput([]);
    setUpdateDone(null);

    try {
      const res = await apiFetch('/api/updates/run', { method: 'POST' });
      if (!res.ok || !res.body) throw new Error('Update stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === 'log' || evt.type === 'start') {
              setUpdateOutput((prev) => [...prev, evt.msg]);
            }
            if (evt.type === 'done') {
              setUpdateDone(evt.success);
              if (evt.success) {
                toastSuccess('Update complete — services restarted');
                await refreshAll();
              } else {
                toastError('Update finished with errors — see log below');
              }
            }
          } catch {
            /* ignore parse errors */
          }
        }
      }
    } catch (err) {
      toastError(err.message);
      setUpdateDone(false);
    } finally {
      setUpdating(false);
      await loadLogs();
    }
  };

  const versionCard = (label, hash, msg, date, highlight) => (
    <div className={`update-version-card ${highlight ? 'update-version-card--highlight' : ''}`}>
      <div className="update-version-label">{label}</div>
      <div className="update-version-hash">
        <HiCodeBracket size={13} aria-hidden />
        <code>{hash || '—'}</code>
      </div>
      {msg && <div className="update-version-msg">{msg}</div>}
      {date && (
        <div className="update-version-date">
          <HiClock size={12} aria-hidden />
          {formatDate(date)}
        </div>
      )}
    </div>
  );

  const repoUrl = status?.repoUrl || changelog?.repoUrl || GITHUB_REPO;
  const incoming = changelog?.incoming?.length
    ? changelog.incoming
    : status?.incomingCommits || [];

  return (
    <>
      <section className="panel panel-updates">
        <SectionEyebrow
          title="GITHUB UPDATES"
          tint="sky"
          action={(
            <div className="logs-actions updates-actions">
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary updates-github-link"
              >
                <HiArrowTopRightOnSquare size={16} />
                GitHub
              </a>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCheck}
                disabled={checking || updating}
              >
                <HiArrowPath className={checking ? 'spin' : ''} size={16} />
                {checking ? 'Checking…' : 'Check for updates'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleUpdate}
                disabled={updating || (!status?.updateAvailable && !checking)}
                title={status?.updateAvailable ? 'Pull from GitHub and restart' : 'Already up to date'}
              >
                <HiArrowUpCircle size={16} />
                {updating
                  ? 'Updating…'
                  : status?.updateAvailable
                    ? `Update now (${status.behindBy})`
                    : 'Update now'}
              </button>
            </div>
          )}
        />
        <div className="panel-body">
          <p className="settings-desc">
            Pulls from{' '}
            <a href={repoUrl} target="_blank" rel="noopener noreferrer">
              {status?.repo || 'TechVatika/RDM---Remote-Download-Manager'}
            </a>
            . The server checks GitHub automatically every{' '}
            {Math.round((status?.autoUpdate?.checkIntervalMs || 300000) / 60000)} minutes.
          </p>

          {loadingStatus && !status ? (
            <p className="settings-desc">Loading version info…</p>
          ) : (
            <>
              <div className="update-versions-row">
                {versionCard(
                  'Installed version',
                  status?.local,
                  status?.commit?.msg,
                  status?.commit?.date,
                  false,
                )}
                {status?.updateAvailable && versionCard(
                  'Latest on GitHub',
                  status?.remote,
                  status?.remoteCommit?.msg,
                  status?.remoteCommit?.date,
                  true,
                )}
              </div>

              <div className="cookie-status-card updates-meta-card">
                <div className="cookie-status-row">
                  <span>Branch</span>
                  <strong>{status?.branch || '—'}</strong>
                </div>
                <div className="cookie-status-row">
                  <span>Status</span>
                  <strong className={status?.updateAvailable ? 'text-warn' : 'text-ok'}>
                    {status?.updateAvailable
                      ? `${status.behindBy} commit(s) behind GitHub`
                      : 'Up to date with GitHub'}
                  </strong>
                </div>
                <div className="cookie-status-row">
                  <span>Last check logged</span>
                  <strong>{timeAgo(status?.lastUpdated || status?.lastLogAt)}</strong>
                </div>
                <div className="cookie-status-row">
                  <span>Auto-check</span>
                  <strong className={status?.autoUpdate?.checkEnabled ? 'text-ok' : ''}>
                    {status?.autoUpdate?.checkEnabled
                      ? `Every ${Math.round((status.autoUpdate.checkIntervalMs || 300000) / 60000)} min`
                      : 'Disabled'}
                  </strong>
                </div>
                <div className="cookie-status-row">
                  <span>Auto-apply updates</span>
                  <strong className={status?.autoUpdate?.applyEnabled ? 'text-warn' : ''}>
                    {status?.autoUpdate?.applyEnabled ? 'On (pulls automatically)' : 'Off (manual Update now)'}
                  </strong>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <SectionEyebrow title="UPDATE CHANGELOG" tint="lime" />
        <div className="panel-body">
          {status?.updateAvailable ? (
            <>
              <p className="settings-desc">
                <strong>{incoming.length || status.behindBy}</strong> commit(s) will be applied when you update:
              </p>
              <CommitList commits={incoming} emptyText="Fetching commit list…" />
            </>
          ) : (
            <>
              <p className="settings-desc">Recent commits on this server (already installed):</p>
              <CommitList
                commits={changelog?.recent || status?.recentCommits}
                emptyText="No commit history available."
              />
            </>
          )}
        </div>
      </section>

      {(updating || updateOutput.length > 0) && (
        <section className="panel">
          <SectionEyebrow
            title="LIVE UPDATE OUTPUT"
            tint="olive"
            action={
              updateDone !== null && (
                <span className={updateDone ? 'text-ok' : 'text-warn'}>
                  {updateDone ? (
                    <>
                      <HiCheckCircle /> Complete
                    </>
                  ) : (
                    <>
                      <HiExclamationTriangle /> Errors
                    </>
                  )}
                </span>
              )
            }
          />
          <div className="panel-body">
            <div className="logs-console">
              {updateOutput.map((line, i) => (
                <div key={i} className="logs-row logs-info">
                  <span className="logs-msg">{line}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <SectionEyebrow
          title="UPDATE LOG"
          tint="periwinkle"
          action={(
            <button type="button" className="btn-secondary" onClick={loadLogs}>
              <HiArrowPath size={16} />
              Refresh log
            </button>
          )}
        />
        <div className="panel-body">
          <p className="settings-desc">
            History of automatic checks, manual checks, and update runs.
          </p>
          <div className="logs-console updates-log-console">
            {logs.length === 0 ? (
              <p className="settings-desc updates-empty">No update log entries yet.</p>
            ) : (
              logs.map((line, i) => {
                const isOk =
                  /up to date|complete|Updated|success/i.test(line);
                const isWarn = /error|FAILED|fail/i.test(line);
                return (
                  <div
                    key={i}
                    className={`logs-row ${isWarn ? 'logs-error' : isOk ? 'logs-info' : 'logs-debug'}`}
                  >
                    <span className="logs-msg">{line}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </>
  );
}

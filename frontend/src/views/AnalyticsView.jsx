import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { formatBytes, formatDate } from '../utils/format.js';
import { StatCard } from '../components/EmptyState.jsx';
import {
  HiArrowDownTray,
  HiCheckCircle,
  HiExclamationCircle,
  HiServerStack,
} from 'react-icons/hi2';

export default function AnalyticsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/stats/detailed');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return (
      <section className="panel">
        <p className="settings-desc">Loading analytics…</p>
      </section>
    );
  }

  const maxActivity = Math.max(...(data.activityByDay?.map((d) => Number(d.count)) || [1]), 1);

  return (
    <>
      <div className="stats-grid">
        <StatCard label="Total jobs" value={data.summary?.total ?? 0} accent="accent-blue" icon={HiArrowDownTray} />
        <StatCard label="Completed" value={data.summary?.completed ?? 0} accent="accent-green" icon={HiCheckCircle} />
        <StatCard label="Failed" value={data.summary?.failed ?? 0} accent="accent-red" icon={HiExclamationCircle} />
        <StatCard label="Data downloaded" value={formatBytes(data.summary?.total_bytes)} accent="accent-purple" icon={HiServerStack} />
      </div>

      <section className="panel">
        <h2>Activity (14 days)</h2>
        <div className="activity-chart">
          {(data.activityByDay || []).map((day) => (
            <div key={day.day} className="activity-bar-wrap" title={`${day.day}: ${day.count} jobs`}>
              <div
                className="activity-bar"
                style={{ height: `${Math.max(8, (Number(day.count) / maxActivity) * 100)}%` }}
              />
              <span className="activity-bar-label">
                {new Date(day.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
          {!data.activityByDay?.length && (
            <p className="settings-desc">No download activity in the last 14 days.</p>
          )}
        </div>
      </section>

      <div className="analytics-grid">
        <section className="panel">
          <h2>By folder</h2>
          <ul className="analytics-list">
            {(data.byCategory || []).map((row) => (
              <li key={row.category}>
                <span className="analytics-label">{row.category}</span>
                <span>{row.count} jobs · {formatBytes(row.bytes)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>By status</h2>
          <ul className="analytics-list">
            {(data.byStatus || []).map((row) => (
              <li key={row.status}>
                <span className={`analytics-label status status-${row.status}`}>{row.status}</span>
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {data.recentCompleted?.length > 0 && (
        <section className="panel">
          <h2>Recent completions</h2>
          <ul className="analytics-list">
            {data.recentCompleted.map((item) => (
              <li key={item.id}>
                <span className="analytics-label">{item.title || item.url}</span>
                <span>{formatBytes(item.file_size)} · {formatDate(item.completed_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import {
  HiArrowDownTray,
  HiArrowPath,
  HiCheckCircle,
  HiExclamationCircle,
  HiServerStack,
} from 'react-icons/hi2';
import { apiFetch } from '../api/client.js';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatPercent,
} from '../utils/format.js';
import { StatCard } from '../components/EmptyState.jsx';
import SectionEyebrow from '../components/SectionEyebrow.jsx';
import AsyncPanel from '../components/AsyncPanel.jsx';
import {
  VerticalBarChart,
  HorizontalBarChart,
  DonutChart,
  HourHeatmap,
  statusColor,
  typeColor,
} from '../components/AnalyticsCharts.jsx';

function MetricRow({ label, value, hint }) {
  return (
    <li className="analytics-metric-row">
      <span className="analytics-label">{label}</span>
      <span className="analytics-metric-value">
        {value}
        {hint && <small>{hint}</small>}
      </span>
    </li>
  );
}

export default function AnalyticsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState('jobs');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/stats/detailed');
      if (!res.ok) throw new Error('Could not load analytics');
      setData(await res.json());
    } catch (err) {
      setData(null);
      setError(err.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || error) {
    return (
      <AsyncPanel
        title="DOWNLOAD ANALYTICS"
        tint="periwinkle"
        loading={loading}
        error={error}
        onRetry={load}
      />
    );
  }

  const s = data.summary || {};
  const totalJobs = Number(s.total) || 0;

  const statusSegments = (data.byStatus || []).map((row) => ({
    label: row.status,
    value: Number(row.count),
    color: statusColor(row.status),
  }));

  const typeSegments = (data.byType || []).map((row) => ({
    label: row.type === 'media' ? 'Media (yt-dlp)' : 'Direct HTTP',
    value: Number(row.count),
    color: typeColor(row.type),
  }));

  const categoryBars = (data.byCategory || []).map((row) => ({
    label: row.category,
    value: Number(row.bytes) || Number(row.count),
    color: 'var(--tint-olive)',
    displayBytes: Number(row.bytes),
    count: Number(row.count),
  }));

  const platformBars = (data.byPlatform || []).map((row) => ({
    label: row.label,
    value: Number(row.count),
    color: 'var(--dell-red)',
    sub: `${row.completed} ok · ${formatBytes(row.bytes)}`,
  }));

  return (
    <div className="analytics-dashboard">
      <section className="panel analytics-panel">
        <SectionEyebrow
          title="DOWNLOAD ANALYTICS"
          tint="periwinkle"
          action={(
            <button type="button" className="btn-secondary btn-sm" onClick={load}>
              <HiArrowPath size={16} />
              Refresh
            </button>
          )}
        />
        <div className="panel-body">
          <p className="analytics-updated">
            Snapshot as of {formatDate(data.generatedAt)}
          </p>
          <div className="stats-grid analytics-summary-grid">
            <StatCard label="Total jobs" value={s.total ?? 0} accent="accent-blue" icon={HiArrowDownTray} />
            <StatCard label="Completed" value={s.completed ?? 0} accent="accent-green" icon={HiCheckCircle} />
            <StatCard label="Failed" value={s.failed ?? 0} accent="accent-red" icon={HiExclamationCircle} />
            <StatCard label="Data downloaded" value={formatBytes(s.total_bytes)} accent="accent-purple" icon={HiServerStack} />
          </div>
          <div className="analytics-kpi-strip">
            <div className="analytics-kpi">
              <span className="analytics-kpi-label">Success rate</span>
              <strong>{formatPercent(s.success_rate)}</strong>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-label">Active now</span>
              <strong>{s.active ?? 0}</strong>
              <small>{s.downloading ?? 0} downloading · {s.queued ?? 0} queued</small>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-label">Avg file size</span>
              <strong>{formatBytes(s.avg_file_size)}</strong>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-label">Avg completion time</span>
              <strong>{formatDuration(s.avg_duration_sec)}</strong>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-label">Largest file</span>
              <strong>{formatBytes(s.largest_file)}</strong>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-label">In progress bytes</span>
              <strong>{formatBytes(s.bytes_in_progress)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel analytics-panel">
        <SectionEyebrow title="14-DAY TREND" tint="sky" />
        <div className="panel-body">
          <div className="analytics-chart-tabs">
            <button
              type="button"
              className={`analytics-chart-tab ${chartMode === 'jobs' ? 'active' : ''}`}
              onClick={() => setChartMode('jobs')}
            >
              Jobs queued
            </button>
            <button
              type="button"
              className={`analytics-chart-tab ${chartMode === 'bytes' ? 'active' : ''}`}
              onClick={() => setChartMode('bytes')}
            >
              Data completed
            </button>
          </div>
          {chartMode === 'jobs' ? (
            <VerticalBarChart
              data={data.activityByDay || []}
              valueKey="count"
              accent="var(--dell-red)"
            />
          ) : (
            <VerticalBarChart
              data={data.volumeByDay || []}
              valueKey="bytes"
              formatValue={formatBytes}
              accent="var(--tint-periwinkle)"
            />
          )}
          <p className="analytics-chart-footnote">
            {chartMode === 'jobs'
              ? 'New download jobs created per day (last 14 days).'
              : 'Completed download volume per day (last 14 days).'}
          </p>
        </div>
      </section>

      <div className="analytics-grid analytics-grid--wide">
        <section className="panel analytics-panel">
          <SectionEyebrow title="BY STATUS" tint="lime" />
          <div className="panel-body">
            <DonutChart
              segments={statusSegments}
              centerLabel={totalJobs}
              centerSub="total"
            />
          </div>
        </section>

        <section className="panel analytics-panel">
          <SectionEyebrow title="BY ENGINE" tint="peach" />
          <div className="panel-body">
            <DonutChart
              segments={typeSegments}
              centerLabel={formatBytes(
                (data.byType || []).reduce((sum, r) => sum + Number(r.bytes || 0), 0),
              )}
              centerSub="completed"
            />
            <ul className="analytics-detail-list">
              {(data.byType || []).map((row) => (
                <li key={row.type}>
                  <span className="analytics-label">{row.type === 'media' ? 'yt-dlp' : 'HTTP'}</span>
                  <span>{row.count} jobs · {row.completed} done · {formatBytes(row.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="panel analytics-panel">
        <SectionEyebrow title="BUSY HOURS (7 DAYS)" tint="salmon" />
        <div className="panel-body">
          <p className="analytics-chart-footnote">When you queue downloads — server local time (0–23h).</p>
          <HourHeatmap hours={data.byHour || []} />
        </div>
      </section>

      <div className="analytics-grid">
        <section className="panel analytics-panel">
          <SectionEyebrow title="STORAGE BY FOLDER" tint="sage" />
          <div className="panel-body">
            <HorizontalBarChart
              items={categoryBars.map((c) => ({
                label: c.label,
                value: c.value,
                color: c.color,
                barClass: 'analytics-bar-category',
              }))}
              formatValue={(v) => formatBytes(v)}
            />
            <ul className="analytics-detail-list">
              {(data.byCategory || []).map((row) => (
                <li key={row.category}>
                  <span className="analytics-label">{row.category}</span>
                  <span>
                    {row.count} jobs · {row.completed} done · {row.failed} failed · {formatBytes(row.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel analytics-panel">
          <SectionEyebrow title="TOP SOURCES" tint="sky" />
          <div className="panel-body">
            <HorizontalBarChart
              items={platformBars}
              formatValue={(v) => `${v} jobs`}
            />
          </div>
        </section>
      </div>

      {(data.byMediaKind?.length > 0) && (
        <section className="panel analytics-panel">
          <SectionEyebrow title="MEDIA BREAKDOWN" tint="periwinkle" />
          <div className="panel-body">
            <ul className="analytics-detail-list">
              {data.byMediaKind.map((row) => (
                <li key={row.media_kind}>
                  <span className="analytics-label">{row.media_kind}</span>
                  <span>{row.count} jobs · {formatBytes(row.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="panel analytics-panel">
        <SectionEyebrow title="PERFORMANCE & SETTINGS" tint="steel" />
        <div className="panel-body">
          <ul className="analytics-metrics-grid">
            <MetricRow label="Cancelled" value={s.cancelled ?? 0} />
            <MetricRow label="Paused" value={s.paused ?? 0} />
            <MetricRow label="Failure rate" value={formatPercent(s.failure_rate)} />
            <MetricRow label="Avg HTTP connections" value={Number(s.avg_connections || 0).toFixed(1)} hint="parallel segments" />
            <MetricRow label="AI rename jobs" value={s.ai_rename_jobs ?? 0} />
            <MetricRow label="Needed auth" value={s.needs_auth_jobs ?? 0} />
          </ul>
        </div>
      </section>

      <div className="analytics-grid">
        <section className="panel analytics-panel">
          <SectionEyebrow title="LARGEST FILES" tint="olive" />
          <div className="panel-body">
            {(data.largestFiles?.length > 0) ? (
              <ul className="analytics-table-list">
                {data.largestFiles.map((item, i) => (
                  <li key={item.id} className="analytics-table-row">
                    <span className="analytics-rank">#{i + 1}</span>
                    <span className="analytics-table-main">
                      <strong>{item.title || item.filename || 'Download'}</strong>
                      <small>{item.category} · {item.type}</small>
                    </span>
                    <span className="analytics-table-meta">{formatBytes(item.file_size)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings-desc">No completed files yet.</p>
            )}
          </div>
        </section>

        <section className="panel analytics-panel">
          <SectionEyebrow title="TOP ERRORS" tint="salmon" />
          <div className="panel-body">
            {(data.topErrors?.length > 0) ? (
              <ul className="analytics-error-list">
                {data.topErrors.map((row, i) => (
                  <li key={i} className="analytics-error-row">
                    <span className="analytics-error-count">{row.count}×</span>
                    <span className="analytics-error-msg">{row.error_message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings-desc">No failed downloads — nice!</p>
            )}
          </div>
        </section>
      </div>

      <div className="analytics-grid">
        <section className="panel analytics-panel">
          <SectionEyebrow title="RECENT COMPLETIONS" tint="peach" />
          <div className="panel-body">
            {(data.recentCompleted?.length > 0) ? (
              <ul className="analytics-table-list">
                {data.recentCompleted.map((item) => (
                  <li key={item.id} className="analytics-table-row">
                    <span className="analytics-table-icon"><HiCheckCircle size={16} /></span>
                    <span className="analytics-table-main">
                      <strong>{item.title || item.filename || item.url}</strong>
                      <small>{item.category} · {item.type}{item.media_kind ? ` · ${item.media_kind}` : ''}</small>
                    </span>
                    <span className="analytics-table-meta">
                      {formatBytes(item.file_size)}
                      <small>{formatDate(item.completed_at)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings-desc">No completions yet.</p>
            )}
          </div>
        </section>

        <section className="panel analytics-panel">
          <SectionEyebrow title="RECENT FAILURES" tint="salmon" />
          <div className="panel-body">
            {(data.recentFailed?.length > 0) ? (
              <ul className="analytics-table-list">
                {data.recentFailed.map((item) => (
                  <li key={item.id} className="analytics-table-row analytics-table-row--fail">
                    <span className="analytics-table-icon"><HiExclamationCircle size={16} /></span>
                    <span className="analytics-table-main">
                      <strong>{item.title || item.url}</strong>
                      <small className="analytics-error-msg">{item.error_message || 'Unknown error'}</small>
                    </span>
                    <span className="analytics-table-meta">
                      <small>{formatDate(item.updated_at)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="settings-desc">No recent failures.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

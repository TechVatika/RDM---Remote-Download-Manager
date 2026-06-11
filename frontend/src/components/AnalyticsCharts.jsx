import { formatBytes, shortDayLabel } from '../utils/format.js';

const STATUS_COLORS = {
  completed: 'var(--tint-lime)',
  failed: 'var(--tint-salmon)',
  cancelled: 'var(--tint-steel)',
  downloading: 'var(--tint-sky)',
  queued: 'var(--dell-yellow)',
  paused: 'var(--tint-peach)',
};

const TYPE_COLORS = {
  http: 'var(--tint-sky)',
  media: 'var(--tint-periwinkle)',
};

export function VerticalBarChart({ data, valueKey = 'count', labelKey = 'day', formatValue, accent = 'var(--dell-red)' }) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div className="analytics-vchart" role="img" aria-label="Bar chart">
      {data.map((row) => {
        const val = Number(row[valueKey]) || 0;
        const pct = Math.max(4, (val / max) * 100);
        return (
          <div key={row[labelKey]} className="analytics-vchart-col" title={`${row[labelKey]}: ${formatValue ? formatValue(val) : val}`}>
            <span className="analytics-vchart-value">{formatValue ? formatValue(val) : val}</span>
            <div className="analytics-vchart-bar-track">
              <div
                className="analytics-vchart-bar"
                style={{ height: `${pct}%`, background: accent }}
              />
            </div>
            <span className="analytics-vchart-label">{shortDayLabel(row[labelKey])}</span>
          </div>
        );
      })}
    </div>
  );
}

export function HorizontalBarChart({ items, maxValue, formatValue = (v) => v, barClass = '' }) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="analytics-hchart">
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <li key={item.label} className="analytics-hchart-row">
            <span className="analytics-hchart-label">{item.label}</span>
            <div className="analytics-hchart-track">
              <div
                className={`analytics-hchart-bar ${barClass} ${item.barClass || ''}`.trim()}
                style={{ width: `${Math.max(pct, item.value > 0 ? 2 : 0)}%`, background: item.color }}
              />
            </div>
            <span className="analytics-hchart-value">{formatValue(item.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function DonutChart({ segments, centerLabel, centerSub }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let gradientParts = [];
  let cursor = 0;

  for (const seg of segments) {
    const pct = (seg.value / total) * 100;
    const next = cursor + pct;
    gradientParts.push(`${seg.color} ${cursor}% ${next}%`);
    cursor = next;
  }

  if (segments.every((s) => s.value === 0)) {
    gradientParts = ['var(--tint-steel) 0% 100%'];
  }

  return (
    <div className="analytics-donut-wrap">
      <div
        className="analytics-donut"
        style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
        role="img"
        aria-label="Distribution chart"
      >
        <div className="analytics-donut-hole">
          {centerLabel && <strong>{centerLabel}</strong>}
          {centerSub && <span>{centerSub}</span>}
        </div>
      </div>
      <ul className="analytics-donut-legend">
        {segments.map((seg) => (
          <li key={seg.label}>
            <span className="analytics-legend-swatch" style={{ background: seg.color }} />
            <span className="analytics-legend-label">{seg.label}</span>
            <span className="analytics-legend-value">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function statusColor(status) {
  return STATUS_COLORS[status] || 'var(--tint-steel)';
}

export function typeColor(type) {
  return TYPE_COLORS[type] || 'var(--tint-sage)';
}

export function HourHeatmap({ hours }) {
  const max = Math.max(...hours.map((h) => h.count), 1);

  return (
    <div className="analytics-heatmap" role="img" aria-label="Downloads by hour">
      {hours.map(({ hour, count }) => {
        const intensity = count / max;
        return (
          <div
            key={hour}
            className="analytics-heatmap-cell"
            title={`${hour}:00 – ${count} job(s)`}
            style={{
              background: intensity > 0
                ? `color-mix(in srgb, var(--dell-red) ${Math.round(20 + intensity * 80)}%, var(--dell-canvas))`
                : 'var(--tint-steel)',
            }}
          >
            <span className="analytics-heatmap-hour">{hour}</span>
            {count > 0 && <span className="analytics-heatmap-count">{count}</span>}
          </div>
        );
      })}
    </div>
  );
}

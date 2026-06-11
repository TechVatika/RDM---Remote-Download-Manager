import { formatBytes, formatDate, statusClass } from '../utils/format.js';
import { downloadDisplayName } from '../utils/downloadDisplay.js';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';
import SectionEyebrow from '../components/SectionEyebrow.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { categoryRibbonTint } from '../utils/categoryTint.js';

export default function ActivityView({ downloads, onNavigate }) {
  const feed = [...downloads]
    .filter((d) => Number(d.private) !== 1)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 50);

  const completed = feed.filter((d) => d.status === 'completed').length;
  const active = feed.filter((d) => ['queued', 'downloading', 'paused'].includes(d.status)).length;

  return (
    <section className="panel panel-activity">
      <SectionEyebrow
        title="ACTIVITY FEED"
        tint="steel"
        action={(
          <button type="button" className="btn-link" onClick={() => onNavigate('history')}>
            Full history
          </button>
        )}
      />
      <div className="panel-body">
        <div className="activity-summary">
          <span><strong>{feed.length}</strong> events shown</span>
          <span><strong>{active}</strong> active</span>
          <span><strong>{completed}</strong> completed</span>
        </div>

        {feed.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Queue a download — events appear here as jobs start, pause, complete, or fail."
            actionLabel="New download"
            onAction={() => onNavigate('new')}
          />
        ) : (
          <ul className="activity-feed">
          {feed.map((item) => {
            const bytesDone = Number(item.bytes_downloaded) || 0;
            const bytesTotal = Number(item.file_size) || 0;
            const progress = Number(item.progress) || 0;
            return (
              <li
                key={item.id}
                className={`activity-item ribbon-tint-${categoryRibbonTint(item.category)}`}
              >
                <span className="activity-time">{formatDate(item.updated_at || item.created_at)}</span>
                <PlatformIcon name={detectPlatformFromUrl(item.url)} size={20} />
                <div className="activity-body">
                  <strong>{downloadDisplayName(item)}</strong>
                  <span className="activity-meta">
                    #{item.id}
                    {' · '}
                    {item.category || 'general'}
                    {item.type === 'http' && item.connections ? ` · ${item.connections}× HTTP` : ''}
                    {item.type === 'media' ? ' · Media' : ''}
                  </span>
                  {(bytesTotal > 0 || bytesDone > 0) && (
                    <span className="activity-size">
                      {formatBytes(bytesDone)}
                      {bytesTotal > 0 ? ` / ${formatBytes(bytesTotal)}` : ''}
                      {progress > 0 && progress < 100 ? ` · ${progress.toFixed(1)}%` : ''}
                    </span>
                  )}
                  {item.completed_at && item.status === 'completed' && (
                    <span className="activity-size">Finished {formatDate(item.completed_at)}</span>
                  )}
                  {item.error_message && ['failed', 'cancelled', 'paused'].includes(item.status) && (
                    <span className="activity-error">{item.error_message}</span>
                  )}
                </div>
                <span className={statusClass(item.status)}>{item.status}</span>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </section>
  );
}

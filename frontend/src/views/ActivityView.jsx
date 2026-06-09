import { formatBytes, formatDate, statusClass } from '../utils/format.js';
import { downloadDisplayName } from '../utils/downloadDisplay.js';
import PlatformIcon from '../components/PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';

export default function ActivityView({ downloads, onNavigate }) {
  const feed = [...downloads]
    .filter((d) => Number(d.private) !== 1)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 40);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Activity Feed</h2>
        <button type="button" className="btn-link" onClick={() => onNavigate('history')}>
          Full history
        </button>
      </div>
      <p className="settings-desc">Recent download events across your queue — newest first.</p>

      {feed.length === 0 ? (
        <p className="settings-desc">No activity yet. Queue your first download!</p>
      ) : (
        <ul className="activity-feed">
          {feed.map((item) => (
            <li key={item.id} className="activity-item">
              <span className="activity-time">{formatDate(item.updated_at || item.created_at)}</span>
              <PlatformIcon name={detectPlatformFromUrl(item.url)} size={20} />
              <div className="activity-body">
                <strong>{downloadDisplayName(item)}</strong>
                <span>
                  #{item.id} · {item.category}
                  {item.file_size ? ` · ${formatBytes(item.file_size)}` : ''}
                </span>
              </div>
              <span className={statusClass(item.status)}>{item.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

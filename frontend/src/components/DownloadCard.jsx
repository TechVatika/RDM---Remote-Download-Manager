import { HiLockClosed } from 'react-icons/hi2';
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDate,
  statusClass,
} from '../utils/format.js';
import { downloadDisplayName } from '../utils/downloadDisplay.js';
import PlatformIcon from './PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';

export default function DownloadCard({
  item,
  showActions = true,
  speed = 0,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  onCopyPath,
  onCopyUrl,
  onProvideCredentials,
}) {
  const platformName = detectPlatformFromUrl(item.url);
  const isActive = ['queued', 'downloading', 'paused'].includes(item.status);
  const needsAuth = item.status === 'failed' && Boolean(Number(item.needs_auth));
  const displayName = downloadDisplayName(item);

  return (
    <li className="download-item">
      <div className="download-item-top">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="download-thumb" />
        ) : (
          <PlatformIcon name={platformName} size={22} />
        )}
        <div className="download-item-main">
          <div className="download-meta">
            <span className={statusClass(item.status)}>{item.status}</span>
            <span className="download-id">#{item.id}</span>
            {Number(item.private) === 1 && (
              <span className="type-tag private-tag" title="Private — not saved in history, no AI naming">
                <HiLockClosed size={11} /> Private
              </span>
            )}
            {item.category && <span className="type-tag cat-tag">{item.category}</span>}
            {item.type === 'media' && <span className="type-tag">Media</span>}
            {item.type === 'http' && item.connections && (
              <span className="type-tag">{item.connections}× HTTP</span>
            )}
          </div>
          <p className="download-filename" title={displayName}>
            {displayName}
            {item.media_kind && (
              <span className="kind-tag">{item.media_kind === 'audio' ? 'MP3' : 'MP4'}</span>
            )}
          </p>
          {item.url && (
            <button type="button" className="btn-link btn-copy-url" onClick={() => onCopyUrl?.(item.url)}>
              Copy URL
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Number(item.progress) || 0}%` }}
            />
          </div>
          <div className="download-stats">
            <span>{Number(item.progress).toFixed(1)}%</span>
            <span>{formatBytes(item.bytes_downloaded)} / {formatBytes(item.file_size)}</span>
            {item.status === 'downloading' && (
              <>
                <span>{formatSpeed(speed)}</span>
                <span>
                  ETA {formatEta(
                    (Number(item.file_size) || 0) - (Number(item.bytes_downloaded) || 0),
                    speed,
                  )}
                </span>
              </>
            )}
          </div>
        </>
      )}

      {item.file_path && (
        <div className="path-row">
          <p className="download-path">{item.file_path}</p>
          {item.status === 'completed' && (
            <button type="button" className="btn-link" onClick={() => onCopyPath(item.file_path)}>
              Copy path
            </button>
          )}
        </div>
      )}

      {item.error_message && !needsAuth && (
        <p className="download-error">{item.error_message}</p>
      )}

      {needsAuth && (
        <div className="download-auth-note">
          <HiLockClosed size={16} />
          <span>This download needs a login. Add a username &amp; password to continue.</span>
        </div>
      )}

      {item.status === 'completed' && (
        <div className="download-stats">
          <span>{formatBytes(item.file_size)}</span>
          <span>{formatDate(item.completed_at)}</span>
        </div>
      )}

      {showActions && (
        <div className="item-actions">
          {item.status === 'downloading' && item.type !== 'media' && (
            <button type="button" className="btn-secondary" onClick={() => onPause(item.id)}>
              Pause
            </button>
          )}
          {item.status === 'paused' && (
            <button type="button" className="btn-secondary" onClick={() => onResume(item.id)}>
              Resume
            </button>
          )}
          {isActive && (
            <button type="button" className="btn-secondary" onClick={() => onCancel(item.id)}>
              Cancel
            </button>
          )}
          {needsAuth && (
            <button
              type="button"
              className="btn-primary btn-auth"
              onClick={() => onProvideCredentials?.(item)}
            >
              <HiLockClosed size={15} />
              Sign in &amp; retry
            </button>
          )}
          {!needsAuth && ['failed', 'cancelled'].includes(item.status) && (
            <button type="button" className="btn-secondary" onClick={() => onRetry(item.id)}>
              Retry
            </button>
          )}
          {['completed', 'failed', 'cancelled'].includes(item.status) && (
            <button type="button" className="btn-danger" onClick={() => onDelete(item.id)}>
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  );
}

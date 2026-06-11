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
import { categoryRibbonTint } from '../utils/categoryTint.js';

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-cell">
      <span className="detail-label">{label}</span>
      <strong className="detail-value">{value}</strong>
    </div>
  );
}

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
  const canResume = Boolean(item.can_resume);
  const hasPartial =
    canResume ||
    (Number(item.bytes_downloaded) > 0 && Number(item.progress) > 0 && Number(item.progress) < 100);
  const displayName = downloadDisplayName(item);
  const bytesDone = Number(item.bytes_downloaded) || 0;
  const bytesTotal = Number(item.file_size) || 0;
  const progressPct = Number(item.progress) || 0;
  const ribbonTint = categoryRibbonTint(item.category);
  const isFresh =
    item.status === 'queued' &&
    item.created_at &&
    Date.now() - new Date(item.created_at).getTime() < 15 * 60 * 1000;

  return (
    <li className={`download-item ribbon-tint-${ribbonTint}`}>
      {isFresh && <span className="dell-new-sticker" aria-hidden>NEW!</span>}
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

      {(isActive || hasPartial) && (
        <>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="download-stats">
            <span>{progressPct.toFixed(1)}%</span>
            <span>
              {formatBytes(bytesDone)}
              {bytesTotal > 0 ? ` / ${formatBytes(bytesTotal)}` : ''}
            </span>
            {item.status === 'downloading' && (
              <>
                <span>{formatSpeed(speed)}</span>
                <span>
                  ETA {formatEta(bytesTotal - bytesDone, speed)}
                </span>
              </>
            )}
            {item.status === 'queued' && bytesTotal > 0 && (
              <span className="stat-muted">Waiting for worker…</span>
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
        <p
          className={
            ['queued', 'downloading'].includes(item.status)
              ? 'download-info'
              : 'download-error'
          }
        >
          {item.error_message}
        </p>
      )}

      {needsAuth && (
        <div className="download-auth-note">
          <HiLockClosed size={16} />
          <span>This download needs a login. Add a username &amp; password to continue.</span>
        </div>
      )}

      {item.status === 'completed' && (() => {
        const created = item.created_at ? new Date(item.created_at) : null;
        const done = item.completed_at ? new Date(item.completed_at) : null;
        const durMs = created && done ? done - created : 0;
        const size = Number(item.file_size) || 0;
        const avg = durMs > 0 && size > 0 ? size / (durMs / 1000) : 0;
        return (
          <div className="download-details">
            <DetailRow label="Size" value={formatBytes(size)} />
            <DetailRow label="Added" value={formatDate(item.created_at)} />
            <DetailRow label="Finished" value={formatDate(item.completed_at)} />
            <DetailRow label="Duration" value={formatDuration(durMs)} />
            <DetailRow label="Avg speed" value={avg ? formatSpeed(avg) : '—'} />
            {item.connections ? <DetailRow label="Connections" value={`${item.connections}×`} /> : null}
          </div>
        );
      })()}

      {['failed', 'cancelled', 'paused'].includes(item.status) && (
        <div className="download-details">
          <DetailRow label="Added" value={formatDate(item.created_at)} />
          <DetailRow label="Last update" value={formatDate(item.updated_at)} />
          {bytesTotal > 0 && <DetailRow label="File size" value={formatBytes(bytesTotal)} />}
          {bytesDone > 0 && (
            <DetailRow
              label="Downloaded"
              value={`${formatBytes(bytesDone)} (${progressPct.toFixed(1)}%)`}
            />
          )}
          {bytesTotal > bytesDone && bytesDone > 0 && (
            <DetailRow label="Remaining" value={formatBytes(bytesTotal - bytesDone)} />
          )}
          {item.type && (
            <DetailRow label="Engine" value={item.type === 'media' ? 'yt-dlp' : 'HTTP segments'} />
          )}
          {item.connections ? <DetailRow label="Connections" value={`${item.connections}×`} /> : null}
          {canResume && (
            <DetailRow label="Resume" value="Saved progress on server — use Resume" />
          )}
        </div>
      )}

      {item.status === 'queued' && (
        <div className="download-details">
          <DetailRow label="Added" value={formatDate(item.created_at)} />
          {bytesTotal > 0 && <DetailRow label="File size" value={formatBytes(bytesTotal)} />}
          {bytesDone > 0 && <DetailRow label="Resuming from" value={formatBytes(bytesDone)} />}
          {item.connections ? <DetailRow label="Connections" value={`${item.connections}×`} /> : null}
        </div>
      )}

      {showActions && (
        <div className="item-actions">
          {item.status === 'downloading' && item.type !== 'media' && (
            <button type="button" className="btn-secondary" onClick={() => onPause(item.id)}>
              Pause
            </button>
          )}
          {(item.status === 'paused' || canResume) && (
            <button type="button" className="btn-primary" onClick={() => onResume(item.id)}>
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
          {!needsAuth && ['failed', 'cancelled'].includes(item.status) && !canResume && (
            <button type="button" className="btn-secondary" onClick={() => onRetry(item.id)}>
              Retry
            </button>
          )}
          {!needsAuth && ['failed', 'cancelled'].includes(item.status) && canResume && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onRetry?.(item.id, { fresh: true })}
            >
              Restart from scratch
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

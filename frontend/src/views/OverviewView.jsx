import {
  HiArrowDownTray,
  HiCheckCircle,
  HiExclamationCircle,
  HiServerStack,
  HiPlusCircle,
  HiChartBar,
  HiGlobeAlt,
  HiCog6Tooth,
  HiBolt,
  HiCpuChip,
} from 'react-icons/hi2';
import EmptyState, { StatCard } from '../components/EmptyState.jsx';
import { FeaturedPlatforms } from '../components/PlatformTile.jsx';
import { formatBytes, formatSpeed } from '../utils/format.js';
import { FEATURED_PLATFORMS } from '../utils/platformIcons.js';
import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';

const QUICK_LINKS = [
  { id: 'new', label: 'New Download', Icon: HiPlusCircle, accent: 'blue' },
  { id: 'bookmarks', label: 'Bookmarks', Icon: HiBolt, accent: 'orange' },
  { id: 'analytics', label: 'Analytics', Icon: HiChartBar, accent: 'green' },
  { id: 'platforms', label: 'Platforms', Icon: HiGlobeAlt, accent: 'orange' },
  { id: 'app-settings', label: 'App Settings', Icon: HiCog6Tooth, accent: 'slate' },
];

export default function OverviewView({
  user,
  summary,
  active,
  history,
  platformTotal,
  totalSpeed,
  systemStatus,
  onNavigate,
  renderDownloadItem,
}) {
  const failed = Number(summary?.failed) || 0;
  const recentHistory = history.filter((d) => Number(d.private) !== 1).slice(0, 3);
  const queued = active.filter((d) => d.status === 'queued').length;
  const downloading = active.filter((d) => d.status === 'downloading').length;

  return (
    <>
      <ServerDownloadBanner />
      <section className="welcome-banner">
        <div className="welcome-banner-text">
          <h2>Hey, {user?.displayName || user?.username} 👋</h2>
          <p>Queue downloads from any device — they run on your server even when this tab is closed.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => onNavigate('new')}>
          <HiPlusCircle size={18} />
          Start downloading
        </button>
      </section>

      {(downloading > 0 || systemStatus) && (
        <div className="overview-strip">
          {downloading > 0 && (
            <div className="overview-strip-item">
              <HiArrowDownTray size={18} />
              <span>
                <strong>{formatSpeed(totalSpeed)}</strong> aggregate · {downloading} downloading
                {queued > 0 ? ` · ${queued} queued` : ''}
              </span>
            </div>
          )}
          {systemStatus && (
            <button type="button" className="overview-strip-item overview-strip-btn" onClick={() => onNavigate('system')}>
              <HiCpuChip size={18} />
              <span>
                System <strong className={systemStatus.ok ? 'text-ok' : 'text-warn'}>{systemStatus.label}</strong>
                · yt-dlp {systemStatus.ytdlp || '—'}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          label="Active"
          value={summary?.active ?? active.length}
          accent="accent-blue"
          icon={HiArrowDownTray}
        />
        <StatCard
          label="Completed"
          value={summary?.completed ?? 0}
          accent="accent-green"
          icon={HiCheckCircle}
        />
        <StatCard
          label="Failed"
          value={failed}
          accent="accent-red"
          icon={HiExclamationCircle}
        />
        <StatCard
          label="Total Downloaded"
          value={formatBytes(summary?.total_bytes)}
          accent="accent-purple"
          icon={HiServerStack}
        />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Quick Access</h2>
        </div>
        <div className="quick-links-grid">
          {QUICK_LINKS.map(({ id, label, Icon, accent }) => (
            <button
              key={id}
              type="button"
              className={`quick-link-card accent-${accent}`}
              onClick={() => onNavigate(id)}
            >
              <span className="quick-link-icon">
                <Icon size={22} />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Active Downloads</h2>
          <button type="button" className="btn-link" onClick={() => onNavigate('active')}>
            View all ({active.length})
          </button>
        </div>
        {active.length === 0 ? (
          <EmptyState
            title="No active downloads"
            description="Paste a YouTube link, social post, or direct file URL to get started."
            actionLabel="New download"
            onAction={() => onNavigate('new')}
          />
        ) : (
          <ul className="download-list">{active.slice(0, 3).map((i) => renderDownloadItem(i))}</ul>
        )}
      </section>

      {failed > 0 && (
        <section className="panel panel-alert">
          <div className="panel-head">
            <h2>{failed} failed download{failed !== 1 ? 's' : ''}</h2>
            <button type="button" className="btn-link" onClick={() => onNavigate('history')}>
              View in history
            </button>
          </div>
          <p className="settings-desc">Retry failed jobs from History or use bulk retry there.</p>
        </section>
      )}

      {recentHistory.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Recent History</h2>
            <button type="button" className="btn-link" onClick={() => onNavigate('activity')}>
              Activity feed
            </button>
          </div>
          <ul className="download-list">{recentHistory.map((i) => renderDownloadItem(i))}</ul>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Supported Platforms</h2>
          <button type="button" className="btn-link" onClick={() => onNavigate('platforms')}>
            See all {platformTotal}+
          </button>
        </div>
        <FeaturedPlatforms platforms={FEATURED_PLATFORMS} onSelect={() => onNavigate('new')} />
        <p className="cookies-hint">
          Public links work out of the box. Private content needs Platform Auth.
        </p>
      </section>
    </>
  );
}

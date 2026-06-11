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
  HiClock,
} from 'react-icons/hi2';
import EmptyState, { StatCard } from '../components/EmptyState.jsx';
import { FeaturedPlatforms } from '../components/PlatformTile.jsx';
import { formatBytes, formatSpeed } from '../utils/format.js';
import { FEATURED_PLATFORMS } from '../utils/platformIcons.js';
import ServerDownloadBanner from '../components/ServerDownloadBanner.jsx';
import SectionEyebrow from '../components/SectionEyebrow.jsx';

const QUICK_LINKS = [
  { id: 'new', label: 'New Download', Icon: HiPlusCircle, accent: 'blue' },
  { id: 'active', label: 'Active Queue', Icon: HiArrowDownTray, accent: 'green' },
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
  const activeCount = summary?.active ?? active.length;
  const completedCount = summary?.completed ?? 0;
  const recentHistory = history.filter((d) => Number(d.private) !== 1).slice(0, 3);
  const queued = active.filter((d) => d.status === 'queued').length;
  const downloading = active.filter((d) => d.status === 'downloading').length;

  return (
    <div className="overview-dashboard">
      <section className="overview-hero">
        <ServerDownloadBanner />
        <div className="welcome-banner">
          <div className="welcome-banner-text">
            <h2>WELCOME, {(user?.displayName || user?.username || 'USER').toUpperCase()}</h2>
            <p>
              Configure it, queue it, and let your home server download it — even when this tab,
              your laptop, or your phone is offline.
            </p>
          </div>
          <button type="button" className="btn-primary welcome-cta" onClick={() => onNavigate('new')}>
            <HiPlusCircle size={18} />
            Queue download
          </button>
          <span className="dell-cert-seal" title="Server-side downloads">
            RDM
          </span>
        </div>
      </section>

      <div className="overview-strip">
        {downloading > 0 ? (
          <button
            type="button"
            className="overview-strip-item overview-strip-btn"
            onClick={() => onNavigate('active')}
          >
            <HiArrowDownTray size={18} />
            <span>
              <strong>{formatSpeed(totalSpeed)}</strong> aggregate · {downloading} downloading
              {queued > 0 ? ` · ${queued} queued` : ''}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="overview-strip-item overview-strip-btn overview-strip-btn--idle"
            onClick={() => onNavigate('new')}
          >
            <HiPlusCircle size={18} />
            <span>Queue is idle — <strong>add a download</strong></span>
          </button>
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
        <button
          type="button"
          className="overview-strip-item overview-strip-btn"
          onClick={() => onNavigate('activity')}
        >
          <HiClock size={18} />
          <span>Activity feed</span>
        </button>
      </div>

      <section className="overview-stats-section" aria-label="Download statistics">
        <div className="overview-stats-header">
          <h2 className="overview-stats-title">At a glance</h2>
          <button type="button" className="btn-link overview-stats-link" onClick={() => onNavigate('analytics')}>
            Full analytics →
          </button>
        </div>
        <div className="stats-grid overview-stats-grid">
          <StatCard
            label="Active"
            value={activeCount}
            accent="accent-blue"
            icon={HiArrowDownTray}
            onClick={() => onNavigate('active')}
            hint="View queue →"
          />
          <StatCard
            label="Completed"
            value={completedCount}
            accent="accent-green"
            icon={HiCheckCircle}
            onClick={() => onNavigate('history', { filter: 'completed' })}
            hint="Browse history →"
          />
          <StatCard
            label="Failed"
            value={failed}
            accent="accent-red"
            icon={HiExclamationCircle}
            onClick={() => onNavigate('history', { filter: failed > 0 ? 'failed' : 'all' })}
            hint={failed > 0 ? 'Retry failed →' : 'View history →'}
          />
          <StatCard
            label="Total Downloaded"
            value={formatBytes(summary?.total_bytes)}
            accent="accent-purple"
            icon={HiServerStack}
            onClick={() => onNavigate('analytics')}
            hint="Storage & stats →"
          />
        </div>
      </section>

      <section className="panel overview-panel">
        <SectionEyebrow title="QUICK ACCESS" tint="olive" />
        <div className="panel-body">
          <div className="quick-links-grid overview-quick-links">
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
        </div>
      </section>

      <section className="panel overview-panel">
        <SectionEyebrow
          title="ACTIVE DOWNLOADS"
          tint="salmon"
          action={(
            <button type="button" className="btn-link" onClick={() => onNavigate('active')}>
              View all ({active.length})
            </button>
          )}
        />
        <div className="panel-body">
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
        </div>
      </section>

      {failed > 0 && (
        <section className="panel panel-alert overview-panel">
          <SectionEyebrow
            title={`${failed} FAILED DOWNLOAD${failed !== 1 ? 'S' : ''}`}
            tint="salmon"
            action={(
              <button
                type="button"
                className="btn-link"
                onClick={() => onNavigate('history', { filter: 'failed' })}
              >
                View failed
              </button>
            )}
          />
          <div className="panel-body">
            <p className="settings-desc">Retry failed jobs from History or use bulk retry there.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigate('history', { filter: 'failed' })}
            >
              Open failed downloads
            </button>
          </div>
        </section>
      )}

      {recentHistory.length > 0 && (
        <section className="panel overview-panel">
          <SectionEyebrow
            title="RECENT HISTORY"
            tint="periwinkle"
            action={(
              <button type="button" className="btn-link" onClick={() => onNavigate('activity')}>
                Activity feed
              </button>
            )}
          />
          <div className="panel-body">
            <ul className="download-list">{recentHistory.map((i) => renderDownloadItem(i))}</ul>
          </div>
        </section>
      )}

      <section className="panel overview-panel">
        <SectionEyebrow
          title="SUPPORTED PLATFORMS"
          tint="sky"
          action={(
            <button type="button" className="btn-link" onClick={() => onNavigate('platforms')}>
              See all {platformTotal}+
            </button>
          )}
        />
        <div className="panel-body">
          <FeaturedPlatforms platforms={FEATURED_PLATFORMS} onSelect={() => onNavigate('new')} />
          <p className="cookies-hint url-detect-hint">
            Public links work out of the box. Private content needs Platform Auth.
          </p>
        </div>
      </section>
    </div>
  );
}

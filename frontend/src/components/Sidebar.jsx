import {
  HiArrowRightOnRectangle,
  HiBolt,
  HiXMark,
} from 'react-icons/hi2';
import PlatformIcon from './PlatformIcon.jsx';
import { NAV_GROUPS } from '../config/nav.js';

export { NAV_GROUPS };

const QUICK_PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'Google Drive', 'Dropbox', 'Direct HTTP'];

export default function Sidebar({
  view,
  setView,
  user,
  activeCount,
  failedCount = 0,
  onLogout,
  isOpen = false,
  onClose,
}) {
  const navigate = (id) => {
    setView(id);
    onClose?.();
  };

  const badgeCount = (badge) => {
    if (badge === 'active') return activeCount;
    if (badge === 'failed') return failedCount;
    return 0;
  };

  return (
    <>
      <div
        className={`sidebar-backdrop ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`} aria-label="Sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="brand-logo">
              <HiBolt size={22} />
            </div>
            <div>
              <strong>Remote Download</strong>
              <span>Manager</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <HiXMark size={22} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="nav-group">
              <span className="nav-group-label">{group.label}</span>
              {group.items.map(({ id, label, Icon, badge }) => {
                const count = badgeCount(badge);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`nav-item ${view === id ? 'active' : ''}`}
                    onClick={() => navigate(id)}
                  >
                    <span className="nav-icon">
                      <Icon size={20} />
                    </span>
                    {label}
                    {count > 0 && (
                      <span className={`nav-badge ${badge === 'failed' ? 'nav-badge-warn' : ''}`}>
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-platforms">
          <span className="sidebar-section-label">Quick access</span>
          <div className="sidebar-platform-icons">
            {QUICK_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                className="sidebar-platform-btn"
                title={p}
                onClick={() => navigate('new')}
              >
                <PlatformIcon name={p} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`user-chip user-chip-btn ${view === 'account' ? 'active' : ''}`}
            onClick={() => navigate('account')}
            title="My account"
          >
            <span className="user-avatar">{user?.username?.[0]?.toUpperCase() || '?'}</span>
            <div>
              <strong>{user?.displayName || user?.username}</strong>
              <span>@{user?.username}</span>
            </div>
          </button>
          <button type="button" className="btn-logout" onClick={onLogout}>
            <HiArrowRightOnRectangle size={18} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

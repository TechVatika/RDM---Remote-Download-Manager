import {
  HiSquares2X2,
  HiPlusCircle,
  HiArrowDownTray,
  HiClock,
  HiBars3,
} from 'react-icons/hi2';

const TABS = [
  { id: 'overview', label: 'Home', Icon: HiSquares2X2 },
  { id: 'new', label: 'Add', Icon: HiPlusCircle, accent: true },
  { id: 'active', label: 'Active', Icon: HiArrowDownTray, badge: true },
  { id: 'history', label: 'History', Icon: HiClock },
  { id: 'menu', label: 'Menu', Icon: HiBars3, isMenu: true },
];

export default function MobileBottomNav({ view, onSelect, activeCount, onOpenMenu }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      {TABS.map(({ id, label, Icon, accent, badge, isMenu }) => {
        const active = !isMenu && view === id;
        return (
          <button
            key={id}
            type="button"
            className={`mobile-nav-item ${active ? 'active' : ''} ${accent ? 'accent' : ''}`}
            onClick={() => (isMenu ? onOpenMenu() : onSelect(id))}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
          >
            <span className="mobile-nav-icon-wrap">
              <Icon size={22} />
              {badge && activeCount > 0 && (
                <span className="mobile-nav-badge">{activeCount > 9 ? '9+' : activeCount}</span>
              )}
            </span>
            <span className="mobile-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

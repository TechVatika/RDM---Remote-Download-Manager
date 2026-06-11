import { HiHome, HiArrowDownTray, HiPlusCircle, HiCog6Tooth } from 'react-icons/hi2';

const FOOTER_LINKS = [
  { id: 'overview', label: 'Home', Icon: HiHome },
  { id: 'new', label: 'Queue', Icon: HiPlusCircle },
  { id: 'active', label: 'Active', Icon: HiArrowDownTray },
  { id: 'app-settings', label: 'Settings', Icon: HiCog6Tooth },
];

export default function DellFooter({ onNavigate, year = new Date().getFullYear() }) {
  return (
    <footer className="dell-footer-band">
      <nav className="dell-footer-nav" aria-label="Footer">
        {FOOTER_LINKS.map(({ id, label, Icon }) => (
          <button key={id} type="button" className="dell-footer-nav-item" onClick={() => onNavigate(id)}>
            <Icon size={20} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <p className="dell-footer-legal">
        <button type="button" className="btn-link dell-footer-link" onClick={() => onNavigate('help')}>
          Help &amp; shortcuts
        </button>
        {' · '}
        Remote Download Manager · Catalog UI inspired by Dell.com (1996)
        {' · '}
        © {year}
      </p>
      <p className="dell-footer-compat">
        Best viewed with a modern browser. Downloads run on your server — not in this tab.
      </p>
    </footer>
  );
}

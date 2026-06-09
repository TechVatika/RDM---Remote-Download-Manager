import PlatformIcon from './PlatformIcon.jsx';
import { detectPlatformFromUrl } from '../utils/platformIcons.js';

export default function PlatformTile({ name, note, onClick, compact = false }) {
  return (
    <button
      type="button"
      className={`platform-tile ${compact ? 'compact' : ''}`}
      onClick={onClick}
      title={note || name}
    >
      <PlatformIcon name={name} size={compact ? 20 : 24} />
      <span className="platform-tile-name">{name.replace(' (Twitter)', '')}</span>
    </button>
  );
}

export function PlatformCard({ name, note, cookies }) {
  return (
    <div className="platform-card">
      <PlatformIcon name={name} size={22} />
      <div className="platform-card-body">
        <div className="platform-card-head">
          <strong>{name}</strong>
          {cookies && <span className="cookie-badge">public only</span>}
        </div>
        {note && <p>{note}</p>}
      </div>
    </div>
  );
}

export function FeaturedPlatforms({ platforms, onSelect }) {
  return (
    <div className="featured-platforms">
      {platforms.map((name) => (
        <PlatformTile
          key={name}
          name={name}
          compact
          onClick={() => onSelect?.(name)}
        />
      ))}
    </div>
  );
}

export function PlatformBadge({ url, title }) {
  const name = title ? null : detectPlatformFromUrl(url);
  return (
    <span className="platform-badge">
      <PlatformIcon name={name || 'Direct HTTP'} url={url} size={14} showBg={false} />
    </span>
  );
}

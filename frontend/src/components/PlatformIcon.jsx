import { getPlatformBrand } from '../utils/platformIcons.js';
import { getPlatformDomain, faviconUrl } from '../utils/platformDomains.js';
import { useTheme } from '../context/ThemeContext.jsx';

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Perceived luminance (0–1). Used to detect near-black logos that would be
// invisible when drawn directly on a dark background (no chip behind them).
function isDarkColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return lum < 0.18;
}

export default function PlatformIcon({ name, url, size = 22, showBg = true, className = '' }) {
  const { isDark } = useTheme();
  const source = name || url || '';
  const brand = getPlatformBrand(source);
  const domain = getPlatformDomain(source);
  const useFavicon = !brand.key && domain;
  const favicon = useFavicon ? faviconUrl(domain, 128) : null;

  if (useFavicon && favicon) {
    const box = showBg ? Math.round(size * 1.75) : size;
    if (showBg) {
      return (
        <span
          className={`platform-icon-wrap platform-favicon-wrap ${className}`}
          style={{ width: box, height: box }}
          title={name || domain}
        >
          <img src={favicon} alt="" className="platform-favicon" width={size} height={size} loading="lazy" />
        </span>
      );
    }
    return (
      <img
        src={favicon}
        alt=""
        className={`platform-favicon inline ${className}`}
        width={size}
        height={size}
        loading="lazy"
      />
    );
  }

  const { Icon, color, bg } = brand;

  if (!showBg) {
    return (
      <Icon
        className={`platform-icon ${className}`}
        size={size}
        color={isDark && isDarkColor(color) ? '#cbd5e1' : color}
        aria-hidden
      />
    );
  }

  const box = Math.round(size * 1.75);

  // In dark mode, render brand chips as light "app-icon" tiles so every logo —
  // including pure-black (X, TikTok) and saturated (YouTube red) — keeps its
  // true colour and stays legible, consistent with the favicon tiles.
  const chipBg = isDark ? 'rgba(255, 255, 255, 0.92)' : bg;

  return (
    <span
      className={`platform-icon-wrap ${className}`}
      style={{
        width: box,
        height: box,
        background: chipBg,
        color,
      }}
      title={name || undefined}
    >
      <Icon size={size} aria-hidden />
    </span>
  );
}

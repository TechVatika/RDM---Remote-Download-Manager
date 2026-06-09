/**
 * Client-side platform URL detection — synced from GET /api/platforms urlRules.
 * Falls back to built-in rules until the API loads.
 */

const DIRECT_FILE_RE =
  /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|mp3|m4a|aac|flac|wav|ogg|opus|zip|rar|7z|tar|gz|bz2|xz|pdf|exe|dmg|iso|apk|deb|rpm|jpg|jpeg|png|gif|webp|svg|txt|csv|json|xml|torrent|bin|msi|pkg|wasm)(\?|#|$)/i;

const PAGE_PATH_HINTS =
  /\/(watch|video|embed|player|play|clip|clips|reel|reels|shorts|live|v|e|posts?|status|share|stories|story|tv|view_video|album|track|playlist|podcast|episode|lecture|course|lesson)\b/i;

/** @type {{ fragments: string[], name: string, cookies?: boolean, ageGate?: boolean }[]} */
let rules = [
  { fragments: ['music.youtube.com'], name: 'YouTube Music' },
  { fragments: ['youtu.be', 'youtube.com'], name: 'YouTube' },
  { fragments: ['instagram.com'], name: 'Instagram', cookies: true },
  { fragments: ['facebook.com', 'fb.watch', 'fb.com'], name: 'Facebook', cookies: true },
  { fragments: ['tiktok.com'], name: 'TikTok' },
  { fragments: ['twitter.com', 'x.com'], name: 'X (Twitter)' },
  { fragments: ['pinterest.com'], name: 'Pinterest' },
  { fragments: ['v.redd.it', 'redd.it', 'reddit.com'], name: 'Reddit' },
  { fragments: ['linkedin.com'], name: 'LinkedIn' },
  { fragments: ['vimeo.com'], name: 'Vimeo' },
  { fragments: ['twitch.tv'], name: 'Twitch' },
  { fragments: ['pornhub.com'], name: 'Pornhub', ageGate: true },
  { fragments: ['xvideos.com'], name: 'XVideos', ageGate: true },
  { fragments: ['drive.google.com'], name: 'Google Drive' },
  { fragments: ['dropbox.com'], name: 'Dropbox' },
];

export function initPlatformUrlRules(apiRules) {
  if (Array.isArray(apiRules) && apiRules.length > 0) {
    rules = apiRules;
  }
}

function parseUrl(raw) {
  try {
    return new URL(String(raw || '').trim());
  } catch {
    return null;
  }
}

export function isDirectFileUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return DIRECT_FILE_RE.test(parsed.pathname);
}

export function matchPlatformRule(url) {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  const full = `${host}${parsed.pathname}`.toLowerCase();

  for (const rule of rules) {
    for (const frag of rule.fragments) {
      const f = frag.toLowerCase();
      if (host.includes(f) || full.includes(f)) return rule;
    }
  }
  return null;
}

export function looksLikeWebPage(url) {
  if (isDirectFileUrl(url)) return false;
  const parsed = parseUrl(url);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!parsed.hostname.includes('.')) return false;
  if (PAGE_PATH_HINTS.test(parsed.pathname)) return true;
  const last = parsed.pathname.split('/').filter(Boolean).pop() || '';
  if (last && !/\.\w{2,5}$/.test(last) && parsed.pathname.length > 1) return true;
  return false;
}

export function detectPlatformFromUrl(url) {
  const rule = matchPlatformRule(url);
  if (rule) return rule.name;
  if (isDirectFileUrl(url)) return 'Direct HTTP';
  if (looksLikeWebPage(url)) return 'Media (auto)';
  return 'Direct HTTP';
}

export function isMediaSiteUrl(url) {
  if (isDirectFileUrl(url)) return false;
  if (matchPlatformRule(url)) return true;
  return looksLikeWebPage(url);
}

export function isAgeGatedSite(url) {
  return Boolean(matchPlatformRule(url)?.ageGate);
}

export function getDownloadEngine(url) {
  return isMediaSiteUrl(url) ? 'yt-dlp' : 'http-segmented';
}

export function needsCookiesHint(url) {
  return Boolean(matchPlatformRule(url)?.cookies);
}

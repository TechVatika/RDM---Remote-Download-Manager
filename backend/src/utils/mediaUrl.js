/**
 * Normalize social/media URLs for public (no-login) extraction.
 * Does not bypass privacy — only cleans links so yt-dlp can read public content.
 */

export { isAdultSiteUrl } from '../data/adultSites.js';

const FILE_EXT_SUFFIX = /^(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i;

function sanitizeViewkeyValue(key) {
  if (!key) return key;
  let k = decodeURIComponent(String(key)).trim();
  // e.g. viewkey=6a1c7a6c2d53fMP4 (extension pasted into key)
  const glued = k.match(/^([a-zA-Z0-9_-]{8,})(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i);
  if (glued) k = glued[1];
  // e.g. viewkey=abc123.mp4
  const dotted = k.match(/^([a-zA-Z0-9_-]{8,})\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i);
  if (dotted) k = dotted[1];
  return k;
}

function normalizePornhubUrl(parsed) {
  parsed.hostname = 'www.pornhub.com';
  parsed.protocol = 'https:';

  const vk = parsed.searchParams.get('viewkey');
  if (vk) parsed.searchParams.set('viewkey', sanitizeViewkeyValue(vk));

  ['utm_source', 'utm_medium', 'utm_campaign', 'hd', 't'].forEach((k) =>
    parsed.searchParams.delete(k),
  );

  return parsed;
}

export function normalizeMediaUrl(raw) {
  let url = String(raw ?? '').trim();
  if (!url) return url;

  // Accidental extension glued to end of full URL string
  url = url.replace(/(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i, '');

  try {
    const parsed = new URL(url);

    ['utm_source', 'utm_medium', 'utm_campaign', 'igsh', 'igshid', 'fbclid', 'mibextid'].forEach(
      (k) => parsed.searchParams.delete(k),
    );

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      parsed.hostname = 'www.instagram.com';
      parsed.pathname = parsed.pathname.replace(/^\/reels\//, '/reel/');
    }

    if (host.includes('tiktok.com')) {
      parsed.search = parsed.search.replace(/^\?$/, '');
    }

    if (host === 'twitter.com' || host === 'x.com') {
      parsed.hostname = 'x.com';
    }

    if (host === 'facebook.com' || host === 'fb.watch' || host === 'fb.com') {
      parsed.searchParams.delete('ref');
    }

    if (host.includes('pinterest.')) {
      parsed.searchParams.delete('e');
    }

    // All PH TLDs/mirrors → canonical .com (org/net often 410 or redirect oddly)
    if (host.includes('pornhub')) {
      normalizePornhubUrl(parsed);
    }

    if (host.includes('xvideos.com') || host.includes('xhamster.com')) {
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) =>
        parsed.searchParams.delete(k),
      );
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export function isLikelyPrivateContentError(message = '') {
  const m = message.toLowerCase();
  return (
    m.includes('login') ||
    m.includes('private') ||
    m.includes('cookies') ||
    m.includes('authentication') ||
    m.includes('sign in') ||
    m.includes('authorized') ||
    m.includes('age-restricted') ||
    m.includes('members-only') ||
    m.includes('confirm your age') ||
    m.includes('rate-limit') ||
    m.includes('connection reset') ||
    m.includes('errno 104') ||
    m.includes('403') ||
    m.includes('blocked')
  );
}

export function friendlyMediaError(message = '') {
  const m = message.toLowerCase();

  if (/\b410\b|\bgone\b|removed|deleted|no longer available/i.test(m)) {
    return (
      'Video not found (410 Gone) — it may have been removed, or the URL is wrong. ' +
      'Open the link in your browser to confirm it still plays. ' +
      'Use pornhub.com (not .org), and make sure the viewkey has no "MP4" pasted at the end. ' +
      'For age-gated content, configure cookies in Platform Auth.'
    );
  }

  if (/connection refused|errno 111/i.test(m)) {
    return (
      'Cloudflare WARP proxy was not ready (connection refused on local SOCKS port). ' +
      'Retry the download — WARP connects automatically for adult sites. ' +
      'If it keeps failing, run: warp-cli --accept-tos connect'
    );
  }

  if (/connection reset|errno 104|403 forbidden|blocked|cloudflare|captcha/i.test(m)) {
    return (
      'The site blocked the server from accessing this page. ' +
      'For adult sites: enable Cloudflare WARP in Platform Auth → Adult sites, ' +
      'and/or upload cookies.txt after age verification. ' +
      'Datacenter IPs are often blocked — WARP (proxy mode) fixes this for adult URLs only.'
    );
  }

  if (isLikelyPrivateContentError(message)) {
    const ageHint = /age|18\+|confirm your age|adult|pornhub|xvideos|xhamster/i.test(message)
      ? ' For 18+ sites, open Platform Auth and use Browser cookies or upload cookies.txt after age verification.'
      : '';
    return (
      'This link appears to be private, login-protected, or age-gated. ' +
      'RDM works without login for public posts and direct file URLs.' +
      ageHint +
      ' Try a public link, or configure cookies in Platform Auth.'
    );
  }

  if (m.includes('unsupported url')) {
    return 'Unsupported URL. Try a direct file link or a public video page URL.';
  }

  return message || 'Could not read media info';
}

/**
 * Validate and normalize a URL for queue/download. Throws with a clear message on blob: etc.
 */
export function prepareDownloadUrl(raw) {
  let url = String(raw ?? '').trim();
  if (!url) throw new Error('URL is required');

  url = url.replace(/(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i, '');

  if (/^blob:/i.test(url)) {
    if (/pornhub/i.test(url)) {
      throw new Error(
        'That is a browser blob URL, not a page link. Copy the address from your browser bar instead, e.g. https://www.pornhub.com/view_video.php?viewkey=...',
      );
    }
    throw new Error(
      'blob: URLs only exist in your browser and cannot be downloaded. Copy the normal https:// page URL from the address bar.',
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Invalid URL — only http and https links are supported');
  }

  return normalizeMediaUrl(url);
}

export function extractYoutubeListId(raw) {
  try {
    const u = new URL(String(raw ?? '').trim());
    const host = u.hostname.toLowerCase();
    if (!host.includes('youtube.com') && !host.includes('music.youtube.com')) return null;
    return u.searchParams.get('list');
  } catch {
    return null;
  }
}

/** Classify YouTube list= IDs — user playlists, Mix/Radio, Watch Later, etc. */
export function classifyYoutubePlaylistKind(listId) {
  if (!listId) return null;
  const upper = listId.toUpperCase();
  if (upper.startsWith('PL')) {
    return { kind: 'user', label: 'Playlist', requiresAuth: false };
  }
  if (upper.startsWith('RD')) {
    return { kind: 'mix', label: 'Mix', requiresAuth: false };
  }
  if (upper.startsWith('WL')) {
    return { kind: 'watch_later', label: 'Watch Later', requiresAuth: true };
  }
  if (upper.startsWith('LL')) {
    return { kind: 'liked', label: 'Liked videos', requiresAuth: true };
  }
  if (upper.startsWith('LM') || listId.startsWith('OLAK5uy_')) {
    return { kind: 'music', label: 'Music album', requiresAuth: false };
  }
  if (upper.startsWith('FL')) {
    return { kind: 'favorites', label: 'Favorites', requiresAuth: true };
  }
  return { kind: 'system', label: 'Playlist', requiresAuth: false };
}

/** Instant playlist/mix hint from URL — no yt-dlp call. */
export function getPlaylistHint(raw) {
  const normalized = String(raw ?? '').trim();
  if (!looksLikePlaylistUrl(normalized)) return null;
  const listId = extractYoutubeListId(normalized);
  const classification = classifyYoutubePlaylistKind(listId);
  return {
    pending: true,
    playlistId: listId,
    playlistTitle: classification?.label || 'Playlist',
    entryCount: null,
    kind: classification?.kind || 'playlist',
    kindLabel: classification?.label || 'Playlist',
    requiresAuth: classification?.requiresAuth || false,
  };
}

/** URLs that yt-dlp may treat as multi-entry playlists. */
export function looksLikePlaylistUrl(raw) {
  try {
    const u = new URL(String(raw ?? '').trim());
    const host = u.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('music.youtube.com')) {
      if (/\/playlist\b/i.test(u.pathname)) return true;
      const list = u.searchParams.get('list');
      // PL=user, RD=Mix, WL=Watch Later, LL=Liked, LM/OLAK=music albums, etc.
      if (list && list.length >= 2) return true;
    }
    if (host.includes('soundcloud.com') && /\/sets\//i.test(u.pathname)) return true;
    if (host.includes('dailymotion.com') && /\/playlist\//i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

export { FILE_EXT_SUFFIX, sanitizeViewkeyValue };

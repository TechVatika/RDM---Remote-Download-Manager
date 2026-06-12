/** Parse Instagram URLs and build download targets for profile pages. */

const IG_HOST = /instagram\.com/i;

const RESERVED_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'tv',
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'privacy',
  'developer',
  'nametag',
  'web',
  'static',
  'api',
  'challenge',
  'directory',
]);

export function isInstagramUrl(raw) {
  try {
    return IG_HOST.test(new URL(String(raw ?? '').trim()).hostname);
  } catch {
    return false;
  }
}

/**
 * @returns {{
 *   kind: 'profile'|'post'|'reel'|'story'|'highlight'|'unknown',
 *   username?: string,
 *   shortcode?: string,
 *   storyId?: string,
 *   highlightId?: string,
 * } | null}
 */
export function parseInstagramUrl(raw) {
  try {
    const u = new URL(String(raw ?? '').trim());
    if (!IG_HOST.test(u.hostname)) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;

    if (parts[0] === 'stories') {
      if (parts[1] === 'highlights' && parts[2]) {
        return { kind: 'highlight', highlightId: parts[2] };
      }
      if (parts[1]) {
        return { kind: 'story', username: parts[1], storyId: parts[2] || null };
      }
      return { kind: 'unknown' };
    }

    if (parts[0] === 'p' && parts[1]) {
      return { kind: 'post', shortcode: parts[1] };
    }

    if (parts[0] === 'reel' && parts[1]) {
      return { kind: 'reel', shortcode: parts[1] };
    }

    if (parts[0] === 'tv' && parts[1]) {
      return { kind: 'post', shortcode: parts[1] };
    }

    if (parts.length >= 2 && parts[1] === 'reel' && parts[2]) {
      return { kind: 'reel', username: parts[0], shortcode: parts[2] };
    }

    const username = parts[0];
    if (username && !RESERVED_SEGMENTS.has(username.toLowerCase())) {
      return { kind: 'profile', username };
    }

    return { kind: 'unknown' };
  } catch {
    return null;
  }
}

export function isInstagramProfileUrl(raw) {
  return parseInstagramUrl(raw)?.kind === 'profile';
}

export function instagramProfileUrl(username) {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

/** Canonical URL for a single post, reel, story, or highlight link. */
export function instagramMediaCanonicalUrl(parsed) {
  if (!parsed) return null;
  switch (parsed.kind) {
    case 'post':
      return `https://www.instagram.com/p/${encodeURIComponent(parsed.shortcode)}/`;
    case 'reel':
      return `https://www.instagram.com/reel/${encodeURIComponent(parsed.shortcode)}/`;
    case 'highlight':
      return `https://www.instagram.com/stories/highlights/${encodeURIComponent(parsed.highlightId)}/`;
    case 'story':
      if (parsed.storyId) {
        return `https://www.instagram.com/stories/${encodeURIComponent(parsed.username)}/${encodeURIComponent(parsed.storyId)}/`;
      }
      return parsed.username
        ? `https://www.instagram.com/stories/${encodeURIComponent(parsed.username)}/`
        : null;
    default:
      return null;
  }
}

export function isInstagramDirectMediaUrl(raw) {
  const kind = parseInstagramUrl(raw)?.kind;
  return kind === 'post' || kind === 'reel' || kind === 'highlight' || kind === 'story';
}

export function instagramAlternateMediaUrl(parsed) {
  if (parsed?.kind === 'post' && parsed.shortcode) {
    return `https://www.instagram.com/reel/${encodeURIComponent(parsed.shortcode)}/`;
  }
  return null;
}

export function instagramDirectMediaLabel(kind) {
  switch (kind) {
    case 'post':
      return 'Post';
    case 'reel':
      return 'Reel';
    case 'highlight':
      return 'Highlight';
    case 'story':
      return 'Story';
    default:
      return 'Media';
  }
}

/** Resolve queue URL + options for an Instagram profile download target. */
export function resolveInstagramTarget(username, target, { highlightId = null, avatarUrl = null } = {}) {
  const user = String(username ?? '').replace(/^@/, '');
  if (!user) throw new Error('Instagram username is required');

  switch (target) {
    case 'avatar':
      if (!avatarUrl) {
        throw new Error('Profile picture could not be resolved — add Instagram cookies in Platform Auth (sessionid + ds_user_id) and retry');
      }
      return {
        url: avatarUrl,
        type: 'http',
        expandPlaylist: false,
        filename: `${user}_profile.jpg`,
      };
    case 'stories':
      return {
        url: `https://www.instagram.com/stories/${user}/`,
        type: 'media',
        expandPlaylist: true,
        filename: null,
      };
    case 'posts':
      return {
        url: instagramProfileUrl(user),
        type: 'media',
        expandPlaylist: true,
        filename: null,
      };
    case 'reels':
      return {
        url: `https://www.instagram.com/${user}/reels/`,
        type: 'media',
        expandPlaylist: true,
        filename: null,
      };
    case 'highlights':
      if (!highlightId) throw new Error('Highlight ID is required');
      return {
        url: `https://www.instagram.com/stories/highlights/${highlightId}/`,
        type: 'media',
        expandPlaylist: true,
        filename: null,
      };
    default:
      throw new Error(`Unknown Instagram target: ${target}`);
  }
}

export function defaultInstagramTargets(username, counts = {}) {
  const user = String(username ?? '').replace(/^@/, '');
  return [
    {
      id: 'avatar',
      label: 'Profile picture',
      description: 'HD avatar — public or private (cookies if needed)',
      icon: 'avatar',
      requiresAuth: false,
    },
    {
      id: 'stories',
      label: 'Stories',
      description: 'Active stories (login cookies usually required)',
      icon: 'story',
      requiresAuth: true,
      entryCount: counts.stories ?? null,
    },
    {
      id: 'posts',
      label: 'Posts',
      description: 'Photos & videos from the grid (Instagram cookies required)',
      icon: 'posts',
      requiresAuth: true,
      entryCount: counts.posts ?? null,
    },
    {
      id: 'reels',
      label: 'Reels',
      description: 'Reels tab content (Instagram cookies required)',
      icon: 'reels',
      requiresAuth: true,
      entryCount: counts.reels ?? null,
    },
  ].map((t) => ({ ...t, username: user }));
}

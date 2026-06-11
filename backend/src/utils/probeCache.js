/** Short-lived in-memory cache for yt-dlp probe results (speeds up repeat pastes). */

const TTL_MS = Number(process.env.PROBE_CACHE_TTL_MS) || 5 * 60 * 1000;
const MAX_ENTRIES = Number(process.env.PROBE_CACHE_MAX) || 64;

const cache = new Map();

function prune() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

export function getCachedProbe(url) {
  const entry = cache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(url);
    return null;
  }
  return entry.data;
}

export function setCachedProbe(url, data) {
  prune();
  cache.set(url, { data, expiresAt: Date.now() + TTL_MS });
}

const HTTP_META_PREFIX = 'http-meta:';

export function getCachedHttpMeta(url) {
  return getCachedProbe(`${HTTP_META_PREFIX}${url}`);
}

export function setCachedHttpMeta(url, data) {
  setCachedProbe(`${HTTP_META_PREFIX}${url}`, data);
}

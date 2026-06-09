import { probeMedia } from '../worker/ytdlpDownload.js';
import { filenameFromUrl, sanitizeFilename } from './filename.js';
import { isAdultSiteUrl } from '../data/adultSites.js';

/** Default HTTP filename from URL path (strip query string from segment). */
export function defaultHttpFilename(url) {
  const raw = filenameFromUrl(url);
  const q = raw.indexOf('?');
  return q > 0 ? raw.slice(0, q) : raw;
}

/**
 * Resolve display filename when queuing a download.
 * For 18+ sites, probes yt-dlp when possible so the UI shows a real name, not the URL.
 */
export async function resolveQueuedFilename(url, { type = 'http', isPrivate = false } = {}) {
  if (type === 'media' && isPrivate) {
    try {
      const info = await probeMedia(url);
      if (info.title) {
        const ext = info.videoQualities?.length ? '.mp4' : '.mp3';
        const base = sanitizeFilename(info.title);
        return base.includes('.') ? base : `${base}${ext}`;
      }
    } catch {
      /* fall through */
    }
  }

  if (type === 'http' || !isPrivate) {
    return defaultHttpFilename(url);
  }

  return defaultHttpFilename(url);
}

export function isPrivateUrl(url) {
  return isAdultSiteUrl(url);
}

import { filenameFromDisposition, filenameFromUrl, sanitizeFilename } from './filename.js';
import { assertDownloadUrlAllowed } from './ssrf.js';
import { getCachedHttpMeta, setCachedHttpMeta } from './probeCache.js';

const USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const INSPECT_TIMEOUT_MS = Number(process.env.DOWNLOAD_INSPECT_TIMEOUT_MS) || 8000;

function buildHeaders(url, extra = {}, auth = null) {
  const parsed = new URL(url);
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    'Accept-Encoding': 'identity',
    Referer: `${parsed.origin}/`,
    Connection: 'keep-alive',
    ...extra,
  };
  if (auth?.username) {
    const token = Buffer.from(`${auth.username}:${auth.password ?? ''}`).toString('base64');
    headers.Authorization = `Basic ${token}`;
  }
  return headers;
}

function parseInspectResponse(res, url, { ranged = false } = {}) {
  let totalBytes = null;
  const contentRange = res.headers.get('content-range');
  if (ranged && res.status === 206 && contentRange) {
    const m = contentRange.match(/\/(\d+)\s*$/);
    if (m) totalBytes = Number(m[1]);
  }
  if (totalBytes == null) {
    const len = Number(res.headers.get('content-length'));
    if (Number.isFinite(len) && len > 0) totalBytes = len;
  }

  const acceptRanges = (res.headers.get('accept-ranges') || '').toLowerCase();
  const supportsRanges =
    res.status === 206 || (acceptRanges.includes('bytes') && totalBytes != null);

  const disposition = res.headers.get('content-disposition');
  const headerName = filenameFromDisposition(disposition);
  const filename = sanitizeFilename(headerName || filenameFromUrl(url));

  return {
    totalBytes,
    supportsRanges,
    headerName,
    filename,
    source: headerName ? 'server' : 'url',
    finalUrl: res.url || url,
  };
}

async function drainBody(res) {
  try {
    await res.body?.cancel?.();
  } catch {
    /* ignore */
  }
}

/**
 * Quick HEAD or ranged GET to read Content-Disposition filename and file size.
 * Runs both in parallel — first successful response wins (~2× faster on slow CDNs).
 */
export async function inspectRemoteHttpUrl(url, { signal, auth } = {}) {
  await assertDownloadUrlAllowed(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INSPECT_TIMEOUT_MS);
  const linked = controller.signal;

  const finish = (result) => {
    clearTimeout(timer);
    controller.abort();
    return result;
  };

  const checkAuth = (res) => {
    if (res.status === 401 || res.status === 403) {
      const err = new Error(`HTTP ${res.status} ${res.statusText}`.trim());
      err.authRequired = true;
      throw err;
    }
  };

  const tryHead = async () => {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: buildHeaders(url, {}, auth),
      redirect: 'follow',
      signal: linked,
    });
    checkAuth(res);
    if (!res.ok) throw new Error(`HEAD ${res.status}`);
    const parsed = parseInspectResponse(res, url, { ranged: false });
    if (!parsed.headerName && parsed.totalBytes == null) {
      throw new Error('HEAD incomplete');
    }
    return parsed;
  };

  const tryRange = async () => {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(url, { Range: 'bytes=0-0' }, auth),
      redirect: 'follow',
      signal: linked,
    });
    checkAuth(res);
    if (!res.ok && res.status !== 206) throw new Error(`GET ${res.status}`);
    await drainBody(res);
    const parsed = parseInspectResponse(res, url, { ranged: true });
    if (!parsed.headerName && parsed.totalBytes == null) {
      throw new Error('GET incomplete');
    }
    return parsed;
  };

  try {
    return finish(await Promise.any([tryHead(), tryRange()]));
  } catch (err) {
    clearTimeout(timer);
    if (err?.authRequired) throw err;
    throw new Error(err?.message || 'Could not read file headers from server');
  }
}

/** Filename + size from server headers — cached to avoid repeat fetches on queue. */
export async function resolveHttpDownloadMeta(url, options = {}) {
  const { skipCache = false, ...inspectOptions } = options;

  if (!skipCache) {
    const cached = getCachedHttpMeta(url);
    if (cached) return cached;
  }

  const info = await inspectRemoteHttpUrl(url, inspectOptions);
  const meta = {
    filename: info.filename,
    fileSize: info.totalBytes ?? null,
    supportsRanges: info.supportsRanges,
    source: info.source,
    finalUrl: info.finalUrl,
  };

  if (!skipCache) {
    setCachedHttpMeta(url, meta);
  }

  return meta;
}

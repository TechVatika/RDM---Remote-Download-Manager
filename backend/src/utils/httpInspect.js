import { filenameFromDisposition, filenameFromUrl, sanitizeFilename } from './filename.js';
import { assertDownloadUrlAllowed } from './ssrf.js';

const USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const INSPECT_TIMEOUT_MS = Number(process.env.DOWNLOAD_INSPECT_TIMEOUT_MS) || 12000;

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

/**
 * Quick ranged GET to read Content-Disposition filename and file size.
 * Used for UI filename preview and bulk queue metadata.
 */
export async function inspectRemoteHttpUrl(url, { signal, auth } = {}) {
  await assertDownloadUrlAllowed(url);

  const timeoutSignal = signal ?? AbortSignal.timeout(INSPECT_TIMEOUT_MS);
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(url, { Range: 'bytes=0-0' }, auth),
    redirect: 'follow',
    signal: timeoutSignal,
  });

  if (!res.ok && res.status !== 206) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    if (res.status === 401 || res.status === 403) err.authRequired = true;
    throw err;
  }

  try {
    await res.arrayBuffer();
  } catch {
    /* ignore tiny body drain errors */
  }

  let totalBytes = null;
  const contentRange = res.headers.get('content-range');
  if (res.status === 206 && contentRange) {
    const m = contentRange.match(/\/(\d+)\s*$/);
    if (m) totalBytes = Number(m[1]);
  }
  if (totalBytes == null) {
    const len = Number(res.headers.get('content-length'));
    if (len) totalBytes = len;
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

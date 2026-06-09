import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import {
  filenameFromDisposition,
  filenameFromUrl,
  sanitizeFilename,
} from '../utils/filename.js';

const USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

import {
  DEFAULT_CONNECTIONS,
  MAX_CONNECTIONS,
  MIN_SEGMENT_BYTES,
} from '../config/speed.js';

const MIN_SEGMENT_SIZE = MIN_SEGMENT_BYTES;

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

// Build an HTTP error and flag the auth-required ones so the worker can prompt.
function httpError(res, where = '') {
  const err = new Error(`HTTP ${res.status} ${res.statusText}${where ? ` ${where}` : ''}`.trim());
  if (res.status === 401 || res.status === 403) err.authRequired = true;
  return err;
}

function partPaths(destDir, jobId) {
  return {
    part: path.join(destDir, `.rdm-${jobId}.part`),
    manifest: path.join(destDir, `.rdm-${jobId}.json`),
  };
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

/** Remove the in-progress part file and manifest for a job (used on cancel). */
export function cleanupSegmentedJob(destDir, jobId) {
  const { part, manifest } = partPaths(destDir, jobId);
  for (const f of [part, manifest]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

export function hasPartialJob(destDir, jobId) {
  const { part, manifest } = partPaths(destDir, jobId);
  return fs.existsSync(manifest) && fs.existsSync(part);
}

/** Inspect the target: total size + whether the server supports byte ranges. */
async function inspect(url, signal, auth) {
  // A ranged GET of the first byte tells us size (Content-Range) and range support.
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(url, { Range: 'bytes=0-0' }, auth),
    redirect: 'follow',
    signal,
  });

  if (!res.ok && res.status !== 206) {
    throw httpError(res);
  }

  // Drain the tiny body so the socket can be reused.
  try {
    await res.arrayBuffer();
  } catch {
    /* ignore */
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

  return { totalBytes, supportsRanges, headerName, finalUrl: res.url || url };
}

function planSegments(totalBytes, connections) {
  const segs = [];
  const size = Math.ceil(totalBytes / connections);
  for (let i = 0; i < connections; i += 1) {
    const start = i * size;
    if (start >= totalBytes) break;
    const end = Math.min(start + size - 1, totalBytes - 1);
    segs.push({ start, end, done: 0 });
  }
  return segs;
}

function loadManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

async function saveManifest(manifestPath, manifest) {
  try {
    await fsp.writeFile(manifestPath, JSON.stringify(manifest));
  } catch {
    /* best-effort */
  }
}

/**
 * IDM-style segmented HTTP download with resume support.
 * Contract mirrors downloadHttpFile plus { jobId, connections, filename }.
 * On abort it leaves the .part file + manifest intact so the job can resume
 * (the worker deletes them via cleanupSegmentedJob only on a real cancel).
 */
export async function downloadSegmented({
  url,
  destDir,
  jobId,
  signal,
  onProgress,
  connections,
  filename: filenameOverride,
  auth = null,
}) {
  const trimmedUrl = url.trim();
  fs.mkdirSync(destDir, { recursive: true });

  const { part: partPath, manifest: manifestPath } = partPaths(destDir, jobId);
  const existing = loadManifest(manifestPath);

  const conn = Math.min(
    Math.max(1, connections || DEFAULT_CONNECTIONS),
    MAX_CONNECTIONS,
  );

  let totalBytes;
  let segments;
  let filename;

  if (existing && fs.existsSync(partPath)) {
    // Resume a paused/interrupted job.
    totalBytes = existing.totalBytes;
    segments = existing.segments;
    filename = existing.filename;
  } else {
    const info = await inspect(trimmedUrl, signal, auth);
    totalBytes = info.totalBytes;
    filename = sanitizeFilename(
      filenameOverride || info.headerName || filenameFromUrl(trimmedUrl),
    );

    if (!info.supportsRanges || !totalBytes || totalBytes < MIN_SEGMENT_SIZE) {
      // Server can't do ranges (or file is tiny) -> single stream, no resume.
      return singleStream({
        url: trimmedUrl,
        destDir,
        partPath,
        manifestPath,
        filename,
        totalBytes,
        signal,
        onProgress,
        auth,
      });
    }

    segments = planSegments(totalBytes, conn);
    // Preallocate the output file to the final size.
    const fd = fs.openSync(partPath, 'w');
    try {
      fs.ftruncateSync(fd, totalBytes);
    } finally {
      fs.closeSync(fd);
    }
    await saveManifest(manifestPath, {
      url: trimmedUrl,
      filename,
      totalBytes,
      connections: conn,
      segments,
    });
  }

  const fh = await fsp.open(partPath, 'r+');
  let lastReportAt = 0;
  let manifestDirty = false;

  const totalDownloaded = () => segments.reduce((s, seg) => s + seg.done, 0);

  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReportAt < 1000) return;
    lastReportAt = now;
    const downloaded = totalDownloaded();
    onProgress?.({
      bytesDownloaded: downloaded,
      fileSize: totalBytes,
      progress: totalBytes ? Math.min(100, (downloaded / totalBytes) * 100) : 0,
    });
  };

  const persist = async () => {
    if (!manifestDirty) return;
    manifestDirty = false;
    await saveManifest(manifestPath, {
      url: trimmedUrl,
      filename,
      totalBytes,
      connections: conn,
      segments,
    });
  };

  const persistTimer = setInterval(() => {
    persist();
    report();
  }, 500);

  async function runSegment(seg) {
    if (seg.done > seg.end - seg.start) return; // already complete
    const rangeStart = seg.start + seg.done;
    if (rangeStart > seg.end) return;

    const res = await fetch(trimmedUrl, {
      method: 'GET',
      headers: buildHeaders(trimmedUrl, {
        Range: `bytes=${rangeStart}-${seg.end}`,
      }, auth),
      redirect: 'follow',
      signal,
    });

    if (res.status !== 206 && res.status !== 200) {
      throw httpError(res, 'on segment');
    }

    const nodeStream = Readable.fromWeb(res.body);
    for await (const chunk of nodeStream) {
      const writePos = seg.start + seg.done;
      await fh.write(chunk, 0, chunk.length, writePos);
      seg.done += chunk.length;
      manifestDirty = true;
      report();
    }
  }

  try {
    await Promise.all(segments.map((seg) => runSegment(seg)));

    clearInterval(persistTimer);
    await fh.sync().catch(() => {});
    await fh.close();

    const finalPath = uniquePath(destDir, filename);
    fs.renameSync(partPath, finalPath);
    try {
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    } catch {
      /* ignore */
    }

    const stat = fs.statSync(finalPath);
    report(true);
    return {
      filePath: finalPath,
      fileSize: stat.size,
      bytesDownloaded: stat.size,
    };
  } catch (err) {
    clearInterval(persistTimer);
    manifestDirty = true;
    await persist(); // keep resume state
    await fh.close().catch(() => {});
    throw err;
  }
}

/** Fallback path for servers without range support. No resume possible. */
async function singleStream({
  url,
  destDir,
  partPath,
  manifestPath,
  filename,
  totalBytes,
  signal,
  onProgress,
  auth = null,
}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(url, {}, auth),
    redirect: 'follow',
    signal,
  });
  if (!res.ok) throw httpError(res);

  let downloaded = 0;
  let lastReportAt = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReportAt < 1000) return;
    lastReportAt = now;
    onProgress?.({
      bytesDownloaded: downloaded,
      fileSize: totalBytes,
      progress: totalBytes ? Math.min(100, (downloaded / totalBytes) * 100) : 0,
    });
  };

  try {
    const nodeStream = Readable.fromWeb(res.body);
    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(partPath);
      nodeStream.on('data', (c) => {
        downloaded += c.length;
        report();
      });
      nodeStream.on('error', reject);
      fileStream.on('error', reject);
      fileStream.on('finish', resolve);
      nodeStream.pipe(fileStream);
    });
  } catch (err) {
    // single stream can't resume; drop the partial so a retry starts clean
    try {
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
    } catch {
      /* ignore */
    }
    throw err;
  }

  const finalPath = uniquePath(destDir, filename);
  fs.renameSync(partPath, finalPath);
  try {
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  } catch {
    /* ignore */
  }
  const stat = fs.statSync(finalPath);
  report(true);
  return { filePath: finalPath, fileSize: stat.size, bytesDownloaded: stat.size };
}

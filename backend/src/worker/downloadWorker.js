import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { assertDownloadUrlAllowed } from '../utils/ssrf.js';
import { maybeRenameDownload } from '../utils/aiRename.js';
import { resolveDestination, finalizeDownloadPath } from '../config/paths.js';
import { prepareDownloadUrl } from '../utils/mediaUrl.js';
import { filenameFromUrl, sanitizeFilename } from '../utils/filename.js';
import { downloadMedia, probeMedia } from './ytdlpDownload.js';
import { beginAdultWarpForUrl, releaseAdultWarpForUrl, usesWarpForUrl } from '../config/adultProxy.js';
import {
  downloadSegmented,
  cleanupSegmentedJob,
  hasPartialJob,
} from './segmentedDownload.js';
import {
  consumeJobCredentials,
  clearJobCredentials,
  setJobCredentials,
} from './jobCredentials.js';
import {
  DEFAULT_CONNECTIONS,
  MAX_CONCURRENT_DOWNLOADS,
  WORKER_POLL_MS,
} from '../config/speed.js';
import { logger } from '../utils/logger.js';

const log = logger.child('worker');

export { setJobCredentials };

const MAX_CONCURRENT = MAX_CONCURRENT_DOWNLOADS;
const POLL_MS = WORKER_POLL_MS;
const CONTROL_POLL_MS = 1500;

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'worker-heartbeat.json');

const activeJobs = new Map();
const pauseRequested = new Set();
// Currently-running 18+ (private) job ids. Adult downloads run exclusively:
// nothing else starts while one is active, and one only starts when idle.
const activePrivate = new Set();

function isAuthError(message = '') {
  return /\b(401|403)\b|unauthoriz|forbidden|authentication|\bsign[ -]?in\b|\blog[ -]?in\b|\blogin\b|\bpassword\b|requires? (a |an )?(login|account|subscription|premium)|members[- ]only|paywall/i.test(
    message,
  );
}

/** Node fetch/undici uses "terminated" when the server or an abort kills the stream. */
function isAbortLikeError(err) {
  if (err?.name === 'AbortError') return true;
  const m = String(err?.message || '').toLowerCase();
  return /\bterminated\b|\baborted\b|\babort\b/.test(m);
}

function isConnectionDropError(err) {
  const m = `${err?.message || ''} ${err?.cause?.message || ''}`.toLowerCase();
  return (
    /\bterminated\b|econnreset|etimedout|socket hang up|network|fetch failed|broken pipe|errno 104|errno 110|other side closed/.test(
      m,
    )
  );
}

function friendlyHttpDownloadError(raw = '') {
  const m = String(raw).toLowerCase();
  if (/terminated|econnreset|socket hang up|broken pipe|errno 104|other side closed/.test(m)) {
    return (
      'The file host closed the connection mid-download — common with temporary CDN links whose token expires after a few minutes. ' +
      'Get a fresh copy link from the site, update the URL if needed, then Retry or Resume (partial progress is kept on disk).'
    );
  }
  if (/etimedout|timeout|timed out/.test(m)) {
    return 'The download timed out waiting for the file host. Retry or Resume — partial progress is saved.';
  }
  return raw || 'Download failed';
}

async function deletePrivateJob(id) {
  await pool.query('DELETE FROM downloads WHERE id = ? AND private = 1', [id]);
}

/** Remove private rows that are finished so 18+ activity is not persisted. */
async function purgeStalePrivate() {
  try {
    await pool.query(
      `DELETE FROM downloads
       WHERE private = 1
         AND status IN ('completed', 'cancelled', 'failed')`,
    );
  } catch (err) {
    log.warn('purge of finished 18+ jobs failed', { error: err.message });
  }
}

async function ensurePrivateFilename(id, row, jobUrl) {
  if (!row.private || row.filename) return row.filename;
  let fn = filenameFromUrl(jobUrl);
  if (row.type === 'media') {
    try {
      const info = await probeMedia(jobUrl);
      if (info.title) {
        fn = sanitizeFilename(info.title);
        const ext = row.media_kind === 'audio' ? '.mp3' : '.mp4';
        if (!path.extname(fn)) fn += ext;
      }
    } catch {
      /* keep URL-based name */
    }
  }
  fn = fn.slice(0, 255);
  await pool.query('UPDATE downloads SET filename = ? WHERE id = ?', [fn, id]);
  row.filename = fn;
  return fn;
}

async function markFailed(id, message, needsAuth = false) {
  await pool.query(
    `UPDATE downloads
     SET status = 'failed', error_message = ?, needs_auth = ?, updated_at = NOW()
     WHERE id = ?`,
    [message.slice(0, 2000), needsAuth ? 1 : 0, id],
  );
}

async function markCompleted(id, { filePath, fileSize, bytesDownloaded }) {
  await pool.query(
    `UPDATE downloads
     SET status = 'completed',
         progress = 100,
         file_path = ?,
         file_size = ?,
         bytes_downloaded = ?,
         error_message = NULL,
         needs_auth = 0,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = ?`,
    [filePath, fileSize, bytesDownloaded, id],
  );
}

async function updateProgress(id, { bytesDownloaded, fileSize, progress }) {
  await pool.query(
    `UPDATE downloads
     SET bytes_downloaded = ?,
         file_size = COALESCE(?, file_size),
         progress = ?,
         updated_at = NOW()
     WHERE id = ? AND status = 'downloading'`,
    [bytesDownloaded, fileSize, progress.toFixed(2), id],
  );
}

async function getJobControlStatus(id) {
  const [rows] = await pool.query('SELECT status FROM downloads WHERE id = ?', [id]);
  return rows[0]?.status || null;
}

function writeHeartbeat(standalone) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(
      HEARTBEAT_FILE,
      JSON.stringify({
        at: new Date().toISOString(),
        pid: process.pid,
        standalone: Boolean(standalone),
        activeJobs: activeJobs.size,
      }),
    );
  } catch {
    /* ignore */
  }
}

async function claimJob(id, isResume) {
  if (isResume) {
    const [result] = await pool.query(
      `UPDATE downloads
       SET status = 'downloading', error_message = NULL, updated_at = NOW()
       WHERE id = ? AND status IN ('queued', 'paused')`,
      [id],
    );
    return result.affectedRows > 0;
  }

  const [result] = await pool.query(
    `UPDATE downloads
     SET status = 'downloading', progress = 0, error_message = NULL, updated_at = NOW()
     WHERE id = ? AND status = 'queued'`,
    [id],
  );
  return result.affectedRows > 0;
}

async function runJob(row) {
  const id = row.id;
  const controller = new AbortController();
  activeJobs.set(id, controller);
  if (row.private) activePrivate.add(id);

  let controlTimer = null;

  const stopControlPoll = () => {
    if (controlTimer) clearInterval(controlTimer);
    controlTimer = null;
  };

  const applyControlSignal = async (status) => {
    if (status === 'cancelled') {
      pauseRequested.delete(id);
      controller.abort();
      return true;
    }
    if (status === 'paused') {
      pauseRequested.add(id);
      controller.abort();
      return true;
    }
    return false;
  };

  let jobUrl;
  let warpHeldForJob = false;
  try {
    try {
      jobUrl = prepareDownloadUrl(row.url);
    } catch (err) {
      throw new Error(err.message || 'Invalid URL — only http and https are supported');
    }

    if (row.type !== 'media') {
      await assertDownloadUrlAllowed(jobUrl);
    }

    const destDir = resolveDestination(row.category);
    const isResume = row.type !== 'media' && hasPartialJob(destDir, id);

    const claimed = await claimJob(id, isResume);
    if (!claimed) {
      const status = await getJobControlStatus(id);
      if (status === 'cancelled' && row.type !== 'media') {
        cleanupSegmentedJob(destDir, id);
      }
      return;
    }

    // Hold one WARP session for the entire job so probe + download share
    // a single connect/disconnect instead of two separate cycles.
    if (row.private && usesWarpForUrl(jobUrl)) {
      await beginAdultWarpForUrl(jobUrl);
      warpHeldForJob = true;
    }

    if (row.private) {
      log.info(`started 18+ download #${id} (WARP on, runs exclusively)`, {
        id,
        category: row.category,
        resume: isResume,
      });
      await ensurePrivateFilename(id, row, jobUrl);
    } else {
      log.info(`started download #${id}`, {
        id,
        url: row.url,
        category: row.category,
        type: row.type,
        resume: isResume,
      });
    }

    controlTimer = setInterval(async () => {
      try {
        const status = await getJobControlStatus(id);
        await applyControlSignal(status);
      } catch {
        /* ignore poll errors */
      }
    }, CONTROL_POLL_MS);

    const onProgress = async (stats) => {
      const status = await getJobControlStatus(id);
      if (await applyControlSignal(status)) return;
      await updateProgress(id, stats);
    };

    const auth = consumeJobCredentials(id);

    const rawResult =
      row.type === 'media'
        ? await downloadMedia({
            url: jobUrl,
            destDir,
            signal: controller.signal,
            formatId: row.format_id,
            kind: row.media_kind || 'video',
            onProgress,
            auth,
          })
        : await downloadSegmented({
            url: jobUrl,
            destDir,
            jobId: id,
            connections: row.connections || DEFAULT_CONNECTIONS,
            filename: row.filename || null,
            signal: controller.signal,
            onProgress,
            auth,
          });

    const renamed = await maybeRenameDownload(row, rawResult);
    const result = {
      ...renamed,
      filePath: finalizeDownloadPath(renamed.filePath, row.category),
    };

    if (row.private) {
      // 18+ download: keep the file on disk, but leave no DB trace.
      await deletePrivateJob(id);
      log.info(`completed 18+ download #${id} (WARP off, purged from DB)`, { id });
    } else {
      await markCompleted(id, result);
      log.info(`completed download #${id}`, { id, file: result.filePath });
    }
    clearJobCredentials(id);
  } catch (err) {
    const destDir = resolveDestination(row.category);
    const hasPartial = row.type !== 'media' && hasPartialJob(destDir, id);

    if (isAbortLikeError(err)) {
      const dbStatus = await getJobControlStatus(id);
      if (pauseRequested.has(id) || dbStatus === 'paused') {
        await pool.query(
          `UPDATE downloads SET status = 'paused', updated_at = NOW() WHERE id = ?`,
          [id],
        );
        log.info(`paused download #${id}${row.private ? ' (WARP off)' : ''}`, { id });
      } else {
        if (row.type !== 'media') {
          cleanupSegmentedJob(resolveDestination(row.category), id);
        }
        clearJobCredentials(id);
        if (row.private) {
          await deletePrivateJob(id);
          log.info(`cancelled 18+ download #${id} (WARP off, purged from DB)`, { id });
        } else {
          await pool.query(
            `UPDATE downloads SET status = 'cancelled', needs_auth = 0, updated_at = NOW() WHERE id = ?`,
            [id],
          );
          log.info(`cancelled download #${id}`, { id });
        }
      }
    } else if (hasPartial && isConnectionDropError(err)) {
      clearJobCredentials(id);
      const message = friendlyHttpDownloadError(err.message);
      await pool.query(
        `UPDATE downloads SET status = 'paused', error_message = ?, updated_at = NOW() WHERE id = ?`,
        [message.slice(0, 2000), id],
      );
      log.warn(`paused download #${id} after connection drop (partial saved on disk)`, {
        id,
        error: err.message,
      });
    } else {
      const rawMessage = err.message || 'Download failed';
      const needsAuth = err.authRequired === true || isAuthError(rawMessage);
      clearJobCredentials(id);
      const message = needsAuth
        ? 'This link requires a login. Add a username and password to continue.'
        : friendlyHttpDownloadError(rawMessage);
      if (row.private) {
        await deletePrivateJob(id);
        log.error(`failed 18+ download #${id} (WARP off, purged from DB)`, {
          id,
          needsAuth,
          error: rawMessage,
        });
      } else {
        await markFailed(id, message, needsAuth);
        log.error(`failed download #${id}${needsAuth ? ' (needs auth)' : ''}`, {
          id,
          needsAuth,
          error: rawMessage,
          url: row.url,
        });
      }
    }
  } finally {
    stopControlPoll();
    activeJobs.delete(id);
    activePrivate.delete(id);
    pauseRequested.delete(id);
    if (warpHeldForJob) {
      await releaseAdultWarpForUrl(jobUrl).catch(() => {});
    }
  }
}

let purgeTick = 0;

async function pollQueue(standalone) {
  writeHeartbeat(standalone);

  // Periodically purge finished 18+ rows (every ~30 polls).
  if (purgeTick++ % 30 === 0) await purgeStalePrivate();

  // An 18+ download runs exclusively — while one is active, start nothing else
  // (this keeps WARP scoped to a single adult job at a time).
  if (activePrivate.size > 0) return;
  if (activeJobs.size >= MAX_CONCURRENT) return;

  const activeIds = [...activeJobs.keys()];

  // Look at the FIFO head window so we can detect a pending adult job.
  let query = `SELECT id, url, category, type, format_id, media_kind, connections, filename, title, ai_rename, private FROM downloads
               WHERE status = 'queued'
               ORDER BY created_at ASC
               LIMIT ?`;
  const params = [MAX_CONCURRENT];

  if (activeIds.length > 0) {
    query = `SELECT id, url, category, type, format_id, media_kind, connections, filename, title, ai_rename, private FROM downloads
             WHERE status = 'queued' AND id NOT IN (?)
             ORDER BY created_at ASC
             LIMIT ?`;
    params.unshift(activeIds);
  }

  const [rows] = await pool.query(query, params);

  for (const row of rows) {
    if (row.private) {
      // 18+ job: only start it when the server is fully idle (no other downloads),
      // and start nothing alongside it. WARP turns on as it begins.
      if (activeJobs.size === 0) {
        log.info(`queueing 18+ #${row.id} to run exclusively (queue idle, WARP will start)`, {
          id: row.id,
        });
        runJob(row);
      } else {
        log.debug(`18+ #${row.id} waiting — ${activeJobs.size} download(s) still active`, {
          id: row.id,
          active: activeJobs.size,
        });
      }
      break;
    }

    // Regular job: fill remaining slots, but never alongside a pending adult job.
    if (activeJobs.size >= MAX_CONCURRENT) break;
    runJob(row);
  }
}

/** Fast in-process abort (same Node process as worker). DB status is the source of truth across processes. */
export function cancelDownload(id) {
  const controller = activeJobs.get(id);
  if (controller) {
    pauseRequested.delete(id);
    controller.abort();
    return true;
  }
  return false;
}

export function pauseDownload(id) {
  const controller = activeJobs.get(id);
  if (controller) {
    pauseRequested.add(id);
    controller.abort();
    return true;
  }
  return false;
}

async function recoverOrphanedJobs() {
  const [rows] = await pool.query(
    `SELECT id FROM downloads WHERE status = 'downloading'`,
  );
  if (!rows.length) return;

  for (const row of rows) {
    await pool.query(
      `UPDATE downloads SET status = 'queued', error_message = NULL, updated_at = NOW() WHERE id = ?`,
      [row.id],
    );
  }
  log.warn(`re-queued ${rows.length} orphaned job(s) after restart`, { count: rows.length });
}

export function startDownloadWorker({ standalone = false } = {}) {
  log.info(`worker started`, { maxConcurrent: MAX_CONCURRENT, pollMs: POLL_MS, standalone });
  recoverOrphanedJobs()
    .catch((err) => log.error('recovery error', { error: err.message }))
    .finally(() => {
      pollQueue(standalone).catch((err) => log.error('poll error', { error: err.message }));
      setInterval(() => {
        pollQueue(standalone).catch((err) => log.error('poll error', { error: err.message }));
      }, POLL_MS);
    });
}

export function getWorkerHeartbeatPath() {
  return HEARTBEAT_FILE;
}

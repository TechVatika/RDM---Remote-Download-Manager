import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { pool } from '../db/pool.js';
import { tempBase } from '../config/paths.js';
import { logger } from './logger.js';

const log = logger.child('staging-cleanup');

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
const STATE_FILE = path.join(DATA_DIR, 'staging-cleanup.json');

const INTERVAL_HOURS = Math.max(
  1,
  Number(process.env.STAGING_CLEANUP_INTERVAL_HOURS) || 24,
);
const CHECK_MS = Math.max(60_000, Number(process.env.STAGING_CLEANUP_CHECK_MS) || 3_600_000);
const ENABLED = process.env.STAGING_CLEANUP_ENABLED !== 'false';

async function readState() {
  try {
    const raw = await fsp.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { lastRunAt: null, lastResult: null };
  }
}

async function writeState(state) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function countActiveDownloads() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM downloads WHERE status IN ('queued', 'downloading', 'paused')`,
  );
  return Number(rows[0]?.n) || 0;
}

async function removeEntry(fullPath, entry, stats) {
  if (entry.isFile()) {
    const size = (await fsp.stat(fullPath)).size;
    await fsp.unlink(fullPath);
    stats.files += 1;
    stats.bytes += size;
    return;
  }

  if (entry.isDirectory()) {
    const nested = await fsp.readdir(fullPath, { withFileTypes: true });
    for (const child of nested) {
      await removeEntry(path.join(fullPath, child.name), child, stats);
    }
    await fsp.rmdir(fullPath);
    stats.dirs += 1;
  }
}

/**
 * Delete everything under the staging folder when no downloads are active.
 * Completed files already live in DOWNLOAD_FINAL_PATH.
 */
export async function cleanupStagingIfIdle({ force = false } = {}) {
  if (!ENABLED) {
    return { skipped: true, reason: 'disabled' };
  }

  const state = await readState();
  const now = Date.now();
  const intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;

  if (!force && state.lastRunAt && now - state.lastRunAt < intervalMs) {
    return {
      skipped: true,
      reason: 'interval',
      nextRunAt: new Date(state.lastRunAt + intervalMs).toISOString(),
    };
  }

  const active = await countActiveDownloads();
  if (active > 0) {
    return { skipped: true, reason: 'active_downloads', active };
  }

  await fsp.mkdir(tempBase, { recursive: true });

  const stats = { files: 0, dirs: 0, bytes: 0 };
  const entries = await fsp.readdir(tempBase, { withFileTypes: true });

  for (const entry of entries) {
    await removeEntry(path.join(tempBase, entry.name), entry, stats);
  }

  const result = {
    cleaned: true,
    path: tempBase,
    removedFiles: stats.files,
    removedDirs: stats.dirs,
    freedBytes: stats.bytes,
    at: new Date().toISOString(),
  };

  await writeState({ lastRunAt: now, lastResult: result });

  if (stats.files || stats.dirs) {
    log.info(
      `staging cleaned (${stats.files} file(s), ${stats.dirs} folder(s), ${stats.bytes} bytes freed)`,
      result,
    );
  } else {
    log.info('staging already empty', { path: tempBase });
  }

  return result;
}

export function getStagingCleanupConfig() {
  return {
    enabled: ENABLED,
    stagingPath: tempBase,
    intervalHours: INTERVAL_HOURS,
    checkMs: CHECK_MS,
  };
}

export async function getStagingCleanupStatus() {
  const state = await readState();
  const active = await pool
    .query(`SELECT COUNT(*) AS n FROM downloads WHERE status IN ('queued', 'downloading', 'paused')`)
    .then(([rows]) => Number(rows[0]?.n) || 0)
    .catch(() => null);

  let stagingFiles = 0;
  let stagingBytes = 0;
  try {
    const entries = await fsp.readdir(tempBase, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      stagingFiles += 1;
      stagingBytes += (await fsp.stat(path.join(tempBase, entry.name))).size;
    }
  } catch {
    /* ignore */
  }

  const lastRunAt = state.lastRunAt || null;
  const nextRunAt =
    lastRunAt && ENABLED
      ? new Date(lastRunAt + INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
      : null;

  return {
    ...getStagingCleanupConfig(),
    activeDownloads: active,
    stagingFiles,
    stagingBytes,
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    lastResult: state.lastResult || null,
    nextRunAt: active ? null : nextRunAt,
  };
}

/** Hourly check — runs full cleanup at most once per interval when idle. */
export function startStagingCleanupScheduler() {
  if (!ENABLED) {
    log.info('staging cleanup scheduler disabled');
    return;
  }

  log.info('staging cleanup scheduler started', {
    path: tempBase,
    intervalHours: INTERVAL_HOURS,
    checkMs: CHECK_MS,
  });

  const tick = () => {
    cleanupStagingIfIdle().catch((err) => {
      log.error('staging cleanup failed', { error: err.message });
    });
  };

  // First pass shortly after worker boot (stale .part files from crashes).
  setTimeout(tick, 30_000);
  setInterval(tick, CHECK_MS);
}

/**
 * Shared application logger — persisted to the SQL database.
 *
 * The API (rdm-backend) and the download worker (rdm-worker) are separate
 * processes, so logs are written to a shared `app_logs` table that the API
 * reads for the in-app Logs viewer. Entries are buffered in memory and flushed
 * in batches so logging never blocks a request or a download. Every entry is
 * also echoed to the console so PM2's own logs keep working.
 *
 * Privacy: never pass 18+/private URLs or titles into the logger — callers log
 * those jobs by id only.
 */
import { pool } from '../db/pool.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

const FLUSH_MS = Number(process.env.LOG_FLUSH_MS) || 1500;
const FLUSH_AT = 50; // flush early once this many entries are buffered
const BUFFER_CAP = 2000; // drop oldest beyond this if the DB is unavailable
const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS) || 14;

let procLabel = process.env.RDM_PROC || 'api';
let buffer = [];
let flushing = false;
let flushTimer = null;
let pruneCounter = 0;

/** Label this process ('api' or 'worker') so log lines show their origin. */
export function setLogContext(label) {
  if (label) procLabel = String(label);
}

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flush().catch(() => {});
  }, FLUSH_MS);
  if (flushTimer.unref) flushTimer.unref();
}

async function flush() {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer;
  buffer = [];
  try {
    const rows = batch.map((e) => [
      e.at,
      e.level,
      e.proc,
      e.scope,
      e.msg,
      e.meta ? JSON.stringify(e.meta) : null,
    ]);
    await pool.query(
      'INSERT INTO app_logs (created_at, level, proc, scope, message, meta) VALUES ?',
      [rows],
    );

    // Periodic retention prune (every ~200 flushes).
    if (pruneCounter++ % 200 === 0) {
      await pool
        .query('DELETE FROM app_logs WHERE created_at < (NOW() - INTERVAL ? DAY)', [RETENTION_DAYS])
        .catch(() => {});
    }
  } catch {
    // DB unavailable (e.g. during startup) — requeue, capped to avoid growth.
    buffer = batch.concat(buffer);
    if (buffer.length > BUFFER_CAP) buffer = buffer.slice(buffer.length - BUFFER_CAP);
  } finally {
    flushing = false;
  }
}

function write(level, scope, message, meta) {
  if ((LEVELS[level] ?? 99) < MIN_LEVEL) return;

  const entry = {
    at: new Date(),
    level,
    proc: procLabel,
    scope: scope || '-',
    msg: typeof message === 'string' ? message : String(message),
    meta: meta && typeof meta === 'object' && Object.keys(meta).length ? meta : null,
  };

  const line = `[${entry.at.toISOString()}] ${level.toUpperCase().padEnd(5)} [${entry.proc}:${entry.scope}] ${entry.msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  buffer.push(entry);
  if (buffer.length > BUFFER_CAP) buffer.shift();
  ensureFlushTimer();
  if (buffer.length >= FLUSH_AT) flush().catch(() => {});
}

export const logger = {
  debug: (scope, msg, meta) => write('debug', scope, msg, meta),
  info: (scope, msg, meta) => write('info', scope, msg, meta),
  warn: (scope, msg, meta) => write('warn', scope, msg, meta),
  error: (scope, msg, meta) => write('error', scope, msg, meta),
  /** Bind a scope once, e.g. const log = logger.child('warp'). */
  child: (scope) => ({
    debug: (msg, meta) => write('debug', scope, msg, meta),
    info: (msg, meta) => write('info', scope, msg, meta),
    warn: (msg, meta) => write('warn', scope, msg, meta),
    error: (msg, meta) => write('error', scope, msg, meta),
  }),
};

/** Force a flush (used before reads so just-logged entries are visible). */
export async function flushLogs() {
  await flush();
}

/**
 * Read recent log entries from the shared DB table (newest first).
 */
export async function readLogs({ limit = 300, level, scope, q } = {}) {
  await flush().catch(() => {});

  const where = [];
  const params = [];
  if (level && level !== 'all') {
    where.push('level = ?');
    params.push(level);
  }
  if (scope && scope !== 'all') {
    where.push('scope = ?');
    params.push(scope);
  }
  if (q) {
    where.push('(message LIKE ? OR scope LIKE ? OR CAST(meta AS CHAR) LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const cap = Math.min(Math.max(Number(limit) || 300, 1), 1000);
  const sql =
    `SELECT created_at, level, proc, scope, message, meta FROM app_logs` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY id DESC LIMIT ${cap}`;

  try {
    const [rows] = await pool.query(sql, params);
    return rows.map((r) => ({
      t: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
      level: r.level,
      proc: r.proc,
      scope: r.scope,
      msg: r.message,
      meta: parseMeta(r.meta),
    }));
  } catch {
    return [];
  }
}

function parseMeta(meta) {
  if (meta == null) return undefined;
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta);
  } catch {
    return undefined;
  }
}

/** Distinct scopes seen in the log table (for the viewer's filter). */
export async function listLogScopes() {
  try {
    const [rows] = await pool.query(
      'SELECT DISTINCT scope FROM app_logs ORDER BY scope ASC LIMIT 100',
    );
    return rows.map((r) => r.scope);
  } catch {
    return [];
  }
}

/** Wipe all stored logs and the in-memory buffer. */
export async function clearLogs() {
  buffer = [];
  try {
    await pool.query('TRUNCATE TABLE app_logs');
  } catch {
    try {
      await pool.query('DELETE FROM app_logs');
    } catch {
      /* ignore */
    }
  }
}

import { Router } from 'express';
import fs from 'fs/promises';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { pingDatabase, pool } from '../db/pool.js';
import { tempBase, finalBase } from '../config/paths.js';
import { getAiRenameConfig } from '../utils/aiRename.js';
import { getAuthStatus } from '../config/cookies.js';
import { getSpeedConfig } from '../config/speed.js';
import { getWorkerHeartbeatPath } from '../worker/downloadWorker.js';
import { readLogs, listLogScopes, clearLogs, logger } from '../utils/logger.js';

const router = Router();
const execFileAsync = promisify(execFile);

async function folderStats(dir) {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let fileCount = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    fileCount += 1;
    const stat = await fs.stat(`${dir}/${entry.name}`);
    totalBytes += stat.size;
  }
  return { fileCount, totalBytes };
}

function securitySummary(req) {
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ssrfStrict = process.env.SSRF_STRICT === 'true';
  const jwtSecret = process.env.JWT_SECRET || '';
  const https =
    Boolean(req?.secure) || req?.headers?.['x-forwarded-proto'] === 'https';

  return {
    authentication: { method: 'JWT (Bearer)', passwordHashing: 'bcrypt' },
    jwt: {
      configured: jwtSecret.length >= 16,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    rateLimiting: { enabled: true, login: '10 / 15 min', api: '6000 / 5 min' },
    securityHeaders: true,
    ssrfProtection: {
      enabled: true,
      strict: ssrfStrict,
      blocks: [
        'loopback (127.0.0.1, ::1)',
        'link-local & cloud metadata (169.254.0.0/16)',
        'unspecified / reserved ranges',
        ...(ssrfStrict ? ['private LAN (RFC 1918)'] : []),
      ],
    },
    cors: { restricted: corsOrigins.length > 0, origins: corsOrigins },
    cookieEncryption: 'AES-256-GCM',
    publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
    https,
  };
}

async function readWorkerHeartbeat() {
  try {
    const raw = await fs.readFile(getWorkerHeartbeatPath(), 'utf8');
    const data = JSON.parse(raw);
    const ageMs = Date.now() - new Date(data.at).getTime();
    return {
      alive: ageMs < 15000,
      lastSeen: data.at,
      pid: data.pid,
      standalone: Boolean(data.standalone),
      activeJobs: data.activeJobs ?? null,
      ageMs,
    };
  } catch {
    return { alive: false, lastSeen: null, standalone: null, activeJobs: null };
  }
}

async function ytdlpVersion() {
  const bin = process.env.YTDLP_BIN || 'yt-dlp';
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 8000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

router.get('/', async (_req, res) => {
  let database = 'disconnected';
  let queueStats = null;

  try {
    await pingDatabase();
    database = 'connected';
    const [rows] = await pool.query(`
      SELECT
        SUM(status IN ('queued','downloading','paused')) AS active,
        SUM(status = 'queued') AS queued,
        SUM(status = 'downloading') AS downloading,
        SUM(status = 'paused') AS paused
      FROM downloads
    `);
    queueStats = rows[0];
  } catch {
    database = 'disconnected';
  }

  const storage = {
    staging: { path: tempBase, ...(await folderStats(tempBase)) },
    final: { path: finalBase, ...(await folderStats(finalBase)) },
  };

  const authStatus = getAuthStatus();
  const workerHeartbeat = await readWorkerHeartbeat();

  res.json({
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
    security: securitySummary(_req),
    uptime: Math.floor(process.uptime()),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
    },
    worker: {
      maxConcurrent: getSpeedConfig().maxConcurrentDownloads,
      pollMs: getSpeedConfig().workerPollMs,
      queue: queueStats,
      process: workerHeartbeat,
      remoteDownloads: true,
      note: 'Downloads run on the server. Closing your browser tab does not stop them.',
    },
    engines: {
      ytdlp: {
        bin: process.env.YTDLP_BIN || 'yt-dlp',
        version: await ytdlpVersion(),
      },
      ffmpeg: {
        available: await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 })
          .then(() => true)
          .catch(() => false),
      },
    },
    storage,
    publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
    aiRename: getAiRenameConfig(),
    platformAuth: {
      configured: authStatus.configured,
      method: authStatus.method,
    },
  });
});

router.get('/security', (req, res) => {
  res.json(securitySummary(req));
});

// Recent application logs (downloads, WARP, queue, API). Pulled from the shared
// log file so worker logs show up even though the API is a separate process.
router.get('/logs', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
  const level = typeof req.query.level === 'string' ? req.query.level : undefined;
  const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;

  const [entries, scopes] = await Promise.all([
    readLogs({ limit, level, scope, q }),
    listLogScopes(),
  ]);
  res.json({ entries, scopes });
});

router.delete('/logs', async (req, res) => {
  await clearLogs();
  logger.warn('api', 'logs cleared by user', { user: req.user?.username || 'unknown' });
  res.json({ cleared: true });
});

export default router;

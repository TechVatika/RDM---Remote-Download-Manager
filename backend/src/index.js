import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, pingDatabase, ensureSchema } from './db/pool.js';
import downloadsRouter from './routes/downloads.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import statsRouter from './routes/stats.js';
import platformsRouter from './routes/platforms.js';
import settingsRouter from './routes/settings.js';
import filesRouter from './routes/files.js';
import systemRouter from './routes/system.js';
import updatesRouter from './routes/updates.js';
import { requireAuth } from './middleware/auth.js';
import { securityHeaders, createRateLimiter } from './middleware/security.js';
import { seedAdminUser } from './utils/seedAdmin.js';
import { disconnectWarpWhenIdle } from './config/warpProxy.js';
import { startDownloadWorker } from './worker/downloadWorker.js';
import { startAutoUpdateScheduler } from './utils/autoUpdateScheduler.js';
import { logger, setLogContext } from './utils/logger.js';

setLogContext('api');
const log = logger.child('api');

const app = express();
const port = Number(process.env.PORT) || 3000;

// Behind the vite/reverse proxy, trust only loopback so req.ip is meaningful
// without letting arbitrary clients spoof X-Forwarded-For.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// Restrict cross-origin access when CORS_ORIGINS is set (comma-separated).
// Tokens are Bearer (not cookies), so default stays permissive to avoid
// breaking proxied setups; lock it down by setting CORS_ORIGINS in .env.
const corsAllow = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// If no explicit CORS_ORIGINS, derive from APP_DOMAIN so the app is portable
// across servers/domains by changing a single env var.
if (!corsAllow.length && process.env.APP_DOMAIN) {
  const d = process.env.APP_DOMAIN.trim().replace(/^https?:\/\//, '');
  corsAllow.push(`https://${d}`, `http://${d}`);
}

app.use(securityHeaders);
app.use(cors(corsAllow.length ? { origin: corsAllow } : {}));
app.use(express.json({ limit: '256kb' }));

// Strict limiter for credential endpoints (brute-force protection); generous
// global backstop that won't interfere with the dashboard's 2s polling.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Try again in a few minutes.',
});
const apiLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 6000 });

app.use('/api', apiLimiter);

app.use('/api/health', healthRouter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/change-password', loginLimiter);
app.use('/api/auth', authRouter);
app.use('/api/stats', requireAuth, statsRouter);
app.use('/api/platforms', requireAuth, platformsRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/system', requireAuth, systemRouter);
app.use('/api/updates', requireAuth, updatesRouter);
app.use('/api/downloads', requireAuth, downloadsRouter);

app.use((err, _req, res, _next) => {
  log.error('unhandled request error', { error: err?.message || String(err) });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await pingDatabase();
    log.info('database connected');
    await ensureSchema();
    await seedAdminUser();
    await disconnectWarpWhenIdle();
  } catch (err) {
    log.warn('database not available yet', { error: err.message });
  }

  app.listen(port, () => {
    log.info(`API listening on http://localhost:${port}`, { port });
    startAutoUpdateScheduler();
    if (process.env.EMBED_WORKER === 'true') {
      log.info('embedded download worker enabled');
      startDownloadWorker({ standalone: false });
    } else {
      log.info('download worker runs separately (rdm-worker PM2 process)');
    }
  });
}

start();

export { app, pool };

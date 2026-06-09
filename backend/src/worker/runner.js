/**
 * Standalone download worker — runs independently of the HTTP API.
 * Closing the browser tab or restarting the API does not stop active downloads.
 */
import 'dotenv/config';
import { pingDatabase, ensureSchema } from '../db/pool.js';
import { disconnectWarpWhenIdle } from '../config/warpProxy.js';
import { startDownloadWorker } from './downloadWorker.js';
import { logger, setLogContext } from '../utils/logger.js';

setLogContext('worker');
const log = logger.child('worker');

async function main() {
  await pingDatabase();
  await ensureSchema();
  await disconnectWarpWhenIdle();
  log.info('database connected, WARP off (idle)');
  startDownloadWorker({ standalone: true });
}

main().catch((err) => {
  log.error('fatal error, exiting', { error: err.message });
  process.exit(1);
});

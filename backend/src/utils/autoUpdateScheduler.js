import { appendUpdateLog, fetchUpdateStatus, runUpdateScript } from './gitUpdate.js';
import { logger } from './logger.js';

const log = logger.child('auto-update');

let timer = null;
let running = false;

export async function runAutoUpdateCheck() {
  if (running) return null;
  running = true;
  try {
    const status = await fetchUpdateStatus({ fetchRemote: true });
    if (!status.ok) {
      await appendUpdateLog(`Check failed: ${status.error}`);
      log.warn('auto-update check failed', { error: status.error });
      return status;
    }

    if (!status.updateAvailable) {
      await appendUpdateLog(`Up to date (${status.local} on ${status.branch})`);
      return status;
    }

    await appendUpdateLog(
      `Update available: ${status.behindBy} commit(s) behind (${status.local} → ${status.remote})`,
    );

    const apply =
      process.env.AUTO_UPDATE_APPLY === 'true' || process.env.AUTO_UPDATE_APPLY === '1';
    if (!apply) {
      await appendUpdateLog('Auto-apply disabled — use Updates tab or set AUTO_UPDATE_APPLY=true');
      return status;
    }

    await appendUpdateLog('Auto-apply enabled — running update script…');
    const result = await runUpdateScript({
      onLine: (msg) => appendUpdateLog(msg).catch(() => {}),
    });
    if (!result.success) {
      await appendUpdateLog(`Update script exited with code ${result.code}`);
    }
    return status;
  } catch (err) {
    await appendUpdateLog(`Check error: ${err.message}`);
    log.error('auto-update error', { error: err.message });
    return null;
  } finally {
    running = false;
  }
}

export function startAutoUpdateScheduler() {
  if (process.env.AUTO_UPDATE_CHECK_ENABLED === 'false') {
    log.info('auto-update scheduler disabled');
    return;
  }

  const intervalMs = Number(process.env.AUTO_UPDATE_CHECK_MS) || 300000;
  log.info('auto-update scheduler started', { intervalMs });

  const tick = () => {
    runAutoUpdateCheck().catch(() => {});
  };

  setTimeout(tick, 60_000);
  timer = setInterval(tick, intervalMs);
}

export function stopAutoUpdateScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

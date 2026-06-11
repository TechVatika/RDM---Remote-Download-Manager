import { Router } from 'express';
import fs from 'fs/promises';

import {
  APP_DIR,
  UPDATE_LOG,
  UPDATE_SCRIPT,
  GITHUB_REPO_URL,
  fetchUpdateStatus,
  runUpdateScript,
  appendUpdateLog,
} from '../utils/gitUpdate.js';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await fetchUpdateStatus({ fetchRemote: true });
    if (!status.ok) {
      return res.status(502).json({ error: status.error, ...status });
    }
    res.json({
      ...status,
      lastUpdated: status.lastLogAt,
      appDir: APP_DIR,
      updateScript: UPDATE_SCRIPT,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/changelog', async (_req, res) => {
  try {
    const status = await fetchUpdateStatus({ fetchRemote: true });
    if (!status.ok) {
      return res.status(502).json({ error: status.error });
    }
    res.json({
      repoUrl: GITHUB_REPO_URL,
      updateAvailable: status.updateAvailable,
      behindBy: status.behindBy,
      incoming: status.incomingCommits || [],
      recent: status.recentCommits || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/check', async (_req, res) => {
  try {
    await appendUpdateLog('Manual check from Updates tab');
    const status = await fetchUpdateStatus({ fetchRemote: true });
    if (!status.ok) {
      await appendUpdateLog(`Check failed: ${status.error}`);
      return res.status(502).json({ error: status.error });
    }
    if (status.updateAvailable) {
      await appendUpdateLog(
        `Update available: ${status.behindBy} commit(s) (${status.local} → ${status.remote})`,
      );
    } else {
      await appendUpdateLog(`Up to date (${status.local})`);
    }
    res.json({
      updateAvailable: status.updateAvailable,
      local: status.local,
      remote: status.remote,
      behindBy: status.behindBy,
      incomingCommits: status.incomingCommits,
      lastUpdated: status.lastLogAt,
      repoUrl: GITHUB_REPO_URL,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  send({ type: 'start', msg: 'Starting update from GitHub…' });
  await appendUpdateLog('Manual update started from Updates tab');

  try {
    const result = await runUpdateScript({
      onLine: (msg) => {
        send({ type: 'log', msg });
        appendUpdateLog(msg).catch(() => {});
      },
    });
    send({ type: 'done', code: result.code, success: result.success });
    if (result.success) {
      await appendUpdateLog('Manual update finished successfully');
    } else {
      await appendUpdateLog(`Manual update failed (exit ${result.code})`);
    }
  } catch (err) {
    send({ type: 'log', msg: `ERROR: ${err.message}` });
    send({ type: 'done', code: 1, success: false });
    await appendUpdateLog(`Manual update error: ${err.message}`);
  }

  res.end();
  req.on('close', () => {});
});

router.get('/logs', async (req, res) => {
  try {
    const lines = Math.min(Number(req.query.lines) || 200, 1000);
    const content = await fs.readFile(UPDATE_LOG, 'utf8');
    const all = content.trim().split('\n').filter(Boolean);
    res.json({ lines: all.slice(-lines), total: all.length, path: UPDATE_LOG });
  } catch {
    res.json({ lines: [], total: 0, path: UPDATE_LOG });
  }
});

export default router;

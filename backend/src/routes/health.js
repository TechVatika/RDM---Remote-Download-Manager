import { Router } from 'express';
import { pingDatabase } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'disconnected' });
  }
});

export default router;

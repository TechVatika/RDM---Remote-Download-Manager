import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status IN ('queued','downloading','paused')) AS active,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        SUM(status = 'cancelled') AS cancelled,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS total_bytes,
        COALESCE(SUM(bytes_downloaded), 0) AS bytes_in_progress
      FROM downloads
      WHERE private = 0
    `);

    const [byType] = await pool.query(`
      SELECT type, COUNT(*) AS count
      FROM downloads
      WHERE private = 0
      GROUP BY type
    `);

    res.json({ summary: rows[0], byType });
  } catch (err) {
    next(err);
  }
});

router.get('/detailed', async (_req, res, next) => {
  try {
    const [summaryRows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status IN ('queued','downloading','paused')) AS active,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        SUM(status = 'cancelled') AS cancelled,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS total_bytes,
        COALESCE(AVG(CASE WHEN status = 'completed' AND file_size > 0 THEN file_size END), 0) AS avg_file_size
      FROM downloads
      WHERE private = 0
    `);

    const [byCategory] = await pool.query(`
      SELECT
        category,
        COUNT(*) AS count,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS bytes
      FROM downloads
      WHERE private = 0
      GROUP BY category
      ORDER BY count DESC
    `);

    const [byStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM downloads
      WHERE private = 0
      GROUP BY status
      ORDER BY count DESC
    `);

    const [activityByDay] = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM downloads
      WHERE private = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const [recentCompleted] = await pool.query(`
      SELECT id, title, url, file_size, category, completed_at
      FROM downloads
      WHERE private = 0 AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 8
    `);

    res.json({
      summary: summaryRows[0],
      byCategory,
      byStatus,
      activityByDay,
      recentCompleted,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

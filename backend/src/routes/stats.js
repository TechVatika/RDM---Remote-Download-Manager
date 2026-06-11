import { Router } from 'express';
import { pool } from '../db/pool.js';
const router = Router();

const HOST_LABELS = {
  'www.youtube.com': 'YouTube',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'm.youtube.com': 'YouTube',
  'music.youtube.com': 'YouTube Music',
  'www.instagram.com': 'Instagram',
  'instagram.com': 'Instagram',
  'www.tiktok.com': 'TikTok',
  'tiktok.com': 'TikTok',
  'twitter.com': 'X / Twitter',
  'x.com': 'X / Twitter',
  'www.facebook.com': 'Facebook',
  'fb.watch': 'Facebook',
  'vimeo.com': 'Vimeo',
  'www.reddit.com': 'Reddit',
};

function hostLabel(host) {
  if (!host) return 'Unknown';
  const key = host.toLowerCase();
  if (HOST_LABELS[key]) return HOST_LABELS[key];
  if (key.includes('google')) return 'Google';
  if (key.includes('drive')) return 'Google Drive';
  return host.replace(/^www\./, '');
}

function fillDaySeries(rows, days = 14, valueKeys = ['count']) {
  const map = new Map();
  for (const row of rows) {
    const day = String(row.day).slice(0, 10);
    map.set(day, row);
  }
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key) || {};
    const entry = { day: key };
    for (const k of valueKeys) {
      entry[k] = Number(row[k]) || 0;
    }
    out.push(entry);
  }
  return out;
}

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
        SUM(status = 'paused') AS paused,
        SUM(status = 'queued') AS queued,
        SUM(status = 'downloading') AS downloading,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS total_bytes,
        COALESCE(SUM(bytes_downloaded), 0) AS bytes_in_progress,
        COALESCE(AVG(CASE WHEN status = 'completed' AND file_size > 0 THEN file_size END), 0) AS avg_file_size,
        COALESCE(MAX(CASE WHEN status = 'completed' THEN file_size END), 0) AS largest_file,
        COALESCE(AVG(CASE WHEN status = 'completed' AND completed_at IS NOT NULL
          THEN TIMESTAMPDIFF(SECOND, created_at, completed_at) END), 0) AS avg_duration_sec,
        COALESCE(AVG(CASE WHEN type = 'http' AND connections > 0 THEN connections END), 0) AS avg_connections,
        SUM(ai_rename = 1) AS ai_rename_jobs,
        SUM(needs_auth = 1) AS needs_auth_jobs
      FROM downloads
      WHERE private = 0
    `);

    const summary = summaryRows[0];
    const finished = Number(summary.completed) + Number(summary.failed) + Number(summary.cancelled);
    summary.success_rate = finished > 0 ? (Number(summary.completed) / finished) * 100 : 0;
    summary.failure_rate = finished > 0 ? (Number(summary.failed) / finished) * 100 : 0;

    const [byCategory] = await pool.query(`
      SELECT
        category,
        COUNT(*) AS count,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        SUM(status IN ('queued','downloading','paused')) AS active,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS bytes
      FROM downloads
      WHERE private = 0
      GROUP BY category
      ORDER BY bytes DESC, count DESC
    `);

    const [byStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM downloads
      WHERE private = 0
      GROUP BY status
      ORDER BY count DESC
    `);

    const [byType] = await pool.query(`
      SELECT
        type,
        COUNT(*) AS count,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS bytes
      FROM downloads
      WHERE private = 0
      GROUP BY type
      ORDER BY count DESC
    `);

    const [byMediaKind] = await pool.query(`
      SELECT
        COALESCE(media_kind, 'n/a') AS media_kind,
        COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS bytes
      FROM downloads
      WHERE private = 0 AND type = 'media'
      GROUP BY media_kind
      ORDER BY count DESC
    `);

    const [jobsByDay] = await pool.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM downloads
      WHERE private = 0 AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const [bytesByDay] = await pool.query(`
      SELECT DATE(completed_at) AS day,
        COUNT(*) AS completed_count,
        COALESCE(SUM(file_size), 0) AS bytes
      FROM downloads
      WHERE private = 0 AND status = 'completed'
        AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
      GROUP BY DATE(completed_at)
      ORDER BY day ASC
    `);

    const [byHour] = await pool.query(`
      SELECT HOUR(created_at) AS hour, COUNT(*) AS count
      FROM downloads
      WHERE private = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY HOUR(created_at)
      ORDER BY hour ASC
    `);

    const [byHost] = await pool.query(`
      SELECT
        LOWER(
          SUBSTRING_INDEX(
            SUBSTRING_INDEX(REPLACE(REPLACE(url, 'https://', ''), 'http://', ''), '/', 1),
            ':', 1
          )
        ) AS host,
        COUNT(*) AS count,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN file_size ELSE 0 END), 0) AS bytes
      FROM downloads
      WHERE private = 0
      GROUP BY host
      ORDER BY count DESC
      LIMIT 12
    `);

    const [topErrors] = await pool.query(`
      SELECT
        LEFT(COALESCE(NULLIF(TRIM(error_message), ''), 'Unknown error'), 120) AS error_message,
        COUNT(*) AS count
      FROM downloads
      WHERE private = 0 AND status = 'failed' AND error_message IS NOT NULL
      GROUP BY LEFT(COALESCE(NULLIF(TRIM(error_message), ''), 'Unknown error'), 120)
      ORDER BY count DESC
      LIMIT 8
    `);

    const [largestFiles] = await pool.query(`
      SELECT id, title, filename, url, file_size, category, type, completed_at
      FROM downloads
      WHERE private = 0 AND status = 'completed' AND file_size > 0
      ORDER BY file_size DESC
      LIMIT 10
    `);

    const [recentCompleted] = await pool.query(`
      SELECT id, title, filename, url, file_size, category, type, media_kind, completed_at
      FROM downloads
      WHERE private = 0 AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 10
    `);

    const [recentFailed] = await pool.query(`
      SELECT id, title, url, error_message, category, type, updated_at
      FROM downloads
      WHERE private = 0 AND status = 'failed'
      ORDER BY updated_at DESC
      LIMIT 6
    `);

    const activityByDay = fillDaySeries(jobsByDay, 14, ['count']);
    const volumeByDay = fillDaySeries(bytesByDay, 14, ['bytes', 'completed_count']);

    const hours = Array.from({ length: 24 }, (_, hour) => {
      const row = byHour.find((r) => Number(r.hour) === hour);
      return { hour, count: row ? Number(row.count) : 0 };
    });

    const byPlatform = byHost.map((row) => {
      let label = hostLabel(row.host);
      return {
        host: row.host,
        label,
        count: Number(row.count),
        completed: Number(row.completed),
        failed: Number(row.failed),
        bytes: Number(row.bytes),
      };
    });

    res.json({
      summary,
      byCategory,
      byStatus,
      byType,
      byMediaKind,
      byPlatform,
      activityByDay,
      volumeByDay,
      byHour: hours,
      topErrors,
      largestFiles,
      recentCompleted,
      recentFailed,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

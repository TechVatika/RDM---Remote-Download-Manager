import { Router } from 'express';
import path from 'path';
import { pool } from '../db/pool.js';
import { cancelDownload, pauseDownload, setJobCredentials } from '../worker/downloadWorker.js';
import { probeMedia } from '../worker/ytdlpDownload.js';
import { cleanupSegmentedJob } from '../worker/segmentedDownload.js';
import { resolveDestination } from '../config/paths.js';
import { filenameFromUrl } from '../utils/filename.js';
import { prepareDownloadUrl } from '../utils/mediaUrl.js';
import { isAdultSiteUrl } from '../data/adultSites.js';
import { resolveQueuedFilename, defaultHttpFilename } from '../utils/queueMetadata.js';
import { getAiRenameConfig, isAiRenameEnabled, suggestFilename } from '../utils/aiRename.js';
import { clampConnections, DEFAULT_CONNECTIONS } from '../config/speed.js';
import { resolveDownloadType, analyzeUrl } from '../utils/platformDetect.js';

const router = Router();

/** Strip display metadata from active 18+ rows (URL kept server-side for copy/retry only). */
function sanitizeDownloadRow(row) {
  if (!row || !Number(row.private)) return row;
  return { ...row, title: null, thumbnail: null };
}

const LIST_WHERE = `private = 0 OR status IN ('queued', 'downloading', 'paused')`;

// Inspect a media URL and return its available qualities/formats.
router.post('/probe', async (req, res, next) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const trimmed = prepareDownloadUrl(url.trim());
    const info = await probeMedia(trimmed);
    res.json(info);
  } catch (err) {
    res.status(err.message?.includes('blob:') || err.message?.includes('Invalid URL') ? 400 : 422).json({
      error: err.message || 'Could not read media info',
    });
  }
});

router.post('/suggest-name', async (req, res, next) => {
  const { url, category = 'general', title = null, type = 'http' } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const normalized = prepareDownloadUrl(url.trim());

    // 18+ sites: never send URL/title to the AI provider — keep a plain local name.
    if (isAdultSiteUrl(normalized)) {
      return res.json({ filename: filenameFromUrl(normalized), aiUsed: false });
    }

    let mediaTitle = title;
    let uploader = null;
    let extractor = null;

    if (type === 'media' && !mediaTitle) {
      const info = await probeMedia(normalized);
      mediaTitle = info.title;
      uploader = info.uploader;
      extractor = info.extractor;
    }

    const originalName = filenameFromUrl(normalized);
    const filename = await suggestFilename({
      url: normalized,
      title: mediaTitle,
      category,
      originalName,
      uploader,
      extractor,
    });

    res.json({
      filename,
      aiUsed: isAiRenameEnabled(),
    });
  } catch (err) {
    const code = /blob:|Invalid URL|required/i.test(err.message || '') ? 400 : 422;
    res.status(code).json({ error: err.message || 'Could not suggest filename' });
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, url, category, status, progress, file_path, file_size,
              bytes_downloaded, error_message, type, media_kind, title, thumbnail,
              connections, filename, needs_auth, private, created_at, updated_at, completed_at
       FROM downloads
       WHERE ${LIST_WHERE}
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    res.json(rows.map(sanitizeDownloadRow));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(sanitizeDownloadRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', async (req, res, next) => {
  const { urls, category = 'general', connections = 8, ai_rename = true } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }
  if (urls.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 URLs per batch' });
  }

  const conn = clampConnections(connections);
  const useAiRename = ai_rename !== false && ai_rename !== 0 ? 1 : 0;
  const queued = [];

  try {
    for (const raw of urls) {
      if (typeof raw !== 'string') continue;
      let trimmed;
      try {
        trimmed = prepareDownloadUrl(raw.trim());
      } catch {
        continue;
      }

      const dlType = resolveDownloadType(trimmed, 'http');
      const isMedia = dlType === 'media';
      const isPrivate = isAdultSiteUrl(trimmed);
      const queuedFilename = isPrivate
        ? await resolveQueuedFilename(trimmed, { type: dlType, isPrivate: true })
        : !isMedia
          ? defaultHttpFilename(trimmed)
          : null;

      const [result] = await pool.query(
        `INSERT INTO downloads (url, category, status, type, format_id, media_kind, connections, filename, ai_rename, private)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)`,
        [
          trimmed,
          category,
          dlType,
          isMedia ? 'best' : null,
          isMedia ? 'video' : null,
          isMedia ? null : conn,
          isMedia && !isPrivate ? null : queuedFilename,
          isPrivate ? 0 : useAiRename,
          isPrivate ? 1 : 0,
        ],
      );
      const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
        result.insertId,
      ]);
      queued.push(sanitizeDownloadRow(rows[0]));
    }

    if (!queued.length) {
      return res.status(400).json({ error: 'No valid URLs in batch' });
    }

    res.status(201).json({ count: queued.length, items: queued });
  } catch (err) {
    next(err);
  }
});

router.post('/clear-completed', async (_req, res, next) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM downloads WHERE status IN ('completed', 'cancelled')`,
    );
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/pause-all', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, status, type, category FROM downloads WHERE status IN ('downloading', 'queued')`,
    );
    let paused = 0;
    for (const job of rows) {
      const wasActive = pauseDownload(job.id);
      if (!wasActive) {
        await pool.query(
          `UPDATE downloads SET status = 'paused', updated_at = NOW() WHERE id = ?`,
          [job.id],
        );
      }
      paused += 1;
    }
    res.json({ paused });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/cancel-all', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, status, type, category FROM downloads WHERE status IN ('queued', 'downloading', 'paused')`,
    );
    let cancelled = 0;
    for (const job of rows) {
      const wasActive = cancelDownload(Number(job.id));
      if (!wasActive) {
        if (job.type !== 'media') {
          cleanupSegmentedJob(resolveDestination(job.category), job.id);
        }
        await pool.query(
          `UPDATE downloads SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
          [job.id],
        );
      }
      cancelled += 1;
    }
    res.json({ cancelled });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/retry-failed', async (_req, res, next) => {
  try {
    const [result] = await pool.query(
      `UPDATE downloads
       SET status = 'queued', progress = 0, bytes_downloaded = 0,
           error_message = NULL, file_path = NULL, file_size = NULL,
           needs_auth = 0, updated_at = NOW(), completed_at = NULL
       WHERE status = 'failed'`,
    );
    res.json({ retried: result.affectedRows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const {
    url,
    category = 'general',
    type = 'http',
    format_id = null,
    media_kind = null,
    title = null,
    thumbnail = null,
    connections = null,
    filename = null,
    ai_rename = true,
  } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  let trimmed;
  try {
    trimmed = prepareDownloadUrl(url.trim());
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid URL' });
  }

  if (!trimmed) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    new URL(trimmed);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http', 'media'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const effectiveType = resolveDownloadType(trimmed, type);
  const isMedia = effectiveType === 'media';

  if (isMedia && type === 'http') {
    // Auto-routed: video page URLs need yt-dlp, not segmented HTTP.
  }

  if (effectiveType === 'media' && !['video', 'audio'].includes(media_kind || 'video')) {
    return res.status(400).json({ error: 'media_kind must be video or audio' });
  }

  let conn = null;
  if (!isMedia && connections != null) {
    conn = clampConnections(connections);
  }

  let cleanName = null;
  if (!isMedia && filename != null && typeof filename === 'string' && filename.trim()) {
    cleanName = filename.trim().slice(0, 255);
  } else if (!isMedia) {
    cleanName = defaultHttpFilename(trimmed);
  }

  // 18+ sites: private mode — never AI-named, hidden from history, purged on finish.
  const isPrivate = isAdultSiteUrl(trimmed);
  if (isPrivate && isMedia) {
    cleanName = await resolveQueuedFilename(trimmed, { type: 'media', isPrivate: true });
  } else if (isPrivate && !cleanName) {
    cleanName = defaultHttpFilename(trimmed);
  }
  const useAiRename = isPrivate
    ? 0
    : cleanName
      ? 0
      : ai_rename !== false && ai_rename !== 0
        ? 1
        : 0;

  const effFormatId = isMedia ? (format_id || 'best') : null;
  const effMediaKind = isMedia ? (media_kind || 'video') : null;
  const effTitle = isMedia && !isPrivate ? title : null;
  const effThumbnail = isMedia && !isPrivate ? thumbnail : null;
  const effFilename = !isMedia || isPrivate ? cleanName : null;

  try {
    const [result] = await pool.query(
      `INSERT INTO downloads (url, category, status, type, format_id, media_kind, title, thumbnail, connections, filename, ai_rename, private)
       VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trimmed,
        category,
        effectiveType,
        effFormatId,
        effMediaKind,
        effTitle,
        effThumbnail,
        isMedia ? null : conn,
        effFilename,
        useAiRename,
        isPrivate ? 1 : 0,
      ],
    );

    const [rows] = await pool.query(
      'SELECT * FROM downloads WHERE id = ?',
      [result.insertId],
    );

    res.status(201).json({
      ...sanitizeDownloadRow(rows[0]),
      autoDetected: analyzeUrl(trimmed),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const job = rows[0];
    if (job.status === 'completed') {
      return res.status(400).json({ error: 'Download already completed' });
    }

    await pool.query(
      `UPDATE downloads SET status = 'cancelled', needs_auth = 0, updated_at = NOW()
       WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      [req.params.id],
    );

    cancelDownload(Number(req.params.id));

    if (job.type !== 'media' && ['queued', 'paused'].includes(job.status)) {
      cleanupSegmentedJob(resolveDestination(job.category), job.id);
    }

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const job = rows[0];
    if (!['downloading', 'queued'].includes(job.status)) {
      return res.status(400).json({ error: 'Only active downloads can be paused' });
    }

    await pool.query(
      `UPDATE downloads SET status = 'paused', updated_at = NOW()
       WHERE id = ? AND status IN ('queued', 'downloading')`,
      [job.id],
    );

    pauseDownload(job.id);

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      job.id,
    ]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const job = rows[0];
    if (job.status !== 'paused') {
      return res.status(400).json({ error: 'Only paused downloads can be resumed' });
    }

    // Re-queue WITHOUT resetting progress — the worker resumes from the manifest.
    await pool.query(
      `UPDATE downloads SET status = 'queued', error_message = NULL, updated_at = NOW() WHERE id = ?`,
      [job.id],
    );

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      job.id,
    ]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const job = rows[0];
    if (!['failed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ error: 'Only failed or cancelled downloads can be retried' });
    }

    if (job.type !== 'media') {
      cleanupSegmentedJob(resolveDestination(job.category), job.id);
    }

    let normalizedUrl;
    try {
      normalizedUrl = prepareDownloadUrl(job.url);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid URL' });
    }

    const isPrivate = isAdultSiteUrl(normalizedUrl);

    await pool.query(
      `UPDATE downloads
       SET status = 'queued', progress = 0, bytes_downloaded = 0,
           file_path = NULL, file_size = NULL, error_message = NULL,
           needs_auth = 0, completed_at = NULL, url = ?, private = ?,
           ai_rename = IF(? = 1, 0, ai_rename), updated_at = NOW()
       WHERE id = ?`,
      [normalizedUrl, isPrivate ? 1 : 0, isPrivate ? 1 : 0, req.params.id],
    );

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

// Supply username/password for a login-protected download and re-queue it.
// Credentials are held only in memory by the worker — never written to the DB.
router.post('/:id/credentials', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'username is required' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const job = rows[0];
    setJobCredentials(job.id, {
      username: username.trim(),
      password: typeof password === 'string' ? password : '',
    });

    if (job.type !== 'media') {
      cleanupSegmentedJob(resolveDestination(job.category), job.id);
    }

    await pool.query(
      `UPDATE downloads
       SET status = 'queued', progress = 0, bytes_downloaded = 0,
           file_path = NULL, file_size = NULL, error_message = NULL,
           needs_auth = 0, completed_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [job.id],
    );

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      job.id,
    ]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const job = rows[0];
    if (['downloading', 'queued'].includes(job.status)) {
      cancelDownload(Number(job.id));
    }
    if (job.type !== 'media') {
      cleanupSegmentedJob(resolveDestination(job.category), job.id);
    }
    await pool.query('DELETE FROM downloads WHERE id = ?', [req.params.id]);
    res.json({ ok: true, id: job.id });
  } catch (err) {
    next(err);
  }
});

export default router;

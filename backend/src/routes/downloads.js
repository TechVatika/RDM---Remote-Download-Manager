import { Router } from 'express';
import path from 'path';
import { pool } from '../db/pool.js';
import { cancelDownload, pauseDownload, setJobCredentials } from '../worker/downloadWorker.js';
import { listPlaylistEntries, probeMedia } from '../worker/ytdlpDownload.js';
import {
  cleanupSegmentedJob,
  hasPartialJob,
  readPartialProgress,
} from '../worker/segmentedDownload.js';
import { resolveDestination } from '../config/paths.js';
import { filenameFromUrl, sanitizeFilename } from '../utils/filename.js';
import { inspectRemoteHttpUrl } from '../utils/httpInspect.js';
import { assertDownloadUrlAllowed } from '../utils/ssrf.js';
import { looksLikePlaylistUrl, prepareDownloadUrl } from '../utils/mediaUrl.js';
import { isAdultSiteUrl } from '../data/adultSites.js';
import { resolveQueuedFilename, defaultHttpFilename } from '../utils/queueMetadata.js';
import {
  getAiRenameConfig,
  isAiRenameEnabled,
  localSmartFilename,
  suggestFilename,
} from '../utils/aiRename.js';
import { getCachedProbe, setCachedProbe } from '../utils/probeCache.js';
import { clampConnections, DEFAULT_CONNECTIONS } from '../config/speed.js';
import { resolveDownloadType, analyzeUrl } from '../utils/platformDetect.js';

const router = Router();

/** Strip display metadata from active 18+ rows (URL kept server-side for copy/retry only). */
function sanitizeDownloadRow(row) {
  if (!row || !Number(row.private)) return row;
  return { ...row, title: null, thumbnail: null };
}

function enrichDownloadRow(row) {
  const base = sanitizeDownloadRow(row);
  if (!base || base.type === 'media') return { ...base, can_resume: false };
  const destDir = resolveDestination(base.category);
  const canResume = hasPartialJob(destDir, base.id);
  const partial = canResume ? readPartialProgress(destDir, base.id) : null;
  return {
    ...base,
    can_resume: canResume,
    ...(partial && ['failed', 'cancelled', 'paused'].includes(base.status)
      ? {
          bytes_downloaded: partial.bytesDownloaded,
          file_size: partial.fileSize ?? base.file_size,
          progress: partial.progress,
        }
      : {}),
  };
}

const LIST_WHERE = `private = 0 OR status IN ('queued', 'downloading', 'paused')`;
const BULK_MAX_EXPANDED = Number(process.env.BULK_MAX_EXPANDED) || 200;

function normalizeMediaFormat(format_id, media_kind) {
  const kind = media_kind === 'audio' ? 'audio' : 'video';
  const formatId = kind === 'audio' ? null : format_id || 'best';
  return { formatId, kind };
}

async function expandUrlsForQueue(rawUrls, expandPlaylists) {
  const expanded = [];
  for (const raw of rawUrls) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let trimmed;
    try {
      trimmed = prepareDownloadUrl(raw.trim());
      await assertDownloadUrlAllowed(trimmed);
    } catch {
      continue;
    }

    const dlType = resolveDownloadType(trimmed, 'http');
    if (expandPlaylists && dlType === 'media' && looksLikePlaylistUrl(trimmed)) {
      const playlist = await listPlaylistEntries(trimmed);
      if (playlist?.entries?.length) {
        for (const entry of playlist.entries) {
          expanded.push({
            url: entry.url,
            sourceUrl: trimmed,
            playlistTitle: playlist.playlistTitle,
          });
        }
        continue;
      }
    }

    expanded.push({ url: trimmed, sourceUrl: null, playlistTitle: null });
  }
  return expanded;
}

async function queueDownloadRow({
  trimmed,
  category,
  dlType,
  format_id = null,
  media_kind = null,
  connections = null,
  filename = null,
  title = null,
  thumbnail = null,
  ai_rename = 0,
}) {
  const isMedia = dlType === 'media';
  const isPrivate = isAdultSiteUrl(trimmed);
  const { formatId, kind } = isMedia ? normalizeMediaFormat(format_id, media_kind) : { formatId: null, kind: null };

  const [result] = await pool.query(
    `INSERT INTO downloads (url, category, status, type, format_id, media_kind, title, thumbnail, connections, filename, ai_rename, private)
     VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trimmed,
      category,
      dlType,
      formatId,
      kind,
      title,
      thumbnail,
      isMedia ? null : connections,
      filename,
      isPrivate ? 0 : ai_rename,
      isPrivate ? 1 : 0,
    ],
  );
  const [rows] = await pool.query('SELECT * FROM downloads WHERE id = ?', [result.insertId]);
  return sanitizeDownloadRow(rows[0]);
}

async function resolveFilenameForQueue(trimmed, dlType, { useAiRename = 0 } = {}) {
  const isMedia = dlType === 'media';
  const isPrivate = isAdultSiteUrl(trimmed);

  if (isPrivate) {
    return {
      filename: await resolveQueuedFilename(trimmed, { type: dlType, isPrivate: true }),
      aiRename: 0,
      isPrivate: true,
    };
  }

  if (!isMedia) {
    try {
      const info = await inspectRemoteHttpUrl(trimmed);
      return {
        filename: sanitizeFilename(info.filename || defaultHttpFilename(trimmed)),
        aiRename: 0,
        isPrivate: false,
      };
    } catch {
      return {
        filename: defaultHttpFilename(trimmed),
        aiRename: 0,
        isPrivate: false,
      };
    }
  }

  return { filename: null, aiRename: useAiRename ? 1 : 0, isPrivate: false };
}

// Inspect a media URL and return its available qualities/formats.
router.post('/probe', async (req, res, next) => {
  const { url, expand_playlist = false } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const trimmed = prepareDownloadUrl(url.trim());
    const wantPlaylist = expand_playlist === true || expand_playlist === 1;
    const cacheKey = wantPlaylist ? `${trimmed}::playlist` : trimmed;
    const cached = getCachedProbe(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }
    const info = await probeMedia(trimmed, { includePlaylist: wantPlaylist });
    setCachedProbe(cacheKey, info);
    res.json(info);
  } catch (err) {
    res.status(err.message?.includes('blob:') || err.message?.includes('Invalid URL') ? 400 : 422).json({
      error: err.message || 'Could not read media info',
    });
  }
});

router.post('/playlist', async (req, res, next) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const trimmed = prepareDownloadUrl(url.trim());
    const cached = getCachedProbe(`${trimmed}::playlist-full`);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }
    const playlist = await listPlaylistEntries(trimmed);
    if (!playlist) {
      return res.status(422).json({ error: 'Could not read playlist entries for this URL' });
    }
    setCachedProbe(`${trimmed}::playlist-full`, playlist);
    res.json(playlist);
  } catch (err) {
    next(err);
  }
});

// Fast filename from the remote server (Content-Disposition / URL path) — no AI.
router.post('/resolve-filename', async (req, res, next) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const trimmed = prepareDownloadUrl(url.trim());
    const dlType = resolveDownloadType(trimmed, 'http');

    if (dlType === 'media') {
      return res.json({
        type: 'media',
        filename: null,
        fileSize: null,
        source: 'media',
      });
    }

    const info = await inspectRemoteHttpUrl(trimmed);
    res.json({
      type: 'http',
      filename: info.filename,
      fileSize: info.totalBytes,
      supportsRanges: info.supportsRanges,
      source: info.source,
    });
  } catch (err) {
    try {
      const trimmed = prepareDownloadUrl(url.trim());
      res.json({
        type: 'http',
        filename: defaultHttpFilename(trimmed),
        fileSize: null,
        source: 'url',
        fallback: true,
        error: err.message,
      });
    } catch (inner) {
      const code = /Invalid URL|required/i.test(inner.message || '') ? 400 : 422;
      res.status(code).json({ error: inner.message || 'Could not resolve filename' });
    }
  }
});

async function previewOneUrl(raw, { expandPlaylists = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { url: raw, valid: false, error: 'Empty line' };
  }
  try {
    const trimmed = prepareDownloadUrl(raw.trim());
    await assertDownloadUrlAllowed(trimmed);
    const dlType = resolveDownloadType(trimmed, 'http');
    const isMedia = dlType === 'media';
    const isPrivate = isAdultSiteUrl(trimmed);
    const auto = analyzeUrl(trimmed);
    const isPlaylist = isMedia && looksLikePlaylistUrl(trimmed);

    let filename = null;
    let fileSize = null;
    let source = null;
    let playlist = null;

    if (!isMedia) {
      try {
        const info = await inspectRemoteHttpUrl(trimmed);
        filename = info.filename;
        fileSize = info.totalBytes;
        source = info.source;
      } catch {
        filename = defaultHttpFilename(trimmed);
        source = 'url';
      }
    } else if (isPrivate) {
      filename = await resolveQueuedFilename(trimmed, { type: 'media', isPrivate: true });
      source = 'probe';
    } else {
      const cached = getCachedProbe(trimmed);
      if (cached?.title) {
        filename = localSmartFilename({
          title: cached.title,
          originalName: defaultHttpFilename(trimmed),
          url: trimmed,
          category: 'general',
        });
        source = 'probe-cache';
      }
    }

    if (isPlaylist) {
      if (expandPlaylists) {
        playlist = await listPlaylistEntries(trimmed);
      } else {
        playlist = { entryCount: null, playlistTitle: null, pending: true };
      }
    }

    return {
      url: trimmed,
      valid: true,
      type: dlType,
      platform: auto?.platform || null,
      filename,
      fileSize,
      source,
      private: isPrivate,
      isPlaylist,
      playlist,
      expandsTo: playlist?.entryCount || 1,
    };
  } catch (err) {
    return { url: raw.trim(), valid: false, error: err.message || 'Invalid URL' };
  }
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

router.post('/bulk/preview', async (req, res, next) => {
  const { urls, expand_playlists = false } = req.body;
  if (!Array.isArray(urls) || !urls.length) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }
  if (urls.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 URLs per batch' });
  }

  try {
    const concurrency = Number(process.env.BULK_PREVIEW_CONCURRENCY) || 6;
    const expandPlaylists = expand_playlists === true || expand_playlists === 1;
    const items = await mapConcurrent(urls, concurrency, (raw) =>
      previewOneUrl(raw, { expandPlaylists }),
    );

    const valid = items.filter((i) => i.valid);
    const expandedCount = valid.reduce((sum, i) => sum + (i.expandsTo || 1), 0);
    res.json({
      count: items.length,
      validCount: valid.length,
      mediaCount: valid.filter((i) => i.type === 'media').length,
      httpCount: valid.filter((i) => i.type === 'http').length,
      playlistCount: valid.filter((i) => i.isPlaylist).length,
      expandedCount,
      expandPlaylists,
      items,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/suggest-name', async (req, res, next) => {
  const {
    url,
    category = 'general',
    title = null,
    type = 'http',
    use_ai = false,
  } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const normalized = prepareDownloadUrl(url.trim());

    // 18+ sites: never send URL/title to the AI provider — keep a plain local name.
    if (isAdultSiteUrl(normalized)) {
      return res.json({ filename: filenameFromUrl(normalized), aiUsed: false, source: 'local' });
    }

    let mediaTitle = title;
    let uploader = null;
    let extractor = null;

    if (type === 'media' && !mediaTitle) {
      const cached = getCachedProbe(normalized);
      if (cached) {
        mediaTitle = cached.title;
        uploader = cached.uploader;
        extractor = cached.extractor;
      } else {
        const info = await probeMedia(normalized);
        setCachedProbe(normalized, info);
        mediaTitle = info.title;
        uploader = info.uploader;
        extractor = info.extractor;
      }
    }

    const originalName = filenameFromUrl(normalized);
    const ctx = {
      url: normalized,
      title: mediaTitle,
      category,
      originalName,
      uploader,
      extractor,
    };

    const wantAi = use_ai === true || use_ai === 1;
    const local = localSmartFilename(ctx);

    if (!wantAi) {
      return res.json({ filename: local, aiUsed: false, source: 'local' });
    }

    const filename = await suggestFilename(ctx, { useAi: true });
    const aiUsed = wantAi && isAiRenameEnabled() && filename !== local;

    res.json({
      filename,
      aiUsed,
      source: aiUsed ? 'ai' : 'local',
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
    res.json(rows.map(enrichDownloadRow));
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
    res.json(enrichDownloadRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', async (req, res, next) => {
  const {
    urls,
    category = 'general',
    connections = null,
    ai_rename = false,
    format_id = 'best',
    media_kind = 'video',
    expand_playlists = false,
  } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls must be a non-empty array' });
  }
  if (urls.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 URLs per batch' });
  }

  const conn = clampConnections(connections ?? DEFAULT_CONNECTIONS);
  const useAiRename = ai_rename === true || ai_rename === 1 ? 1 : 0;
  const expandPlaylists = expand_playlists === true || expand_playlists === 1;
  const queued = [];

  try {
    const expanded = await expandUrlsForQueue(urls, expandPlaylists);
    if (!expanded.length) {
      return res.status(400).json({ error: 'No valid URLs in batch' });
    }
    if (expanded.length > BULK_MAX_EXPANDED) {
      return res.status(400).json({
        error: `Batch would queue ${expanded.length} downloads (max ${BULK_MAX_EXPANDED}). Disable playlist expansion or split the batch.`,
      });
    }

    for (const item of expanded) {
      const trimmed = item.url;
      const dlType = resolveDownloadType(trimmed, 'http');
      const meta = await resolveFilenameForQueue(trimmed, dlType, { useAiRename });

      const row = await queueDownloadRow({
        trimmed,
        category,
        dlType,
        format_id,
        media_kind,
        connections: conn,
        filename: meta.filename,
        ai_rename: meta.aiRename,
      });
      queued.push(row);
    }

    res.status(201).json({ count: queued.length, items: queued, expanded: expandPlaylists });
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
    ai_rename = false,
    expand_playlist = false,
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
  if (!isMedia) {
    conn = clampConnections(connections ?? DEFAULT_CONNECTIONS);
  }

  let cleanName = null;
  if (!isMedia && filename != null && typeof filename === 'string' && filename.trim()) {
    cleanName = filename.trim().slice(0, 255);
  } else if (!isMedia) {
    try {
      const info = await inspectRemoteHttpUrl(trimmed);
      cleanName = sanitizeFilename(info.filename || defaultHttpFilename(trimmed));
    } catch {
      cleanName = defaultHttpFilename(trimmed);
    }
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
      : ai_rename === true || ai_rename === 1
        ? 1
        : 0;

  const effFormatId = isMedia ? (format_id || 'best') : null;
  const effMediaKind = isMedia ? (media_kind || 'video') : null;
  const effTitle = isMedia && !isPrivate ? title : null;
  const effThumbnail = isMedia && !isPrivate ? thumbnail : null;
  const effFilename = !isMedia || isPrivate ? cleanName : null;
  const expandPlaylist = (expand_playlist === true || expand_playlist === 1) && isMedia && !isPrivate;

  try {
    if (expandPlaylist) {
      const playlist = await listPlaylistEntries(trimmed);
      if (playlist?.entries?.length) {
        if (playlist.entries.length > BULK_MAX_EXPANDED) {
          return res.status(400).json({
            error: `Playlist has ${playlist.entries.length} videos (max ${BULK_MAX_EXPANDED}). Queue individual videos instead.`,
          });
        }

        const queued = [];
        for (const entry of playlist.entries) {
          const row = await queueDownloadRow({
            trimmed: entry.url,
            category,
            dlType: 'media',
            format_id: effFormatId,
            media_kind: effMediaKind,
            title: entry.title,
            thumbnail: effThumbnail,
            ai_rename: useAiRename,
          });
          queued.push(row);
        }

        return res.status(201).json({
          count: queued.length,
          items: queued,
          playlist: true,
          playlistTitle: playlist.playlistTitle,
          autoDetected: analyzeUrl(trimmed),
        });
      }
    }

    const row = await queueDownloadRow({
      trimmed,
      category,
      dlType: effectiveType,
      format_id: effFormatId,
      media_kind: effMediaKind,
      connections: conn,
      filename: effFilename,
      title: effTitle,
      thumbnail: effThumbnail,
      ai_rename: useAiRename,
    });

    res.status(201).json({
      ...row,
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
    const destDir = resolveDestination(job.category);
    const partial =
      job.type !== 'media' ? readPartialProgress(destDir, job.id) : null;
    const canResume =
      job.status === 'paused' ||
      (['failed', 'cancelled'].includes(job.status) && Boolean(partial));

    if (!canResume) {
      return res.status(400).json({
        error: 'Only paused downloads or failed/cancelled jobs with saved progress can be resumed',
      });
    }

    const fields = ['status = \'queued\'', 'error_message = NULL', 'updated_at = NOW()'];
    const params = [];
    if (partial) {
      fields.push('bytes_downloaded = ?', 'file_size = COALESCE(?, file_size)', 'progress = ?');
      params.push(partial.bytesDownloaded, partial.fileSize, partial.progress.toFixed(2));
    }
    params.push(job.id);
    await pool.query(`UPDATE downloads SET ${fields.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      job.id,
    ]);
    res.json(enrichDownloadRow(updated[0]));
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

    const destDir = resolveDestination(job.category);
    const fresh = req.query.fresh === '1' || req.body?.fresh === true;
    const partial =
      !fresh && job.type !== 'media' ? readPartialProgress(destDir, job.id) : null;
    const resumePartial = Boolean(partial);

    if ((!resumePartial || fresh) && job.type !== 'media') {
      cleanupSegmentedJob(destDir, job.id);
    }

    let normalizedUrl;
    try {
      normalizedUrl = prepareDownloadUrl(job.url);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid URL' });
    }

    const isPrivate = isAdultSiteUrl(normalizedUrl);

    if (resumePartial && !fresh) {
      await pool.query(
        `UPDATE downloads
         SET status = 'queued',
             bytes_downloaded = ?,
             file_size = COALESCE(?, file_size),
             progress = ?,
             file_path = NULL,
             error_message = NULL,
             needs_auth = 0,
             completed_at = NULL,
             url = ?,
             private = ?,
             ai_rename = IF(? = 1, 0, ai_rename),
             updated_at = NOW()
         WHERE id = ?`,
        [
          partial.bytesDownloaded,
          partial.fileSize,
          partial.progress.toFixed(2),
          normalizedUrl,
          isPrivate ? 1 : 0,
          isPrivate ? 1 : 0,
          req.params.id,
        ],
      );
    } else {
      await pool.query(
        `UPDATE downloads
         SET status = 'queued', progress = 0, bytes_downloaded = 0,
             file_path = NULL, file_size = NULL, error_message = NULL,
             needs_auth = 0, completed_at = NULL, url = ?, private = ?,
             ai_rename = IF(? = 1, 0, ai_rename), updated_at = NOW()
         WHERE id = ?`,
        [normalizedUrl, isPrivate ? 1 : 0, isPrivate ? 1 : 0, req.params.id],
      );
    }

    const [updated] = await pool.query('SELECT * FROM downloads WHERE id = ?', [
      req.params.id,
    ]);
    res.json(enrichDownloadRow(updated[0]));
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

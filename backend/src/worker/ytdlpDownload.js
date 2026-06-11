import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { getYtdlpAuthArgs } from '../config/cookies.js';
import { resolveProxyArgsForUrl, proxyWouldApply, beginAdultWarpForUrl, releaseAdultWarpForUrl, usesWarpForUrl } from '../config/adultProxy.js';
import { verifyWarpProxyReady } from '../config/warpProxy.js';
import { isAdultSiteUrl } from '../data/adultSites.js';
import {
  prepareDownloadUrl,
  friendlyMediaError,
  looksLikePlaylistUrl,
  extractYoutubeListId,
  classifyYoutubePlaylistKind,
} from '../utils/mediaUrl.js';
import { logger } from '../utils/logger.js';

import {
  YTDLP_CONCURRENT_FRAGMENTS,
  YTDLP_PARALLEL,
} from '../config/speed.js';

const log = logger.child('ytdlp');

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function authArgs() {
  return getYtdlpAuthArgs().args;
}

function siteExtraArgs(url) {
  const args = [];
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('pornhub')) {
      args.push('--add-header', 'Referer:https://www.pornhub.com/');
      args.push('--add-header', 'Accept-Language:en-US,en;q=0.9');
    } else if (host.includes('xvideos')) {
      args.push('--add-header', 'Referer:https://www.xvideos.com/');
    } else if (host.includes('xhamster')) {
      args.push('--add-header', 'Referer:https://xhamster.com/');
    } else if (host.includes('redtube')) {
      args.push('--add-header', 'Referer:https://www.redtube.com/');
    }
  } catch {
    /* ignore */
  }
  return args;
}

async function ytDlpArgsForUrl(url, extra = []) {
  const proxyArgs = isAdultSiteUrl(url) ? await resolveProxyArgsForUrl(url) : [];
  return [...commonArgs(), ...siteExtraArgs(url), ...proxyArgs, ...extra];
}

/**
 * When an adult site fails with 410/Gone/restricted while routed through a proxy,
 * the proxy's exit IP is almost certainly in a geo-blocked region (e.g. free WARP
 * exits near the server). Surface that instead of a misleading "removed" message.
 */
function mediaErrorMessage(url, rawMsg = '') {
  const geoBlocked =
    isAdultSiteUrl(url) &&
    proxyWouldApply(url) &&
    /\b410\b|\bgone\b|restricted|not available|unavailable in/i.test(rawMsg);

  if (geoBlocked) {
    return (
      'Geo-blocked exit IP: the proxy/VPN reached this adult site but its exit region ' +
      'blocks the video (the page redirects and returns 410 Gone). ' +
      'Cloudflare WARP free has no country selection — it exits near the server, so it ' +
      "can't bypass a regional block. Fixes: (1) route adult sites through a working " +
      'connection — e.g. a SOCKS proxy on your laptop set as a Custom proxy in Platform Auth → ' +
      'Adult sites; or (2) use a commercial VPN/proxy that exits an allowed country. ' +
      'Cookies do not help — this is an IP/region block, not age verification.'
    );
  }
  return friendlyMediaError(rawMsg);
}

/** Strip system proxy env so only explicit --proxy (adult sites) routes through WARP. */
function ytdlpSpawnEnv() {
  const env = { ...process.env };
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ]) {
    delete env[key];
  }
  return env;
}

function commonArgs() {
  return [
    '--no-warnings',
    '--no-playlist',
    '--geo-bypass',
    '--retries',
    '5',
    '--fragment-retries',
    '5',
    '--user-agent',
    USER_AGENT,
    '--concurrent-fragments',
    String(YTDLP_CONCURRENT_FRAGMENTS),
    '-N',
    String(YTDLP_PARALLEL),
    ...authArgs(),
  ];
}

/** Lighter args for format probing — faster metadata fetch. */
function probeArgs({ allowPlaylist = false } = {}) {
  return [
    '--no-warnings',
    ...(allowPlaylist ? [] : ['--no-playlist']),
    '--geo-bypass',
    '--retries',
    '2',
    '--fragment-retries',
    '2',
    '--socket-timeout',
    '20',
    '--user-agent',
    USER_AGENT,
    ...authArgs(),
  ];
}

async function ytDlpProbeArgsForUrl(url, extra = [], { allowPlaylist = false } = {}) {
  const proxyArgs = isAdultSiteUrl(url) ? await resolveProxyArgsForUrl(url) : [];
  return [...probeArgs({ allowPlaylist }), ...siteExtraArgs(url), ...proxyArgs, ...extra];
}

/**
 * Browser impersonation (TLS/JA3 fingerprint) via curl_cffi. Many sites now
 * reject datacenter requests by fingerprint, not IP — impersonating a real
 * browser gets past that. Detected once: empty string means unavailable.
 */
let _impersonateTarget = null;
let _impersonateChecked = false;

async function impersonateTarget() {
  if (_impersonateChecked) return _impersonateTarget;
  _impersonateChecked = true;
  if (process.env.YTDLP_IMPERSONATE) {
    _impersonateTarget = process.env.YTDLP_IMPERSONATE;
    return _impersonateTarget;
  }
  try {
    const out = await runJson(['--list-impersonate-targets']);
    const hasReal = out
      .split('\n')
      .some((l) => /curl_cffi$/.test(l.trim()) && !/unavailable/i.test(l) && /^[A-Za-z]/.test(l.trim()));
    _impersonateTarget = hasReal ? 'chrome' : '';
  } catch {
    _impersonateTarget = '';
  }
  if (_impersonateTarget) log.info(`browser impersonation available (${_impersonateTarget})`);
  return _impersonateTarget;
}

function impersonateArgs(target) {
  return target ? ['--impersonate', target] : [];
}

/** Errors that browser impersonation can plausibly fix (anti-bot / fingerprint). */
function isBlockLikeError(raw = '') {
  return /\b403\b|\b429\b|forbidden|unable to download webpage|too many requests|not a bot|enable javascript|cloudflare|just a moment|challenge|access denied|blocked|fingerprint|ssl|tls handshake|connection reset/i.test(
    raw,
  );
}

/**
 * Run yt-dlp and collect stdout. Rejects on non-zero exit.
 */
function runJson(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: ytdlpSpawnEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) =>
      reject(new Error(`yt-dlp not available: ${err.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

/**
 * List playlist entries via yt-dlp flat JSON (no per-video format probe).
 * Returns null when the URL is not a multi-entry playlist.
 */
export async function listPlaylistEntries(url) {
  const normalized = prepareDownloadUrl(url);
  if (!looksLikePlaylistUrl(normalized)) return null;

  await beginAdultWarpForUrl(normalized);
  try {
    const probeOnce = async (target) =>
      runJson([
        '-J',
        '--flat-playlist',
        ...(await ytDlpProbeArgsForUrl(normalized, impersonateArgs(target), { allowPlaylist: true })),
        normalized,
      ]);

    let raw;
    try {
      raw = await probeOnce(null);
    } catch (err) {
      const target = await impersonateTarget();
      if (target && isBlockLikeError(err.message)) {
        log.info(`playlist probe blocked, retrying with impersonation: ${new URL(normalized).hostname}`);
        raw = await probeOnce(target);
      } else {
        throw err;
      }
    }

    const info = JSON.parse(raw);
    if (info._type !== 'playlist' || !Array.isArray(info.entries)) return null;

    const isYoutube = (() => {
      try {
        const host = new URL(normalized).hostname.toLowerCase();
        return host.includes('youtube.com') || host.includes('music.youtube.com');
      } catch {
        return false;
      }
    })();

    const entries = info.entries
      .filter(Boolean)
      .map((e) => ({
        id: e.id,
        title: e.title || e.id,
        url:
          e.url ||
          e.webpage_url ||
          e.original_url ||
          (isYoutube && e.id ? `https://www.youtube.com/watch?v=${e.id}` : null),
      }))
      .filter((e) => e.url);

    if (entries.length <= 1) return null;

    const listId = extractYoutubeListId(normalized) || info.id;
    const classification = classifyYoutubePlaylistKind(listId);

    return {
      playlistId: info.id || listId,
      playlistTitle: info.title || classification?.label || 'Playlist',
      entryCount: entries.length,
      entries,
      kind: classification?.kind || 'playlist',
      kindLabel: classification?.label || 'Playlist',
      requiresAuth: classification?.requiresAuth || false,
    };
  } catch (err) {
    if (/blob:|Invalid URL|URL is required/i.test(err.message || '')) throw err;
    log.warn(`playlist listing failed for ${normalized}: ${err.message}`);
    return null;
  } finally {
    await releaseAdultWarpForUrl(normalized);
  }
}

/**
 * Probe a URL: returns title, thumbnail and the list of selectable formats.
 */
export async function probeMedia(url) {
  const normalized = prepareDownloadUrl(url);
  await beginAdultWarpForUrl(normalized);
  try {
    const probeOnce = async (target) =>
      runJson(['-J', ...(await ytDlpProbeArgsForUrl(normalized, impersonateArgs(target))), normalized]);

    let raw;
    try {
      raw = await probeOnce(null);
    } catch (err) {
      const target = await impersonateTarget();
      if (target && isBlockLikeError(err.message)) {
        log.info(`probe blocked, retrying with impersonation: ${new URL(normalized).hostname}`);
        raw = await probeOnce(target);
      } else {
        throw err;
      }
    }
    const info = JSON.parse(raw);

    const meta = info.entries?.length ? info.entries[0] : info;
    const formats = Array.isArray(meta.formats) ? meta.formats : [];

    const heightMap = new Map();
    for (const f of formats) {
      if (f.vcodec && f.vcodec !== 'none' && f.height) {
        const existing = heightMap.get(f.height);
        const hasAudio = f.acodec && f.acodec !== 'none';
        if (!existing) {
          heightMap.set(f.height, { height: f.height, ext: f.ext, hasAudio });
        } else if (hasAudio) {
          existing.hasAudio = true;
        }
      }
    }

    const videoQualities = [...heightMap.values()]
      .sort((a, b) => b.height - a.height)
      .map((q) => ({
        height: q.height,
        label: `${q.height}p`,
        formatId: String(q.height),
      }));

    const availableHeights = videoQualities.map((q) => q.height);
    const maxVideoHeight = availableHeights.length ? Math.max(...availableHeights) : null;

    const audioAvailable = formats.some((f) => f.acodec && f.acodec !== 'none');

    let playlist = null;
    if (looksLikePlaylistUrl(normalized)) {
      playlist = await listPlaylistEntries(normalized);
    }

    return {
      title: meta.title || 'media',
      thumbnail: meta.thumbnail || null,
      duration: meta.duration || null,
      uploader: meta.uploader || meta.channel || null,
      extractor: meta.extractor_key || meta.extractor || null,
      normalizedUrl: normalized,
      videoQualities,
      availableHeights,
      maxVideoHeight,
      audioAvailable,
      playlist,
    };
  } catch (err) {
    if (/blob:|Invalid URL|URL is required/i.test(err.message || '')) throw err;
    throw new Error(mediaErrorMessage(normalized, err.message));
  } finally {
    await releaseAdultWarpForUrl(normalized);
  }
}

/**
 * Translate the stored format token + kind into yt-dlp args.
 * format_id tokens: 'best' | a height like '1080' | a raw yt-dlp format id.
 */
function buildFormatArgs({ formatId, kind, mergeFormat }) {
  if (kind === 'audio') {
    return [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--embed-thumbnail',
      '--embed-metadata',
    ];
  }

  let selector;
  if (!formatId || formatId === 'best') {
    selector = 'bv*+ba/b';
  } else if (/^\d+$/.test(formatId)) {
    const h = formatId;
    selector = `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
  } else {
    // raw format id straight from a probe row
    selector = `${formatId}+ba/${formatId}/b`;
  }

  return ['-f', selector, '--merge-output-format', mergeFormat || 'mp4'];
}

/**
 * Download media via yt-dlp. Mirrors downloadHttpFile's contract:
 *   { url, destDir, onProgress, signal, formatId, kind } -> { filePath, fileSize, bytesDownloaded }
 */
export async function downloadMedia({
  url,
  destDir,
  onProgress,
  signal,
  formatId,
  kind = 'video',
  auth = null,
}) {
  const normalized = prepareDownloadUrl(url);
  await beginAdultWarpForUrl(normalized);
  try {
    return await downloadMediaInner({
      normalized,
      destDir,
      onProgress,
      signal,
      formatId,
      kind,
      auth,
    });
  } finally {
    await releaseAdultWarpForUrl(normalized);
  }
}

async function downloadMediaInner({
  normalized,
  destDir,
  onProgress,
  signal,
  formatId,
  kind = 'video',
  auth = null,
}) {
  fs.mkdirSync(destDir, { recursive: true });

  const outputTemplate = path.join(destDir, '%(title).200B [%(id)s].%(ext)s');

  if (proxyWouldApply(normalized)) {
    log.info(`WARP ON for adult-site download: ${new URL(normalized).hostname}`);
  } else if (isAdultSiteUrl(normalized)) {
    log.warn(`adult site but WARP disabled in settings: ${new URL(normalized).hostname}`);
  }

  const credArgs = auth?.username
    ? ['--username', auth.username, '--password', auth.password ?? '']
    : [];

  if (usesWarpForUrl(normalized)) {
    await verifyWarpProxyReady();
  }

  // One yt-dlp run. Rejects with an Error carrying raw stderr (err.raw) so the
  // caller can decide whether to retry (e.g. with browser impersonation).
  const runOnce = async (impersonate) => {
    const pathFile = path.join(
      os.tmpdir(),
      `rdm-ytdlp-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    );

    const args = [
      ...(await ytDlpArgsForUrl(normalized, impersonateArgs(impersonate))),
      ...credArgs,
      '--newline',
      '--progress-template',
      'PROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
      '--print-to-file',
      'after_move:filepath',
      pathFile,
      ...buildFormatArgs({ formatId, kind }),
      '-o',
      outputTemplate,
      normalized,
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: ytdlpSpawnEnv() });
      let stderr = '';
      let lastReportAt = 0;
      let lastBytes = 0;
      let totalBytes = null;
      let aborted = false;

      const onAbort = () => {
        aborted = true;
        child.kill('SIGKILL');
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }

      const handleProgressLine = (line) => {
        const m = line.match(/^PROG\s+(\S+)\s+(\S+)\s+(\S+)/);
        if (!m) return;
        const downloaded = Number(m[1]) || lastBytes;
        const total = Number(m[2]) || Number(m[3]) || null;
        lastBytes = downloaded;
        if (total) totalBytes = total;

        const now = Date.now();
        if (now - lastReportAt < 1500) return;
        lastReportAt = now;
        onProgress?.({
          bytesDownloaded: downloaded,
          fileSize: totalBytes,
          progress: totalBytes ? Math.min(100, (downloaded / totalBytes) * 100) : 0,
        });
      };

      let stdoutBuf = '';
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk;
        let idx;
        while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
          const line = stdoutBuf.slice(0, idx);
          stdoutBuf = stdoutBuf.slice(idx + 1);
          handleProgressLine(line.trim());
        }
      });
      child.stderr.on('data', (d) => (stderr += d));

      const cleanup = () => {
        try {
          if (fs.existsSync(pathFile)) fs.unlinkSync(pathFile);
        } catch {
          /* ignore */
        }
      };

      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        cleanup();
        const e = new Error(`yt-dlp not available: ${err.message}`);
        e.fatal = true;
        reject(e);
      });

      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);

        if (aborted) {
          const err = new Error('Cancelled');
          err.name = 'AbortError';
          cleanup();
          return reject(err);
        }

        if (code !== 0) {
          cleanup();
          const raw = stderr.trim() || `yt-dlp exited with code ${code}`;
          const err = new Error(raw);
          err.raw = raw;
          return reject(err);
        }

        let filePath = '';
        try {
          filePath = fs.readFileSync(pathFile, 'utf8').trim().split('\n').pop() || '';
        } catch {
          /* ignore */
        }
        cleanup();

        if (!filePath || !fs.existsSync(filePath)) {
          const err = new Error('Download finished but output file was not found');
          err.fatal = true;
          return reject(err);
        }

        const stat = fs.statSync(filePath);
        onProgress?.({ bytesDownloaded: stat.size, fileSize: stat.size, progress: 100 });
        resolve({ filePath, fileSize: stat.size, bytesDownloaded: stat.size });
      });
    });
  };

  try {
    return await runOnce(null);
  } catch (err) {
    if (err.name === 'AbortError' || err.fatal) throw err;

    const target = await impersonateTarget();
    if (target && isBlockLikeError(err.raw || err.message)) {
      log.info(`download blocked, retrying with impersonation: ${new URL(normalized).hostname}`);
      try {
        return await runOnce(target);
      } catch (err2) {
        if (err2.name === 'AbortError' || err2.fatal) throw err2;
        throw new Error(mediaErrorMessage(normalized, err2.raw || err2.message));
      }
    }
    throw new Error(mediaErrorMessage(normalized, err.raw || err.message));
  }
}

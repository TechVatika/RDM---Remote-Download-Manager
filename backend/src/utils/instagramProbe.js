import https from 'https';
import { spawn } from 'child_process';
import { getInstagramCookieHeader, getYtdlpAuthArgsForUrl, ensureInstagramCookieFile, loadAuthConfig } from '../config/cookies.js';
import { defaultInstagramTargets, instagramProfileUrl, parseInstagramUrl } from './instagramUrl.js';
import { logger } from './logger.js';

const log = logger.child('instagram');
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

const IG_APP_ID = '936619743392459';
const PROBE_TIMEOUT_MS = Number(process.env.INSTAGRAM_PROBE_TIMEOUT_MS) || 15000;

const USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Meta's link-preview bot gets SSR HTML with og:image tags (Chrome UA often gets an empty JS shell). */
const IG_OG_SCRAPE_UA = 'facebookexternalhit/1.1';

// Instagram's CDN shadow-drops requests from this server's IPv6 range.
// Force IPv4 for all Instagram API calls so Meta's CDN responds normally.
const IG_AGENT = new https.Agent({ family: 4, keepAlive: true });

function igGet(urlStr, headers, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent: IG_AGENT,
      headers,
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 400) {
        res.resume();
        const err = new Error(`Instagram API HTTP ${res.statusCode}`);
        err.status = res.statusCode;
        return reject(err);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse: ${e.message}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Instagram request timeout')));
    req.on('error', reject);
    req.end();
  });
}

function igGetText(urlStr, headers, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent: IG_AGENT,
      headers,
    };
    const req = https.request(options, (res) => {
      if (res.statusCode >= 400) {
        res.resume();
        const err = new Error(`Instagram HTTP ${res.statusCode}`);
        err.status = res.statusCode;
        return reject(err);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Instagram request timeout')));
    req.on('error', reject);
    req.end();
  });
}

function decodeIgUrl(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/');
}

function extractAvatarFromHtml(html) {
  if (!html) return null;
  const og = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  if (og?.[1]) return decodeIgUrl(og[1]);
  const hd = html.match(/"profile_pic_url_hd"\s*:\s*"([^"]+)"/);
  if (hd?.[1]) return decodeIgUrl(hd[1]);
  const sd = html.match(/"profile_pic_url"\s*:\s*"([^"]+)"/);
  if (sd?.[1]) return decodeIgUrl(sd[1]);
  return null;
}

function extractPostMediaFromHtml(html) {
  if (!html) return { imageUrl: null, videoUrl: null, caption: null };
  const imageUrl = decodeIgUrl(
    html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/og:image" content="([^"]+)"/i)?.[1],
  );
  const videoUrl = decodeIgUrl(
    html.match(/<meta\s+property="og:video(?::url)?"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/og:video(?::url)?" content="([^"]+)"/i)?.[1],
  );
  const caption = decodeIgUrl(
    html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/og:description" content="([^"]+)"/i)?.[1],
  );
  return { imageUrl, videoUrl, caption };
}

async function fetchPostHtml(shortcode) {
  ensureInstagramCookieFile(loadAuthConfig());
  const cookie = getInstagramCookieHeader();
  return igGetText(
    `https://www.instagram.com/p/${encodeURIComponent(String(shortcode).trim())}/`,
    {
      'User-Agent': IG_OG_SCRAPE_UA,
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.instagram.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  );
}

/** Direct CDN URLs for photo posts when yt-dlp returns an empty playlist (common without cookies). */
export async function resolveInstagramPostDirectUrls(shortcode) {
  const code = String(shortcode ?? '').trim();
  if (!code) return null;
  try {
    const html = await fetchPostHtml(code);
    const { imageUrl, videoUrl, caption } = extractPostMediaFromHtml(html);
    const urls = [];
    if (videoUrl) urls.push({ url: videoUrl, type: 'video' });
    if (imageUrl) urls.push({ url: imageUrl, type: 'image' });
    if (!urls.length) return null;
    return {
      urls,
      caption: formatInstagramCaption(caption) || caption,
      shortcode: code,
    };
  } catch (err) {
    log.info(`post HTML scrape failed for ${code}: ${err.message}`);
    return null;
  }
}

async function fetchProfileHtml(username) {
  const cookie = getInstagramCookieHeader();
  return igGetText(instagramProfileUrl(username), {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.instagram.com/',
    ...(cookie ? { Cookie: cookie } : {}),
  });
}

/** Resolve profile picture CDN URL — API, alt JSON, then HTML scrape (works for many private profiles with cookies). */
export async function resolveInstagramAvatarUrl(username) {
  const user = String(username ?? '').replace(/^@/, '').trim();
  if (!user) throw new Error('Instagram username is required');

  ensureInstagramCookieFile(loadAuthConfig());

  try {
    const data = await fetchProfileApi(user);
    const url = data?.data?.user?.profile_pic_url_hd || data?.data?.user?.profile_pic_url;
    if (url) return url;
  } catch (err) {
    log.info(`avatar API failed for @${user}: ${err.message}`);
    if (err.status === 429) {
      await sleepMs(2000);
      try {
        const data = await fetchProfileApi(user);
        const url = data?.data?.user?.profile_pic_url_hd || data?.data?.user?.profile_pic_url;
        if (url) return url;
      } catch (retryErr) {
        log.info(`avatar API retry failed for @${user}: ${retryErr.message}`);
      }
    }
  }

  try {
    const igUser = await fetchProfileAlt(user);
    const url = igUser?.profile_pic_url_hd || igUser?.profile_pic_url;
    if (url) return url;
  } catch (err) {
    log.info(`avatar alt failed for @${user}: ${err.message}`);
  }

  try {
    const html = await fetchProfileHtml(user);
    const url = extractAvatarFromHtml(html);
    if (url) {
      log.info(`avatar HTML scrape OK for @${user}`);
      return url;
    }
  } catch (err) {
    log.info(`avatar HTML failed for @${user}: ${err.message}`);
  }

  return null;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer caption text over generic "video by user" titles from yt-dlp / oembed patterns. */
export function formatInstagramCaption(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^video by /i.test(text)) return null;

  const likesLead = /^\d[\d,.]*\s+(likes?|views?|comments?)/i.test(text);
  if (likesLead) {
    const idx = text.indexOf(': ');
    if (idx !== -1) {
      const caption = text.slice(idx + 2).trim().replace(/^["']|["']$/g, '');
      if (caption) return caption;
    }
  }

  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean);
  return firstLine || text;
}

function runYtdlpJson(url, extraArgs = []) {
  const { args: authArgs } = getYtdlpAuthArgsForUrl(url);
  return new Promise((resolve, reject) => {
    const child = spawn(
      YTDLP_BIN,
      [
        '--no-warnings',
        '--force-ipv4',
        '--geo-bypass',
        '--socket-timeout',
        '25',
        ...authArgs,
        ...extraArgs,
        '-J',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited ${code}`));
    });
  });
}

/** Thumbnail + caption via yt-dlp (uses cookies when configured). */
export async function fetchInstagramMediaPreview(url, { allowPlaylist = false } = {}) {
  try {
    const playlistArgs = allowPlaylist ? ['--yes-playlist'] : ['--no-playlist'];
    const raw = await runYtdlpJson(url, playlistArgs);
    const info = JSON.parse(raw);
    if (info._type === 'playlist' && (!info.entries || info.entries.length === 0)) {
      const shortcode = parseInstagramUrl(url)?.shortcode;
      if (shortcode) {
        const direct = await resolveInstagramPostDirectUrls(shortcode);
        if (direct) {
          const thumb =
            direct.urls.find((u) => u.type === 'image')?.url ||
            direct.urls[0]?.url ||
            null;
          return {
            title: direct.caption || info.title || null,
            thumbnail: thumb,
            uploader: null,
            caption: direct.caption,
          };
        }
      }
    }
    const meta = info.entries?.length ? info.entries[0] : info;
    const caption = formatInstagramCaption(meta.description) || formatInstagramCaption(meta.title);
    return {
      title: caption || meta.title || null,
      thumbnail: meta.thumbnail || meta.thumbnails?.[0]?.url || null,
      uploader: meta.uploader || meta.channel || null,
      caption,
    };
  } catch (err) {
    log.info(`Instagram media preview failed for ${url}: ${err.message}`);
    const shortcode = parseInstagramUrl(url)?.shortcode;
    if (shortcode) {
      const direct = await resolveInstagramPostDirectUrls(shortcode);
      if (direct) {
        const thumb =
          direct.urls.find((u) => u.type === 'image')?.url ||
          direct.urls[0]?.url ||
          null;
        return {
          title: direct.caption || null,
          thumbnail: thumb,
          uploader: null,
          caption: direct.caption,
        };
      }
    }
    return null;
  }
}

async function fetchProfileApi(username) {
  const cookie = getInstagramCookieHeader();
  return igGet(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    {
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-IG-App-ID': IG_APP_ID,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': instagramProfileUrl(username),
      'Origin': 'https://www.instagram.com',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  );
}

async function fetchProfileAlt(username) {
  const cookie = getInstagramCookieHeader();
  const data = await igGet(
    `https://www.instagram.com/${encodeURIComponent(username)}/?__a=1&__d=dis`,
    {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  );
  return data?.graphql?.user || data?.data?.user || null;
}

function mapHighlights(user) {
  const edges = user?.edge_highlight_reels?.edges;
  if (!Array.isArray(edges)) return [];
  return edges
    .map(({ node }) => ({
      id: node?.id || node?.highlight_reel_id,
      title: node?.title || 'Highlight',
      coverUrl: node?.cover_media?.thumbnail_src || node?.cover_media_cropped_thumbnail?.url || null,
      entryCount: node?.edge_highlight_reels?.count ?? null,
    }))
    .filter((h) => h.id);
}

function buildProfileResult(base, igUser) {
  const posts = igUser.edge_owner_to_timeline_media?.count ?? null;
  const reels = igUser.edge_felix_video_timeline?.count ?? null;
  const highlights = mapHighlights(igUser);
  const isPrivate = Boolean(igUser.is_private);

  return {
    ...base,
    fullName: igUser.full_name || null,
    biography: igUser.biography || null,
    profilePicUrl: igUser.profile_pic_url_hd || igUser.profile_pic_url || null,
    isPrivate,
    requiresAuth: isPrivate,
    pending: false,
    counts: {
      posts,
      followers: igUser.edge_followed_by?.count ?? null,
      following: igUser.edge_follow?.count ?? null,
      reels,
    },
    highlights,
    targets: defaultInstagramTargets(base.username, { posts, reels }),
  };
}

/**
 * Probe a public Instagram profile. Uses IPv4 to avoid CDN shadow-blocks on IPv6.
 * Falls back gracefully — public profiles never require cookies just because the probe failed.
 */
export async function probeInstagramProfile(username) {
  const user = String(username ?? '').replace(/^@/, '').trim();
  if (!user) throw new Error('Instagram username is required');

  ensureInstagramCookieFile(loadAuthConfig());

  const base = {
    username: user,
    profileUrl: instagramProfileUrl(user),
    fullName: null,
    biography: null,
    profilePicUrl: null,
    isPrivate: false,
    requiresAuth: false,
    pending: false,
    counts: { posts: null, followers: null, following: null, reels: null },
    highlights: [],
    targets: defaultInstagramTargets(user),
  };

  try {
    const data = await fetchProfileApi(user);
    const igUser = data?.data?.user;
    if (!igUser) throw new Error('Instagram profile not found');
    log.info(`Instagram primary probe OK for @${user}`);
    return buildProfileResult(base, igUser);
  } catch (primaryErr) {
    log.info(`Instagram direct probe failed for @${user} (${primaryErr.message}), trying alt endpoint`);
  }

  try {
    const igUser = await fetchProfileAlt(user);
    if (!igUser) throw new Error('Profile not found in alt response');
    log.info(`Instagram alt probe OK for @${user}`);
    return buildProfileResult(base, igUser);
  } catch (altErr) {
    log.warn(`profile probe all fallbacks failed for @${user}: ${altErr.message}`);
  }

  try {
    const avatarUrl = await resolveInstagramAvatarUrl(user);
    if (avatarUrl) {
      log.info(`Instagram avatar-only fallback OK for @${user}`);
      return {
        ...base,
        profilePicUrl: avatarUrl,
        pending: true,
        requiresAuth: false,
        targets: defaultInstagramTargets(user),
      };
    }
  } catch (avatarErr) {
    log.warn(`avatar fallback failed for @${user}: ${avatarErr.message}`);
  }

  return {
    ...base,
    pending: true,
    requiresAuth: false,
    targets: defaultInstagramTargets(user),
  };
}

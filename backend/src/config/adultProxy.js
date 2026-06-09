import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isAdultSiteUrl, ADULT_SITE_NAMES } from '../data/adultSites.js';
import { acquireWarpSession, getWarpProxyUrl, getWarpStatus, releaseWarpSession } from './warpProxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'adult-proxy.json');

const PROXY_RE = /^(https?|socks4|socks5|socks5h):\/\/.+/i;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFileConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { enabled: false, mode: 'warp', proxy: '' };
  }
}

function validateProxyUrl(value) {
  const proxy = String(value || '').trim();
  if (!proxy) throw new Error('Proxy URL is required');
  if (!PROXY_RE.test(proxy)) {
    throw new Error('Use http://, https://, socks4://, socks5:// or socks5h:// proxy URL');
  }
  return proxy;
}

export function maskProxyUrl(proxy) {
  if (!proxy) return null;
  try {
    const parsed = new URL(proxy);
    const auth = parsed.username
      ? `${parsed.username}${parsed.password ? ':***' : ''}@`
      : '';
    return `${parsed.protocol}//${auth}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return 'configured';
  }
}

function useWarpFromEnv() {
  const v = process.env.ADULT_SITES_USE_WARP?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isWarpMode(file = loadFileConfig()) {
  if (useWarpFromEnv()) return true;
  if (file.mode === 'custom') return false;
  return file.mode === 'warp' || (!file.mode && file.enabled !== false);
}

/** Active proxy URL for custom/env modes (sync — no WARP connect). */
export function getCustomProxyUrl() {
  const envProxy = process.env.ADULT_SITES_PROXY?.trim();
  if (envProxy) return envProxy;

  const file = loadFileConfig();
  if (isWarpMode(file)) return null;
  if (file.enabled === false) return null;
  const proxy = file.proxy?.trim();
  return proxy || null;
}

export function getAdultProxyStatus() {
  const envProxy = process.env.ADULT_SITES_PROXY?.trim();
  const envWarp = useWarpFromEnv();
  const file = loadFileConfig();
  const warpMode = isWarpMode(file);
  const custom = getCustomProxyUrl();

  let source = 'none';
  let enabled = false;
  let proxy = null;

  if (envProxy) {
    source = 'env';
    enabled = true;
    proxy = maskProxyUrl(envProxy);
  } else if (envWarp || (warpMode && file.enabled !== false)) {
    source = envWarp ? 'env-warp' : 'warp';
    enabled = true;
    proxy = maskProxyUrl(getWarpProxyUrl());
  } else if (custom) {
    source = 'ui';
    enabled = true;
    proxy = maskProxyUrl(custom);
  }

  return {
    enabled,
    mode: envProxy ? 'custom' : warpMode ? 'warp' : 'custom',
    source,
    envLocked: Boolean(envProxy || envWarp),
    envWarpLocked: envWarp,
    proxy,
    uiProxy: file.proxy?.trim() ? maskProxyUrl(file.proxy.trim()) : null,
    uiEnabled: file.enabled !== false,
    uiMode: file.mode || 'warp',
    sites: ADULT_SITE_NAMES,
    scope: 'adult-ytdlp-only',
    hint:
      'WARP turns ON only during adult-site yt-dlp downloads and turns OFF when they finish. YouTube and HTTP downloads never use WARP.',
    warp: null,
  };
}

export async function getAdultProxyStatusAsync() {
  const base = getAdultProxyStatus();
  if (base.mode === 'warp' && base.enabled) {
    base.warp = await getWarpStatus();
  }
  return base;
}

export function saveAdultProxySettings({ proxy, enabled = true, mode = 'warp' }) {
  if (process.env.ADULT_SITES_PROXY?.trim()) {
    throw new Error('ADULT_SITES_PROXY is set in backend/.env — remove it to configure from the UI');
  }
  if (useWarpFromEnv()) {
    throw new Error('ADULT_SITES_USE_WARP is set in backend/.env — remove it to configure from the UI');
  }

  ensureDataDir();
  const nextMode = mode === 'custom' ? 'custom' : 'warp';
  const next = {
    enabled: enabled !== false,
    mode: nextMode,
    proxy: '',
    updatedAt: new Date().toISOString(),
  };

  if (nextMode === 'custom') {
    if (next.enabled && (!proxy || !String(proxy).trim())) {
      throw new Error('Enter a proxy URL or switch to Cloudflare WARP');
    }
    next.proxy = proxy != null && String(proxy).trim() ? validateProxyUrl(proxy) : '';
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return getAdultProxyStatus();
}

export function clearAdultProxySettings() {
  if (process.env.ADULT_SITES_PROXY?.trim()) {
    throw new Error('ADULT_SITES_PROXY is set in backend/.env');
  }
  if (useWarpFromEnv()) {
    throw new Error('ADULT_SITES_USE_WARP is set in backend/.env');
  }
  if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
  return getAdultProxyStatus();
}

export async function testAdultWarpConnection() {
  const testUrl = 'https://www.pornhub.com/';
  try {
    await beginAdultWarpForUrl(testUrl);
    const warp = await getWarpStatus();
    return { ok: true, proxy: maskProxyUrl(getWarpProxyUrl()), warp, ...(await getAdultProxyStatusAsync()) };
  } finally {
    await releaseAdultWarpForUrl(testUrl);
  }
}

/** Whether this URL will use Cloudflare WARP (not custom proxy). */
export function usesWarpForUrl(url) {
  if (!isAdultSiteUrl(url)) return false;
  if (process.env.ADULT_SITES_PROXY?.trim()) return false;
  const file = loadFileConfig();
  if (file.enabled === false && !useWarpFromEnv()) return false;
  return isWarpMode(file);
}

export async function beginAdultWarpForUrl(url) {
  if (usesWarpForUrl(url)) {
    await acquireWarpSession();
  }
}

/** Release WARP after an adult-site yt-dlp probe or download. */
export async function releaseAdultWarpForUrl(url) {
  if (usesWarpForUrl(url)) {
    await releaseWarpSession();
  }
}

/** Resolve --proxy args for adult URLs only (connects WARP when needed). */
export async function resolveProxyArgsForUrl(url) {
  // Hard gate: never proxy YouTube, Instagram, direct files, etc.
  if (!isAdultSiteUrl(url)) return [];

  const envProxy = process.env.ADULT_SITES_PROXY?.trim();
  if (envProxy) return ['--proxy', envProxy];

  const file = loadFileConfig();
  if (file.enabled === false && !useWarpFromEnv()) return [];

  if (isWarpMode(file)) {
    return ['--proxy', getWarpProxyUrl()];
  }

  const custom = file.proxy?.trim();
  if (custom) return ['--proxy', custom];
  return [];
}

/** Sync check — whether proxy would apply (for logging). */
export function proxyWouldApply(url) {
  if (!isAdultSiteUrl(url)) return false;
  if (process.env.ADULT_SITES_PROXY?.trim()) return true;
  const file = loadFileConfig();
  if (file.enabled === false && !useWarpFromEnv()) return false;
  return isWarpMode(file) || Boolean(file.proxy?.trim());
}

/** @deprecated use resolveProxyArgsForUrl */
export function proxyArgsForUrl(url) {
  if (!proxyWouldApply(url)) return [];
  const custom = getCustomProxyUrl();
  if (custom) return ['--proxy', custom];
  if (isWarpMode()) return ['--proxy', getWarpProxyUrl()];
  return [];
}

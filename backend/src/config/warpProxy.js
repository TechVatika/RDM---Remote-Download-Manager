import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const log = logger.child('warp');

const WARP_CLI = process.env.WARP_CLI_BIN || 'warp-cli';
const WARP_PORT = Number(process.env.WARP_PROXY_PORT) || 40000;
const WARP_PROXY_URL = `socks5h://127.0.0.1:${WARP_PORT}`;
const WARP_GLOBAL_ARGS = ['--accept-tos'];

/** Modes that tunnel ALL device traffic — never use these for RDM. */
const FULL_TUNNEL_MODES = new Set([
  'warp',
  'warp+doh',
  'warp+dot',
  'doh',
  'dot',
  'tunnelonly',
  'warpwithdnsoverhttps',
]);

let ensurePromise = null;
let activeSessions = 0;

function runWarp(args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(WARP_CLI, [...WARP_GLOBAL_ARGS, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`warp-cli ${args.join(' ')} timed out`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('warp-cli not found — install Cloudflare WARP (see scripts/install-cloudflare-warp.sh)'));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = `${stdout}${stderr}`.trim();
      if (code === 0) resolve(out);
      else reject(new Error(out || `warp-cli exited ${code}`));
    });
  });
}

async function warpInstalled() {
  try {
    await execFileAsync(WARP_CLI, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function warpStatusText() {
  try {
    return await runWarp(['status'], 8000);
  } catch (err) {
    return err.message || '';
  }
}

function parseConnected(statusText) {
  const s = statusText.toLowerCase();
  if (s.includes('disconnected')) return false;
  if (s.includes('connecting')) return false;
  return /\bconnected\b/.test(s);
}

async function waitForConnected(maxMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const status = await warpStatusText();
    if (parseConnected(status)) {
      await waitForProxyPort(Math.max(5000, maxMs - (Date.now() - started)));
      return status;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('WARP connect timed out — check: warp-cli --accept-tos status');
}

async function waitForProxyPort(maxMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      await execFileAsync(
        'curl',
        [
          '-fsS',
          '--socks5-hostname',
          `127.0.0.1:${WARP_PORT}`,
          '--max-time',
          '5',
          'https://cloudflare.com/cdn-cgi/trace',
        ],
        { timeout: 8000 },
      );
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`WARP SOCKS proxy not ready on 127.0.0.1:${WARP_PORT}`);
}

function normalizeMode(raw) {
  if (!raw) return null;
  const m = String(raw).trim().toLowerCase();
  if (m.includes('warpproxy') || m === 'proxy') return 'proxy';
  if (m.includes('warp+doh')) return 'warp+doh';
  if (m.includes('warp+dot')) return 'warp+dot';
  if (m.includes('tunnel')) return 'tunnelonly';
  if (m.startsWith('warp')) return 'warp';
  return m.split(/\s+/)[0];
}

function parseMode(statusText) {
  const match = statusText.match(/mode:\s*(.+)/i);
  if (match) return normalizeMode(match[1]);
  if (/warpproxy/i.test(statusText)) return 'proxy';
  return null;
}

async function warpSettingsText() {
  try {
    return await runWarp(['settings'], 8000);
  } catch {
    return '';
  }
}

async function getCurrentMode() {
  const settings = await warpSettingsText();
  const fromSettings = parseMode(settings);
  if (fromSettings) return fromSettings;
  return parseMode(await warpStatusText());
}

function isFullTunnelMode(mode) {
  if (!mode) return false;
  return FULL_TUNNEL_MODES.has(mode.replace(/[^a-z+]/gi, ''));
}

export async function disconnectWarp() {
  try {
    await runWarp(['disconnect'], 10000);
    log.info('WARP turned OFF (disconnected)');
  } catch {
    /* already disconnected */
  }
}

async function setProxyMode() {
  for (const args of [
    ['mode', 'proxy'],
    ['set-mode', 'proxy'],
  ]) {
    try {
      await runWarp(args, 10000);
      return;
    } catch {
      /* try legacy command */
    }
  }
  throw new Error('Could not set WARP to proxy mode (local SOCKS only — not full tunnel)');
}

async function setProxyPort() {
  for (const args of [
    ['proxy', 'port', String(WARP_PORT)],
    ['set-proxy-port', String(WARP_PORT)],
  ]) {
    try {
      await runWarp(args, 10000);
      return;
    } catch {
      /* try legacy command */
    }
  }
}

async function registerIfNeeded(statusText) {
  const lower = statusText.toLowerCase();
  if (lower.includes('registration missing') || lower.includes('not registered')) {
    await runWarp(['registration', 'new'], 20000).catch(async () => {
      await runWarp(['register'], 20000);
    });
  }
}

async function acceptTermsIfNeeded() {
  try {
    await runWarp(['registration', 'show'], 8000);
  } catch (err) {
    const msg = err.message || '';
    if (/terms of service|accept-tos/i.test(msg)) {
      throw new Error('WARP Terms of Service must be accepted — run: warp-cli --accept-tos registration new');
    }
    if (/registration missing|not registered/i.test(msg)) {
      await runWarp(['registration', 'new'], 20000);
    }
  }
}

/** Force local SOCKS proxy mode — never full-system WARP tunnel. */
async function ensureProxyModeOnly() {
  await acceptTermsIfNeeded();

  let status = await warpStatusText();
  await registerIfNeeded(status);

  const mode = await getCurrentMode();
  if (isFullTunnelMode(mode) || (mode && mode !== 'proxy')) {
    await disconnectWarp();
    await setProxyMode();
    status = await warpStatusText();
  } else if (!mode) {
    await setProxyMode();
  }

  await setProxyPort();

  const finalMode = await getCurrentMode();
  if (finalMode && finalMode !== 'proxy') {
    throw new Error(
      `WARP must stay in proxy mode (got "${finalMode}"). Full tunnel would route all server traffic.`,
    );
  }

  return status;
}

async function ensureWarpConnectedAndReady() {
  await ensureProxyModeOnly();

  const ensureUp = async () => {
    const status = await warpStatusText();
    if (!parseConnected(status)) {
      await runWarp(['connect'], 20000);
    }
    await waitForConnected(30000);
  };

  try {
    await waitForProxyPort(3000);
  } catch {
    await ensureUp();
    return;
  }

  // Connected in status but SOCKS not responding — reconnect
  try {
    await waitForProxyPort(2000);
  } catch {
    await disconnectWarp();
    await ensureUp();
  }
}

async function connectWarpOnce() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (!(await warpInstalled())) {
      throw new Error(
        'Cloudflare WARP is not installed. Run: sudo bash scripts/install-cloudflare-warp.sh',
      );
    }

    await ensureWarpConnectedAndReady();

    const mode = await getCurrentMode();
    if (isFullTunnelMode(mode)) {
      await disconnectWarp();
      await setProxyMode();
      throw new Error('WARP was in full-tunnel mode — switched to proxy mode. Retry the download.');
    }

    log.info('WARP turned ON (connected for adult-site download)', { port: WARP_PORT });
    return WARP_PROXY_URL;
  })();

  try {
    return await ensurePromise;
  } catch (err) {
    if (activeSessions > 0) activeSessions -= 1;
    throw err;
  } finally {
    ensurePromise = null;
  }
}

/** Verify SOCKS proxy is up while a session is held. */
export async function verifyWarpProxyReady() {
  await waitForProxyPort(10000);
}

/**
 * Turn WARP on for one adult-site yt-dlp session. Reference-counted for concurrent downloads.
 */
export async function acquireWarpSession() {
  activeSessions += 1;
  if (activeSessions > 1) {
    await verifyWarpProxyReady();
    return WARP_PROXY_URL;
  }
  return connectWarpOnce();
}

/**
 * Turn WARP off when no adult-site downloads remain.
 */
export async function releaseWarpSession() {
  if (activeSessions <= 0) {
    activeSessions = 0;
    return;
  }
  activeSessions -= 1;
  if (activeSessions === 0) {
    await disconnectWarp();
  }
}

/** Disconnect on worker/API startup if no download is using WARP. */
export async function disconnectWarpWhenIdle() {
  if (activeSessions === 0) {
    await disconnectWarp();
  }
}

export function getWarpActiveSessions() {
  return activeSessions;
}

/** @deprecated use acquireWarpSession */
export async function ensureWarpReady() {
  return acquireWarpSession();
}

export function getWarpProxyUrl() {
  return WARP_PROXY_URL;
}

export async function getWarpStatus() {
  const installed = await warpInstalled();
  if (!installed) {
    return {
      installed: false,
      connected: false,
      mode: null,
      proxy: WARP_PROXY_URL,
      port: WARP_PORT,
      activeSessions,
      scope: 'adult-ytdlp-only',
      hint: 'Install with: sudo bash scripts/install-cloudflare-warp.sh',
    };
  }

  const statusText = await warpStatusText();
  const mode = (await getCurrentMode()) || parseMode(statusText);
  return {
    installed: true,
    connected: parseConnected(statusText),
    mode,
    fullTunnel: isFullTunnelMode(mode),
    proxy: WARP_PROXY_URL,
    port: WARP_PORT,
    activeSessions,
    scope: 'adult-ytdlp-only',
    statusText: statusText.split('\n').slice(0, 6).join(' · '),
    hint:
      activeSessions > 0
        ? `WARP is ON (${activeSessions} adult download${activeSessions === 1 ? '' : 's'}). Turns OFF when finished.`
        : 'WARP is OFF. Connects automatically only during adult-site downloads.',
  };
}

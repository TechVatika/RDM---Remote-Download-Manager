#!/usr/bin/env node
/*
 * Site compatibility checker for RDM.
 *
 * Verifies that the installed yt-dlp can actually extract from the platforms in
 * the catalog, using the SAME strategy the app uses (normal first, then browser
 * impersonation on anti-bot blocks).
 *
 * Usage:
 *   node scripts/check-sites.mjs                # run the built-in representative set
 *   node scripts/check-sites.mjs <url> [url...] # check specific URLs
 *   node scripts/check-sites.mjs --category audio   # only one category
 *
 * Notes:
 *   - "DRM/login/region" platforms are reported as KNOWN-LIMITED without a live
 *     test, because no extractor can bypass DRM or paywalls. That is expected.
 *   - A FAIL here usually means the public test URL rotted or the site changed;
 *     try a fresh public URL from that site.
 */
import { spawn } from 'node:child_process';

const YTDLP = process.env.YTDLP_BIN || 'yt-dlp';
const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS) || 45000;
const CONCURRENCY = Number(process.env.CHECK_CONCURRENCY) || 3;

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

// Representative PUBLIC, non-DRM test URLs (one per platform where one exists).
// Grouped by the catalog's categories.
const CATALOG = [
  // --- Video & streaming (freely downloadable) ---
  { cat: 'video', name: 'YouTube', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
  { cat: 'video', name: 'Vimeo', url: 'https://vimeo.com/76979871' },
  { cat: 'video', name: 'Dailymotion', url: 'https://www.dailymotion.com/video/x2hwqn9' },
  { cat: 'video', name: 'TED', url: 'https://www.ted.com/talks/bill_gates_the_next_outbreak_we_re_not_ready' },
  { cat: 'video', name: 'Rumble', url: 'https://rumble.com/vsxhxg-the-most-relaxing-video.html' },
  { cat: 'video', name: 'Odysee', url: 'https://odysee.com/@Odysee:8/odysee-explained:1' },
  { cat: 'video', name: 'Streamable', url: 'https://streamable.com/moo' },
  { cat: 'video', name: 'Coub', url: 'https://coub.com/view/1b3kqd' },
  { cat: 'video', name: 'BitChute', url: 'https://www.bitchute.com/video/3pNG558P7nNg/' },

  // --- Social ---
  { cat: 'social', name: 'TikTok', url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' },
  { cat: 'social', name: 'Reddit', url: 'https://www.reddit.com/r/aww/comments/8gqi6r/' },
  { cat: 'social', name: 'X (Twitter)', url: 'https://twitter.com/jack/status/20' },
  { cat: 'social', name: 'Imgur', url: 'https://imgur.com/gallery/just-cat-tax-Zb2VcFY' },

  // --- Audio & podcasts ---
  { cat: 'audio', name: 'SoundCloud', url: 'https://soundcloud.com/forss/flickermood' },
  { cat: 'audio', name: 'Bandcamp', url: 'https://c418.bandcamp.com/track/aria-math' },
  { cat: 'audio', name: 'Mixcloud', url: 'https://www.mixcloud.com/spartacus/party-time/' },
  { cat: 'audio', name: 'Bandcamp(alb)', url: 'https://c418.bandcamp.com/album/minecraft-volume-alpha' },

  // --- Cloud & files ---
  { cat: 'cloud', name: 'Archive.org', url: 'https://archive.org/details/BigBuckBunny_124' },

  // --- News / public broadcasters (often region-restricted) ---
  { cat: 'news', name: 'BBC', url: 'https://www.bbc.co.uk/programmes/p01vblpf', region: true },
  { cat: 'social', name: 'Bluesky', url: 'https://bsky.app/profile/bsky.app/post/3krunl2bgtm2j' },
];

// Platforms that cannot be auto-verified: DRM, paywall, or login/region gated.
// Listed honestly so users know not to expect full downloads.
const KNOWN_LIMITED = {
  'Crunchyroll': 'Free episodes only; premium is DRM (Widevine) — cannot bypass',
  'Funimation': 'Merged into Crunchyroll; DRM for premium',
  'Hotstar / JioCinema / SonyLIV / Zee5': 'India OTT — login + DRM for most content',
  'DAZN': 'Sports paywall + DRM',
  'Spotify / Tidal / Deezer': 'Music is DRM — only previews/metadata',
  'Apple/Google Podcasts': 'Episodes work if a public audio URL exists; some DRM',
  'Udemy / Pluralsight / Skillshare / LinkedIn Learning': 'Paid courses need login cookies; some DRM',
  'Netflix-style OTT': 'Widevine DRM — not downloadable by yt-dlp',
  'Instagram / Facebook (private)': 'Public works; private/Stories need browser cookies',
  'Adult sites (Pornhub/XVideos/...)': 'Work via yt-dlp; age-gated content needs cookies + WARP/proxy',
};

function runYtdlp(args) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      err += '\n[timeout]';
    }, TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: `spawn failed: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

let impersonateTarget;
async function getImpersonate() {
  if (impersonateTarget !== undefined) return impersonateTarget;
  const { out } = await runYtdlp(['--list-impersonate-targets']);
  const ok = out
    .split('\n')
    .some((l) => /curl_cffi$/.test(l.trim()) && !/unavailable/i.test(l) && /^[A-Za-z]/.test(l.trim()));
  impersonateTarget = ok ? 'chrome' : '';
  return impersonateTarget;
}

function isBlockLike(s = '') {
  return /\b403\b|\b429\b|forbidden|unable to download webpage|too many requests|not a bot|enable javascript|cloudflare|just a moment|challenge|access denied|blocked|fingerprint/i.test(
    s,
  );
}

// Distinguish a broken integration from a simply-dead test URL.
function classify(error) {
  if (/unsupported url/i.test(error)) return 'unsupported';
  if (/authentication|--cookies|log ?in|sign ?in|account|private/i.test(error)) return 'login';
  if (/\b403\b|\b429\b|forbidden|cloudflare|not a bot|just a moment|blocked|geo|not available in|region/i.test(error))
    return 'blocked';
  if (/404|not found|no video|unavailable|removed|deleted|does not exist|can'?t find|gone/i.test(error))
    return 'gone'; // extractor reached the site; the test video is just gone
  return 'error';
}

async function checkUrl(url) {
  const base = ['--simulate', '--no-warnings', '--no-playlist', '--playlist-items', '1', '-O', '%(title)s'];
  let res = await runYtdlp([...base, url]);
  let impersonated = false;
  if (res.code !== 0 && isBlockLike(res.err)) {
    const t = await getImpersonate();
    if (t) {
      impersonated = true;
      res = await runYtdlp([...base, '--impersonate', t, url]);
    }
  }
  const firstErr = (res.err || '').split('\n').filter(Boolean).pop() || '';
  const cleanErr = firstErr.replace(/^ERROR:\s*/, '');
  return {
    ok: res.code === 0,
    kind: res.code === 0 ? 'ok' : classify(cleanErr),
    title: res.out.trim().split('\n')[0] || '',
    error: cleanErr.slice(0, 110),
    impersonated,
  };
}

async function runPool(items, fn) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  let targets = CATALOG;

  const urlArgs = args.filter((a) => /^https?:\/\//i.test(a));
  if (urlArgs.length) {
    targets = urlArgs.map((url) => ({ cat: 'custom', name: new URL(url).hostname, url }));
  } else {
    const catIdx = args.indexOf('--category');
    if (catIdx !== -1 && args[catIdx + 1]) {
      targets = CATALOG.filter((t) => t.cat === args[catIdx + 1]);
    }
  }

  const imp = await getImpersonate();
  console.log(`\n${C.bold}RDM site compatibility check${C.reset}`);
  console.log(`${C.dim}yt-dlp: ${YTDLP} | impersonation: ${imp ? `${C.green}available (${imp})` : `${C.yellow}unavailable`}${C.reset}`);
  console.log(`${C.dim}Testing ${targets.length} public URL(s), ${CONCURRENCY} at a time, ${TIMEOUT_MS / 1000}s timeout each${C.reset}\n`);

  const counts = { ok: 0, gone: 0, login: 0, blocked: 0, unsupported: 0, error: 0 };
  const results = await runPool(targets, async (t) => ({ t, r: await checkUrl(t.url) }));

  for (const { t, r } of results) {
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    if (r.kind === 'ok') {
      const tag = r.impersonated ? `${C.cyan}[impersonated]${C.reset} ` : '';
      console.log(`${C.green}✓ WORKS     ${C.reset}${t.name.padEnd(16)} ${tag}${C.dim}${r.title.slice(0, 55)}${C.reset}`);
    } else if (r.kind === 'gone') {
      console.log(`${C.green}✓ EXTRACTOR OK ${C.reset}${t.name.padEnd(13)} ${C.dim}test video gone — use a live URL${C.reset}`);
    } else if (r.kind === 'login') {
      console.log(`${C.yellow}⚠ NEEDS COOKIES${C.reset} ${t.name.padEnd(13)} ${C.dim}${r.error}${C.reset}`);
    } else if (r.kind === 'blocked') {
      console.log(`${C.yellow}⚠ BLOCKED/GEO  ${C.reset} ${t.name.padEnd(13)} ${C.dim}${r.error}${C.reset}`);
    } else if (r.kind === 'unsupported') {
      console.log(`${C.red}✗ NO EXTRACTOR ${C.reset} ${t.name.padEnd(13)} ${C.dim}not a recognized media URL${C.reset}`);
    } else {
      console.log(`${C.red}✗ ERROR     ${C.reset}${t.name.padEnd(16)} ${C.dim}${r.error}${C.reset}`);
    }
  }

  const working = counts.ok + counts.gone;
  console.log(
    `\n${C.bold}Summary:${C.reset} ${C.green}${working} extractor(s) working${C.reset}` +
      ` (${counts.ok} downloaded, ${counts.gone} reached but test URL dead)` +
      `${counts.login ? `, ${C.yellow}${counts.login} need cookies${C.reset}` : ''}` +
      `${counts.blocked ? `, ${C.yellow}${counts.blocked} blocked/geo${C.reset}` : ''}` +
      `${counts.unsupported || counts.error ? `, ${C.red}${counts.unsupported + counts.error} broken${C.reset}` : ''}`,
  );

  if (!urlArgs.length) {
    console.log(`\n${C.bold}Known-limited platforms (by design — not auto-tested):${C.reset}`);
    for (const [name, note] of Object.entries(KNOWN_LIMITED)) {
      console.log(`  ${C.yellow}•${C.reset} ${name}: ${C.dim}${note}${C.reset}`);
    }
    console.log(`\n${C.dim}Tip: check any specific link with:  node scripts/check-sites.mjs "<url>"${C.reset}\n`);
  }

  const brokenCount = counts.unsupported + counts.error;
  process.exit(brokenCount > 0 && urlArgs.length ? 1 : 0);
}

main();

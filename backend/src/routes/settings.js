import { Router } from 'express';

import {
  getAuthStatus,
  saveAuthSettings,
  saveCookiesUpload,
  clearAuth,
} from '../config/cookies.js';
import { getAiRenameConfig } from '../utils/aiRename.js';
import { getSpeedConfig } from '../config/speed.js';
import {
  getAdultProxyStatus,
  getAdultProxyStatusAsync,
  saveAdultProxySettings,
  clearAdultProxySettings,
  releaseAdultWarpForUrl,
  testAdultWarpConnection,
} from '../config/adultProxy.js';
import { COOKIES_GUIDE } from '../data/platforms.js';

const router = Router();

router.get('/', (_req, res) => {
  const aiRename = getAiRenameConfig();
  res.json({
    publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
    aiRename,
    downloadPaths: {
      base: process.env.DOWNLOAD_BASE_PATH || '/mnt/4tb-1/RDM/downloads',
      folders: ['general', 'movies', 'software'],
    },
    connections: getSpeedConfig(),
    speed: getSpeedConfig(),
    howItWorks: {
      title: 'Zero-login mode (default)',
      points: [
        'Paste a PUBLIC post URL → Fetch Media Formats → download.',
        'Paste a direct file link (.mp4, .mkv, .zip) → Direct Download with up to 32 parallel chunks.',
        'URLs are auto-cleaned (tracking params removed, mobile links fixed).',
        'Private / friends-only / login-walled content cannot be downloaded without authentication — that is enforced by Instagram, Facebook, etc., not by RDM.',
      ],
      worksWithoutLogin: [
        'YouTube public videos',
        'Instagram public posts & public Reels',
        'TikTok public videos',
        'X/Twitter public posts',
        'Pinterest public pins',
        'Facebook public pages & public videos',
        'Vimeo, Reddit, SoundCloud public content',
        'Any direct HTTP/HTTPS file URL',
      ],
      needsPublicLink: [
        'Private Instagram profiles or close-friends stories',
        'Private Facebook groups or friends-only videos',
        'Age-gated or subscriber-only content',
      ],
      alternative:
        'For private Instagram/Facebook, configure authentication in Platform Settings and set PUBLIC_MEDIA_ONLY=false in backend .env.',
    },
  });
});

router.get('/auth', async (_req, res) => {
  try {
    res.json({
      publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
      cookiesGuide: COOKIES_GUIDE,
      adultProxy: await getAdultProxyStatusAsync(),
      ...getAuthStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth', (req, res) => {
  try {
    const status = saveAuthSettings(req.body || {});
    res.json({
      ok: true,
      publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
      cookiesGuide: COOKIES_GUIDE,
      ...status,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cookies', (req, res) => {
  try {
    const content = req.body?.content ?? req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Send cookies as { "content": "..." }' });
    }
    const status = saveCookiesUpload(content);
    res.json({
      ok: true,
      publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
      cookiesGuide: COOKIES_GUIDE,
      ...status,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/auth', (_req, res) => {
  res.json({
    ok: true,
    publicMediaOnly: process.env.PUBLIC_MEDIA_ONLY !== 'false',
    cookiesGuide: COOKIES_GUIDE,
    adultProxy: getAdultProxyStatus(),
    ...clearAuth(),
  });
});

router.get('/adult-proxy', async (_req, res) => {
  try {
    res.json(await getAdultProxyStatusAsync());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/adult-proxy/warp-connect', async (_req, res) => {
  try {
    const result = await testAdultWarpConnection();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/adult-proxy', (req, res) => {
  try {
    const { proxy, enabled, mode } = req.body || {};
    const status = saveAdultProxySettings({ proxy, enabled, mode });
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/adult-proxy', (_req, res) => {
  try {
    res.json({ ok: true, ...clearAdultProxySettings() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

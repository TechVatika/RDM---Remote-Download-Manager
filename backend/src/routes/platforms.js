import { Router } from 'express';
import {
  PLATFORM_CATEGORIES,
  PLATFORM_TOTAL,
  COOKIES_PLATFORMS,
  NOT_SUPPORTED,
  COOKIES_GUIDE,
} from '../data/platforms.js';
import { PLATFORM_URL_RULES, analyzeUrl } from '../data/platformHosts.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    totalListed: PLATFORM_TOTAL,
    extractorCount: '1800+',
    extractorsCommand: 'yt-dlp --list-extractors',
    categories: PLATFORM_CATEGORIES,
    cookiesPlatforms: COOKIES_PLATFORMS,
    notSupported: NOT_SUPPORTED,
    cookiesGuide: COOKIES_GUIDE,
    urlRules: PLATFORM_URL_RULES,
    autoDetect: {
      enabled: true,
      description:
        'Paste any supported site URL — RDM auto-detects the platform and uses yt-dlp for media pages or IDM-style HTTP for direct files.',
    },
  });
});

router.post('/detect', (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    new URL(url.trim());
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  res.json(analyzeUrl(url.trim()));
});

export default router;

/**
 * URL → platform mapping for auto-detection and yt-dlp routing.
 * Order matters: first match wins (put specific hosts before generic ones).
 */
export const DIRECT_FILE_RE =
  /\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v|mp3|m4a|aac|flac|wav|ogg|opus|zip|rar|7z|tar|gz|bz2|xz|pdf|exe|dmg|iso|apk|deb|rpm|jpg|jpeg|png|gif|webp|svg|txt|csv|json|xml|torrent|bin|msi|pkg|wasm|webp)(\?|#|$)/i;

/** @type {{ fragments: string[], name: string, cookies?: boolean, ageGate?: boolean, httpOnly?: boolean }[]} */
export const PLATFORM_URL_RULES = [
  // YouTube family
  { fragments: ['music.youtube.com'], name: 'YouTube Music' },
  { fragments: ['youtu.be', 'youtube.com'], name: 'YouTube' },

  // Social
  { fragments: ['instagram.com'], name: 'Instagram', cookies: true },
  { fragments: ['facebook.com', 'fb.watch', 'fb.com', 'm.facebook.com'], name: 'Facebook', cookies: true },
  { fragments: ['tiktok.com', 'vm.tiktok.com'], name: 'TikTok' },
  { fragments: ['twitter.com', 'x.com', 'mobile.twitter.com'], name: 'X (Twitter)' },
  { fragments: ['pinterest.com', 'pin.it'], name: 'Pinterest' },
  { fragments: ['v.redd.it', 'redd.it', 'reddit.com'], name: 'Reddit' },
  { fragments: ['linkedin.com', 'lnkd.in'], name: 'LinkedIn' },
  { fragments: ['tumblr.com'], name: 'Tumblr' },
  { fragments: ['threads.net'], name: 'Threads' },
  { fragments: ['bsky.app', 'bsky.social'], name: 'Bluesky' },
  { fragments: ['snapchat.com'], name: 'Snapchat' },
  { fragments: ['vk.com', 'vk.ru', 'vkvideo.ru'], name: 'VK' },
  { fragments: ['ok.ru', 'odnoklassniki.ru'], name: 'OK.ru' },
  { fragments: ['weibo.com', 'weibo.cn'], name: 'Weibo' },
  { fragments: ['mastodon.social', 'mastodon.online', 'mas.to'], name: 'Mastodon' },

  // Video & streaming
  { fragments: ['vimeo.com', 'player.vimeo.com'], name: 'Vimeo' },
  { fragments: ['dailymotion.com', 'dai.ly'], name: 'Dailymotion' },
  { fragments: ['twitch.tv', 'clips.twitch.tv'], name: 'Twitch' },
  { fragments: ['kick.com'], name: 'Kick' },
  { fragments: ['rumble.com'], name: 'Rumble' },
  { fragments: ['bilibili.com', 'b23.tv'], name: 'Bilibili' },
  { fragments: ['nicovideo.jp', 'nico.ms'], name: 'Niconico' },
  { fragments: ['rutube.ru'], name: 'Rutube' },
  { fragments: ['youku.com'], name: 'Youku' },
  { fragments: ['iq.com', 'iqiyi.com'], name: 'IQiyi' },
  { fragments: ['nbc.com', 'nbcsports.com'], name: 'NBC' },
  { fragments: ['cbs.com', 'cbsnews.com'], name: 'CBS' },
  { fragments: ['abc.com', 'abcnews.go.com', 'go.com'], name: 'ABC' },
  { fragments: ['fox.com', 'foxnews.com', 'foxsports.com'], name: 'Fox' },
  { fragments: ['bbc.co.uk', 'bbci.co.uk', 'bbc.com'], name: 'BBC iPlayer' },
  { fragments: ['itv.com'], name: 'ITV' },
  { fragments: ['channel4.com'], name: 'Channel 4' },
  { fragments: ['sky.com', 'news.sky.com'], name: 'Sky News' },
  { fragments: ['aljazeera.com'], name: 'Al Jazeera' },
  { fragments: ['cnn.com'], name: 'CNN' },
  { fragments: ['msnbc.com'], name: 'MSNBC' },
  { fragments: ['francetv.fr', 'france.tv'], name: 'France TV' },
  { fragments: ['arte.tv'], name: 'Arte TV' },
  { fragments: ['rtve.es'], name: 'RTVE' },
  { fragments: ['zdf.de'], name: 'ZDF' },
  { fragments: ['ard.de', 'ardmediathek.de'], name: 'ARD' },
  { fragments: ['nhk.or.jp'], name: 'NHK' },
  { fragments: ['ted.com'], name: 'TED' },
  { fragments: ['c-span.org'], name: 'C-SPAN' },
  { fragments: ['crunchyroll.com'], name: 'Crunchyroll' },
  { fragments: ['funimation.com'], name: 'Funimation' },
  { fragments: ['vrv.co'], name: 'VRV' },
  { fragments: ['pluto.tv'], name: 'Pluto TV' },
  { fragments: ['odysee.com', 'lbry.tv'], name: 'Odysee / LBRY' },
  { fragments: ['peertube.'], name: 'PeerTube' },
  { fragments: ['bitchute.com'], name: 'BitChute' },
  { fragments: ['streamable.com'], name: 'Streamable' },
  { fragments: ['loom.com'], name: 'Loom' },
  { fragments: ['wistia.com', 'wistia.net'], name: 'Wistia' },
  { fragments: ['vidyard.com'], name: 'Vidyard' },
  { fragments: ['sproutvideo.com'], name: 'SproutVideo' },
  { fragments: ['brightcove.com', 'bcove.video'], name: 'Brightcove' },
  { fragments: ['kaltura.com'], name: 'Kaltura' },
  { fragments: ['panopto.com'], name: 'Panopto' },
  { fragments: ['mediasite.com'], name: 'Mediasite' },
  { fragments: ['liveleak.com'], name: 'LiveLeak' },
  { fragments: ['veoh.com'], name: 'Veoh' },
  { fragments: ['metacafe.com'], name: 'Metacafe' },
  { fragments: ['coub.com'], name: 'Coub' },
  { fragments: ['imgur.com'], name: 'Imgur' },
  { fragments: ['gfycat.com'], name: 'Gfycat' },
  { fragments: ['redgifs.com'], name: 'RedGifs' },

  // Audio & podcasts
  { fragments: ['soundcloud.com'], name: 'SoundCloud' },
  { fragments: ['bandcamp.com'], name: 'Bandcamp' },
  { fragments: ['mixcloud.com'], name: 'Mixcloud' },
  { fragments: ['audiomack.com'], name: 'Audiomack' },
  { fragments: ['open.spotify.com', 'spotify.com'], name: 'Spotify' },
  { fragments: ['podcasts.apple.com'], name: 'Apple Podcasts' },
  { fragments: ['podcasts.google.com'], name: 'Google Podcasts' },
  { fragments: ['anchor.fm'], name: 'Anchor' },
  { fragments: ['simplecast.com'], name: 'Simplecast' },
  { fragments: ['buzzsprout.com'], name: 'Buzzsprout' },
  { fragments: ['libsyn.com'], name: 'Libsyn' },
  { fragments: ['podbean.com'], name: 'Podbean' },
  { fragments: ['hypem.com'], name: 'Hype Machine' },
  { fragments: ['last.fm'], name: 'Last.fm' },
  { fragments: ['deezer.com'], name: 'Deezer' },
  { fragments: ['tidal.com'], name: 'Tidal' },
  { fragments: ['audius.co'], name: 'Audius' },
  { fragments: ['radiofrance.fr'], name: 'Radio France' },
  { fragments: ['npr.org'], name: 'NPR' },
  { fragments: ['cbc.ca'], name: 'CBC' },
  { fragments: ['ra.co'], name: 'RA (Resident Advisor)' },

  // Live
  { fragments: ['dlive.tv'], name: 'DLive' },
  { fragments: ['trovo.live'], name: 'Trovo' },
  { fragments: ['caffeine.tv'], name: 'Caffeine' },
  { fragments: ['restream.io'], name: 'Restream' },
  { fragments: ['zoom.us'], name: 'Zoom recordings' },

  // Cloud & files (yt-dlp handles share links)
  { fragments: ['drive.google.com', 'docs.google.com'], name: 'Google Drive' },
  { fragments: ['dropbox.com', 'dl.dropboxusercontent.com'], name: 'Dropbox' },
  { fragments: ['onedrive.live.com', '1drv.ms', 'sharepoint.com'], name: 'OneDrive' },
  { fragments: ['box.com'], name: 'Box' },
  { fragments: ['mediafire.com'], name: 'MediaFire' },
  { fragments: ['mega.nz'], name: 'Mega.nz' },
  { fragments: ['4shared.com'], name: '4shared' },
  { fragments: ['gofile.io'], name: 'GoFile' },
  { fragments: ['pixeldrain.com'], name: 'Pixeldrain' },
  { fragments: ['catbox.moe', 'files.catbox.moe'], name: 'Catbox' },
  { fragments: ['archive.org'], name: 'Archive.org' },
  { fragments: ['github.com', 'raw.githubusercontent.com'], name: 'GitHub Releases' },
  { fragments: ['gitlab.com'], name: 'GitLab' },
  { fragments: ['sourceforge.net'], name: 'SourceForge' },

  // Education
  { fragments: ['khanacademy.org'], name: 'Khan Academy' },
  { fragments: ['coursera.org'], name: 'Coursera' },
  { fragments: ['udemy.com'], name: 'Udemy' },
  { fragments: ['skillshare.com'], name: 'Skillshare' },
  { fragments: ['pluralsight.com'], name: 'Pluralsight' },
  { fragments: ['edx.org'], name: 'edX' },
  { fragments: ['ocw.mit.edu', 'mit.edu'], name: 'MIT OpenCourseWare' },
  { fragments: ['online.stanford.edu', 'stanford.edu'], name: 'Stanford Online' },
  { fragments: ['instructure.com', 'canvas.'], name: 'Canvas LMS' },
  { fragments: ['blackboard.com'], name: 'Blackboard' },
  { fragments: ['moodle.'], name: 'Moodle' },

  // Sports
  { fragments: ['espn.com'], name: 'ESPN' },
  { fragments: ['nba.com'], name: 'NBA' },
  { fragments: ['nfl.com'], name: 'NFL' },
  { fragments: ['mlb.com'], name: 'MLB' },
  { fragments: ['ufc.com'], name: 'UFC' },
  { fragments: ['formula1.com'], name: 'Formula 1' },
  { fragments: ['olympics.com'], name: 'Olympics' },
  { fragments: ['dazn.com'], name: 'DAZN' },

  // Regional
  { fragments: ['hotstar.com'], name: 'Hotstar' },
  { fragments: ['jiocinema.com'], name: 'JioCinema' },
  { fragments: ['sonyliv.com'], name: 'SonyLIV' },
  { fragments: ['zee5.com'], name: 'Zee5' },
  { fragments: ['abema.tv'], name: 'AbemaTV' },
  { fragments: ['tver.jp'], name: 'TVer' },
  { fragments: ['afreecatv.com'], name: 'AfreecaTV' },
  { fragments: ['tv.naver.com', 'naver.com'], name: 'Naver TV' },
  { fragments: ['tv.kakao.com'], name: 'KakaoTV' },
  { fragments: ['douyin.com'], name: 'Douyin' },
  { fragments: ['v.qq.com'], name: 'Tencent Video' },

  // Adult / other
  { fragments: ['pornhub.com', 'pornhub.org', 'pornhub.net', 'phncdn.com'], name: 'Pornhub', ageGate: true },
  { fragments: ['xvideos.com'], name: 'XVideos', ageGate: true },
  { fragments: ['xhamster.com'], name: 'XHamster', ageGate: true },
  { fragments: ['redtube.com'], name: 'RedTube', ageGate: true },
  { fragments: ['youporn.com'], name: 'YouPorn', ageGate: true },
  { fragments: ['spankbang.com'], name: 'SpankBang', ageGate: true },
  { fragments: ['xnxx.com'], name: 'XNXX', ageGate: true },
  { fragments: ['eporner.com'], name: 'Eporner', ageGate: true },
  { fragments: ['newgrounds.com'], name: 'Newgrounds' },
  { fragments: ['gamespot.com'], name: 'GameSpot' },
  { fragments: ['ign.com'], name: 'IGN' },
  { fragments: ['steampowered.com', 'steamcommunity.com'], name: 'Steam' },
  { fragments: ['playstation.com'], name: 'PlayStation' },
  { fragments: ['xbox.com'], name: 'Xbox' },
  { fragments: ['nintendo.com'], name: 'Nintendo' },
  { fragments: ['openrec.tv'], name: 'OpenRec' },
];

const PAGE_PATH_HINTS =
  /\/(watch|video|embed|player|play|clip|clips|reel|reels|shorts|live|v|e|posts?|status|share|stories|story|tv|view_video|album|track|playlist|podcast|episode|lecture|course|lesson)\b/i;

function normalizeUrl(raw) {
  return String(raw || '').trim();
}

function parseUrl(raw) {
  try {
    return new URL(normalizeUrl(raw));
  } catch {
    return null;
  }
}

export function isDirectFileUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return DIRECT_FILE_RE.test(parsed.pathname);
}

export function matchPlatformRule(url) {
  const parsed = parseUrl(url);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();
  const full = `${host}${parsed.pathname}`.toLowerCase();

  for (const rule of PLATFORM_URL_RULES) {
    if (rule.httpOnly) continue;
    for (const frag of rule.fragments) {
      const f = frag.toLowerCase();
      if (host.includes(f) || full.includes(f)) {
        return rule;
      }
    }
  }
  return null;
}

export function detectPlatformFromUrl(url) {
  const rule = matchPlatformRule(url);
  if (rule) return rule.name;
  if (isDirectFileUrl(url)) return 'Direct HTTP';
  if (looksLikeWebPage(url)) return 'Media (auto)';
  return 'Direct HTTP';
}

export function looksLikeWebPage(url) {
  if (isDirectFileUrl(url)) return false;
  const parsed = parseUrl(url);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return false;

  const host = parsed.hostname.toLowerCase();
  if (!host.includes('.')) return false;

  if (PAGE_PATH_HINTS.test(parsed.pathname)) return true;

  const last = parsed.pathname.split('/').filter(Boolean).pop() || '';
  if (last && !/\.\w{2,5}$/.test(last) && parsed.pathname.length > 1) return true;

  return false;
}

export function isMediaSiteUrl(url) {
  if (isDirectFileUrl(url)) return false;
  if (matchPlatformRule(url)) return true;
  return looksLikeWebPage(url);
}

export function resolveDownloadType(url, requestedType = 'http') {
  if (requestedType === 'media') return 'media';
  if (isDirectFileUrl(url)) return 'http';
  if (isMediaSiteUrl(url)) return 'media';
  return 'http';
}

export function isAgeGatedSite(url) {
  const rule = matchPlatformRule(url);
  return Boolean(rule?.ageGate);
}

export function analyzeUrl(url) {
  const platform = detectPlatformFromUrl(url);
  const downloadType = resolveDownloadType(url);
  const rule = matchPlatformRule(url);
  return {
    platform,
    downloadType,
    engine: downloadType === 'media' ? 'yt-dlp' : 'http-segmented',
    directFile: isDirectFileUrl(url),
    ageGate: isAgeGatedSite(url),
    cookiesRecommended: Boolean(rule?.cookies),
  };
}

/** Standard video resolution caps (yt-dlp height<= selector). */
export const VIDEO_RESOLUTION_PRESETS = [
  { formatId: '4320', label: '8K', height: 4320 },
  { formatId: '2160', label: '4K', height: 2160 },
  { formatId: '1440', label: '1440p', height: 1440 },
  { formatId: '1080', label: '1080p', height: 1080 },
  { formatId: '720', label: '720p', height: 720 },
  { formatId: '480', label: '480p', height: 480 },
  { formatId: '360', label: '360p', height: 360 },
  { formatId: '240', label: '240p', height: 240 },
  { formatId: '144', label: '144p', height: 144 },
];

const PRESET_HEIGHTS = new Set(VIDEO_RESOLUTION_PRESETS.map((p) => p.height));

/**
 * @typedef {'exact' | 'cap' | 'fallback' | 'unknown'} FormatAvailability
 */

/**
 * How this resolution relates to the probed source.
 * - exact: stream exists at this height
 * - cap: source max is higher; this cap is reachable
 * - fallback: source max is lower; download will use best available
 * - unknown: probe not run or no video heights
 */
export function getResolutionAvailability(height, probeInfo) {
  const heights = probeInfo?.availableHeights;
  if (!heights?.length) return 'unknown';
  const max = probeInfo.maxVideoHeight ?? Math.max(...heights);
  if (heights.includes(height)) return 'exact';
  if (max >= height) return 'cap';
  return 'fallback';
}

export function formatMaxSourceLabel(maxVideoHeight) {
  if (!maxVideoHeight) return null;
  const preset = VIDEO_RESOLUTION_PRESETS.find((p) => p.height === maxVideoHeight);
  if (preset) return preset.label;
  return `${maxVideoHeight}p`;
}

/**
 * Full video option list: best + standard ladder + any extra probe heights.
 */
export function buildVideoFormatOptions(probeInfo) {
  const standard = VIDEO_RESOLUTION_PRESETS.map((preset) => ({
    ...preset,
    availability: getResolutionAvailability(preset.height, probeInfo),
  }));

  const heights = probeInfo?.availableHeights || [];
  const extras = heights
    .filter((h) => !PRESET_HEIGHTS.has(h))
    .sort((a, b) => b - a)
    .map((h) => ({
      formatId: String(h),
      label: `${h}p`,
      height: h,
      availability: 'exact',
      extra: true,
    }));

  return { standard, extras };
}

export function availabilityTitle(availability, maxVideoHeight) {
  if (availability === 'exact') return 'Available on this video';
  if (availability === 'cap') return 'Download up to this quality';
  if (availability === 'fallback') {
    const max = formatMaxSourceLabel(maxVideoHeight) || `${maxVideoHeight}p`;
    return `Source max is ${max} — will download best available`;
  }
  return 'Select to download up to this quality';
}

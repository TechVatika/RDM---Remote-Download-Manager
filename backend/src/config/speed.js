/** Central speed / throughput tuning (env-driven). */

// Gentler defaults — fewer parallel chunks = less router/WAN saturation ("natural speed").
// Raise via UI Turbo slider or DOWNLOAD_CONNECTIONS in .env when you want max throughput.
export const DEFAULT_CONNECTIONS = Number(process.env.DOWNLOAD_CONNECTIONS) || 4;
export const MAX_CONNECTIONS = Number(process.env.DOWNLOAD_MAX_CONNECTIONS) || 16;
export const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS) || 4;
export const WORKER_POLL_MS = Number(process.env.WORKER_POLL_MS) || 500;
export const MIN_SEGMENT_BYTES = Number(process.env.DOWNLOAD_MIN_SEGMENT_BYTES) || 512 * 1024;

export const YTDLP_CONCURRENT_FRAGMENTS =
  Number(process.env.YTDLP_CONCURRENT_FRAGMENTS) || 2;
export const YTDLP_PARALLEL = Number(process.env.YTDLP_PARALLEL) || 2;

export function clampConnections(n) {
  const value = Number(n);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_CONNECTIONS;
  return Math.min(value, MAX_CONNECTIONS);
}

export function getSpeedConfig() {
  return {
    defaultConnections: DEFAULT_CONNECTIONS,
    maxConnections: MAX_CONNECTIONS,
    maxConcurrentDownloads: MAX_CONCURRENT_DOWNLOADS,
    workerPollMs: WORKER_POLL_MS,
    minSegmentBytes: MIN_SEGMENT_BYTES,
    ytdlp: {
      concurrentFragments: YTDLP_CONCURRENT_FRAGMENTS,
      parallel: YTDLP_PARALLEL,
    },
  };
}

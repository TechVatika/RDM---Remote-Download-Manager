export function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bps) {
  if (!bps || bps <= 0) return '—';
  return `${formatBytes(bps)}/s`;
}

export function formatEta(bytesLeft, bps) {
  if (!bps || bps <= 0 || !bytesLeft || bytesLeft <= 0) return '—';
  const seconds = Math.ceil(bytesLeft / bps);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function statusClass(status) {
  return `status status-${status}`;
}

export function parseUrlLines(text) {
  return text
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Human-readable label for a download card — never the full URL. */
export function downloadDisplayName(item) {
  if (item?.filename) return item.filename;
  if (item?.title) return item.title;
  if (item?.file_path) {
    const name = item.file_path.split('/').pop();
    if (name) return name;
  }
  if (item?.url) {
    try {
      const seg = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '');
      const clean = seg.split('?')[0];
      if (clean && clean !== '.' && clean !== '..') return clean;
    } catch {
      /* ignore */
    }
  }
  return item?.id ? `Download #${item.id}` : 'Download';
}

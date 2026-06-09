const KEY = 'rdm-bookmarks';
const MAX = 50;

export function loadBookmarks() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBookmarks(list) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function addBookmark({ url, label, category = 'general' }) {
  const trimmed = url?.trim();
  if (!trimmed) return loadBookmarks();
  const list = loadBookmarks().filter((b) => b.url !== trimmed);
  list.unshift({
    id: Date.now(),
    url: trimmed,
    label: label?.trim() || trimmed,
    category,
    addedAt: new Date().toISOString(),
  });
  saveBookmarks(list);
  return list;
}

export function removeBookmark(id) {
  const list = loadBookmarks().filter((b) => b.id !== id);
  saveBookmarks(list);
  return list;
}

export function loadRecentUrls(downloads, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const d of downloads) {
    if (Number(d.private) === 1) continue;
    const u = d.url?.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({
      url: u,
      title: d.filename || d.title || u,
      category: d.category || 'general',
    });
    if (out.length >= limit) break;
  }
  return out;
}

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

export function sanitizeFilename(name) {
  const cleaned = name.replace(INVALID_CHARS, '_').replace(/\.+$/, '').trim();
  return cleaned || 'download';
}

export function filenameFromUrl(urlString) {
  try {
    const url = new URL(urlString.trim());
    const segment = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (segment && segment !== '.' && segment !== '..') {
      return sanitizeFilename(segment);
    }
  } catch {
    // fall through
  }
  return 'download';
}

export function filenameFromDisposition(header) {
  if (!header) return null;

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return sanitizeFilename(decodeURIComponent(utf8Match[1]));
    } catch {
      return sanitizeFilename(utf8Match[1]);
    }
  }

  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch) return sanitizeFilename(quotedMatch[1]);

  const plainMatch = header.match(/filename=([^;]+)/i);
  if (plainMatch) return sanitizeFilename(plainMatch[1].trim());

  return null;
}

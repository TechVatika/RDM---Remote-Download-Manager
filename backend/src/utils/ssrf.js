import dns from 'dns/promises';
import net from 'net';

// When true, also block RFC1918 LAN ranges (10/8, 172.16/12, 192.168/16).
// Off by default so legitimate home-LAN downloads keep working; the always-on
// blocks below cover the dangerous SSRF targets (loopback, cloud metadata…).
const STRICT = process.env.SSRF_STRICT === 'true';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal']);

function classifyIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return 'invalid';
  const [a, b] = p;
  if (a === 127) return 'loopback';
  if (a === 0) return 'unspecified';
  if (a === 169 && b === 254) return 'linklocal'; // includes 169.254.169.254 metadata
  if (a >= 224) return 'reserved'; // multicast + reserved
  if (a === 10) return 'private';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 192 && b === 168) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'private'; // CGNAT
  return 'public';
}

function classifyIPv6(ip) {
  const low = ip.toLowerCase();
  if (low === '::1') return 'loopback';
  if (low === '::') return 'unspecified';
  if (low.startsWith('fe80')) return 'linklocal';
  if (low.startsWith('fc') || low.startsWith('fd')) return 'private'; // unique local
  if (low.startsWith('::ffff:')) {
    const v4 = low.split(':').pop();
    if (net.isIPv4(v4)) return classifyIPv4(v4);
  }
  return 'public';
}

function classify(ip) {
  if (net.isIPv4(ip)) return classifyIPv4(ip);
  if (net.isIPv6(ip)) return classifyIPv6(ip);
  return 'invalid';
}

function isBlocked(cls) {
  if (['loopback', 'linklocal', 'unspecified', 'reserved', 'invalid'].includes(cls)) return true;
  if (cls === 'private') return STRICT;
  return false;
}

/**
 * Throw if a URL points at an internal/dangerous address. Resolves hostnames so
 * a public-looking domain that maps to 127.0.0.1 / 169.254.x is also rejected.
 */
export async function assertDownloadUrlAllowed(urlString) {
  let url;
  try {
    url = new URL(String(urlString).trim());
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be downloaded');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error('Refusing to fetch from an internal/metadata address');
  }

  if (net.isIP(host)) {
    if (isBlocked(classify(host))) {
      throw new Error('Refusing to fetch from a private/internal address');
    }
    return;
  }

  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new Error('Could not resolve host');
  }
  if (!addrs?.length) throw new Error('Could not resolve host');

  for (const { address } of addrs) {
    if (isBlocked(classify(address))) {
      throw new Error('Refusing to fetch from a private/internal address');
    }
  }
}

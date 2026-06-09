// Dependency-free security middleware: hardened response headers + a small
// in-memory rate limiter. No external packages = no added supply-chain surface.

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  );
  // The API only ever returns JSON, so a maximally strict CSP is safe here and
  // neutralises any content that might otherwise be interpreted as markup.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  next();
}

/**
 * Fixed-window in-memory rate limiter.
 * @param {{windowMs:number,max:number,message?:string,keyGenerator?:Function}} opts
 */
export function createRateLimiter({
  windowMs,
  max,
  message = 'Too many requests — please slow down.',
  keyGenerator,
} = {}) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();

  return function rateLimiter(req, res, next) {
    const key = (keyGenerator ? keyGenerator(req) : req.ip) || 'unknown';
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const resetSec = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('RateLimit-Reset', String(resetSec));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(resetSec));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

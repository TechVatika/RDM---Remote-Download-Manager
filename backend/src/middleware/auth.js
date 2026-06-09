import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// A predictable secret means anyone can forge a valid session token. Refuse to
// run silently with the fallback — make it impossible to miss.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error(
    '[security] WARNING: JWT_SECRET is missing or too short. ' +
      'Set a long, random JWT_SECRET in backend/.env — sessions are forgeable until you do.',
  );
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, display_name FROM users WHERE username = ? LIMIT 1',
      [username.trim()],
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id],
    );

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, display_name, last_login_at, created_at FROM users WHERE id = ?',
      [req.user.sub],
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    const u = rows[0];
    res.json({
      id: u.id,
      username: u.username,
      displayName: u.display_name || u.username,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Current password is required' });
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'New password is required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'New password must be different from the current password' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, display_name FROM users WHERE id = ? LIMIT 1',
      [req.user.sub],
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });

    const user = rows[0];
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [
      passwordHash,
      user.id,
    ]);

    const token = signToken(user);
    res.json({
      ok: true,
      message: 'Password updated successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

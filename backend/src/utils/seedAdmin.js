import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

export async function seedAdminUser() {
  const username = process.env.AUTH_USERNAME || 'admin';
  const password = process.env.AUTH_PASSWORD || 'admin123';

  const [rows] = await pool.query(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username],
  );

  if (rows.length > 0) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (username, password_hash, display_name)
     VALUES (?, ?, ?)`,
    [username, passwordHash, 'Administrator'],
  );

  console.log(`[auth] Created default user "${username}"`);
}

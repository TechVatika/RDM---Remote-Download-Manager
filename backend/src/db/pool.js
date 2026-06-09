import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'db#h33t@6147',
  database: process.env.DB_NAME || 'rdm',
  waitForConnections: true,
  connectionLimit: 10,
});

export async function pingDatabase() {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
}

/** Idempotent schema upgrades (MariaDB supports ADD COLUMN IF NOT EXISTS). */
export async function ensureSchema() {
  try {
    await pool.query(
      `ALTER TABLE downloads
       ADD COLUMN IF NOT EXISTS private TINYINT(1) NOT NULL DEFAULT 0`,
    );
  } catch (err) {
    console.warn('[db] ensureSchema (private column):', err.message);
  }

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS app_logs (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         level VARCHAR(8) NOT NULL,
         proc VARCHAR(16) NOT NULL,
         scope VARCHAR(64) NOT NULL,
         message TEXT NOT NULL,
         meta JSON NULL,
         PRIMARY KEY (id),
         KEY idx_logs_created (created_at),
         KEY idx_logs_level (level),
         KEY idx_logs_scope (scope)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  } catch (err) {
    console.warn('[db] ensureSchema (app_logs table):', err.message);
  }
}

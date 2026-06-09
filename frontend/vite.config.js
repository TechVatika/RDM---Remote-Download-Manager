import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read a key from ../backend/.env so the domain is configured in ONE place.
 * Makes the app portable: change APP_DOMAIN in backend/.env (or env) per server.
 */
function readBackendEnv(key, fallback = '') {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(__dirname, '../backend/.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const line = raw.split('\n').find((l) => l.trim().startsWith(`${key}=`));
    if (line) {
      return line
        .slice(line.indexOf('=') + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

const APP_DOMAIN = readBackendEnv('APP_DOMAIN', '').replace(/^https?:\/\//, '');
const FRONTEND_PORT = Number(readBackendEnv('FRONTEND_PORT', '3599')) || 3599;

// Hosts the dev/preview server will answer to. Always allow localhost; add the
// configured public domain (and its www variant) when set.
const allowedHosts = ['localhost', '127.0.0.1'];
if (APP_DOMAIN) allowedHosts.push(APP_DOMAIN, `www.${APP_DOMAIN}`);

export default defineConfig({
  plugins: [react()],
  server: {
    port: FRONTEND_PORT,
    strictPort: true,
    host: true,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:3598',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: FRONTEND_PORT,
    strictPort: true,
    host: true,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:3598',
        changeOrigin: true,
      },
    },
  },
});

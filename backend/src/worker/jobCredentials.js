import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/job-creds');

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function encrypt(text) {
  const secret = process.env.JWT_SECRET || 'rdm-default-key';
  const key = crypto.scryptSync(secret, 'rdm-job-creds', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  const secret = process.env.JWT_SECRET || 'rdm-default-key';
  const key = crypto.scryptSync(secret, 'rdm-job-creds', 32);
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/** Persist credentials for the worker process (never stored in DB). */
export function setJobCredentials(id, creds) {
  if (!creds?.username) return;
  ensureDir();
  const file = path.join(DIR, `${Number(id)}.json`);
  fs.writeFileSync(file, encrypt(JSON.stringify(creds)), { mode: 0o600 });
}

/** Read and remove credentials when a job starts. */
export function consumeJobCredentials(id) {
  const file = path.join(DIR, `${Number(id)}.json`);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
    return JSON.parse(decrypt(raw));
  } catch {
    return null;
  }
}

export function clearJobCredentials(id) {
  try {
    fs.unlinkSync(path.join(DIR, `${Number(id)}.json`));
  } catch {
    /* ignore */
  }
}

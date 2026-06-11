import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';

import { finalBase } from '../config/paths.js';

const router = Router();

function safeFilePath(name) {
  if (typeof name !== 'string' || !name || name.includes('\0')) return null;
  const base = path.basename(name);
  if (base !== name || base === '.' || base === '..') return null;
  const full = path.join(finalBase, base);
  const rel = path.relative(finalBase, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

router.get('/', async (_req, res, next) => {
  try {
    await fs.mkdir(finalBase, { recursive: true });

    const entries = await fs.readdir(finalBase, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(finalBase, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        }),
    );

    files.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.size;
    }

    res.json({
      path: finalBase,
      files,
      count: files.length,
      totalBytes,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:name', async (req, res, next) => {
  try {
    const full = safeFilePath(req.params.name);
    if (!full) return res.status(400).json({ error: 'Invalid file' });
    await fs.unlink(full);
    res.json({ ok: true, deleted: req.params.name });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    next(err);
  }
});

export default router;

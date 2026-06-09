import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';

import { destinationProfiles } from '../config/paths.js';

const router = Router();
const CATEGORIES = Object.keys(destinationProfiles);

// Resolve a requested file inside a category folder, refusing anything that
// tries to escape it (path traversal, separators, null bytes, symlinks-out).
function safeFilePath(category, name) {
  if (!CATEGORIES.includes(category)) return null;
  if (typeof name !== 'string' || !name || name.includes('\0')) return null;
  const base = path.basename(name);
  if (base !== name || base === '.' || base === '..') return null;
  const dir = destinationProfiles[category];
  const full = path.join(dir, base);
  const rel = path.relative(dir, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

router.get('/', async (req, res, next) => {
  const category = CATEGORIES.includes(req.query.category)
    ? req.query.category
    : 'general';

  try {
    const dir = destinationProfiles[category];
    await fs.mkdir(dir, { recursive: true });

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
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

    const folders = await Promise.all(
      CATEGORIES.map(async (id) => {
        const folderPath = destinationProfiles[id];
        await fs.mkdir(folderPath, { recursive: true });
        const folderEntries = await fs.readdir(folderPath, { withFileTypes: true });
        const count = folderEntries.filter((e) => e.isFile()).length;
        let totalBytes = 0;
        for (const entry of folderEntries) {
          if (!entry.isFile()) continue;
          const stat = await fs.stat(path.join(folderPath, entry.name));
          totalBytes += stat.size;
        }
        return { id, path: folderPath, count, totalBytes };
      }),
    );

    res.json({
      category,
      path: dir,
      categories: CATEGORIES,
      files,
      folders,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:category/:name', async (req, res, next) => {
  try {
    const full = safeFilePath(req.params.category, req.params.name);
    if (!full) return res.status(400).json({ error: 'Invalid file' });
    await fs.unlink(full);
    res.json({ ok: true, deleted: req.params.name });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    next(err);
  }
});

export default router;

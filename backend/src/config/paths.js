import fs from 'fs';
import path from 'path';

/** Staging area — downloads land here first, then move to final storage on completion. */
const tempBase = process.env.DOWNLOAD_TEMP_PATH || process.env.DOWNLOAD_BASE_PATH || '/mnt/4tb-1/RDM/downloads';

/** Permanent library location after a download finishes. */
const finalBase =
  process.env.DOWNLOAD_FINAL_PATH || '/mnt/4tb/ENTERTAINMENT/RDM DOWNLOADS';

export const destinationProfiles = {
  general: path.join(tempBase, 'general'),
  movies: path.join(tempBase, 'movies'),
  software: path.join(tempBase, 'software'),
};

const finalProfiles = {
  general: path.join(finalBase, 'general'),
  movies: path.join(finalBase, 'movies'),
  software: path.join(finalBase, 'software'),
};

export function resolveDestination(category) {
  return destinationProfiles[category] ?? destinationProfiles.general;
}

export function resolveFinalDestination(category) {
  return finalProfiles[category] ?? finalProfiles.general;
}

/** Move a completed file from staging into the final library folder. */
export function finalizeDownloadPath(stagingPath, category) {
  const finalDir = resolveFinalDestination(category);
  fs.mkdirSync(finalDir, { recursive: true });

  const base = path.basename(stagingPath);
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let dest = path.join(finalDir, base);
  let n = 1;

  while (fs.existsSync(dest)) {
    dest = path.join(finalDir, `${stem} (${n})${ext}`);
    n += 1;
  }

  fs.renameSync(stagingPath, dest);
  return dest;
}

export { tempBase, finalBase };

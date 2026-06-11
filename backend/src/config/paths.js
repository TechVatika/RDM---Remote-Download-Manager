import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

/** Staging area — active downloads land here, then move to final storage on completion. */
export const tempBase =
  process.env.DOWNLOAD_TEMP_PATH || process.env.DOWNLOAD_BASE_PATH || '/mnt/4tb-1/RDM/downloads';

/** Permanent library after a download finishes. */
export const finalBase =
  process.env.DOWNLOAD_FINAL_PATH || '/mnt/4tb/ENTERTAINMENT/RDM DOWNLOADS';

/** @deprecated Category folders removed — all downloads use flat staging/final paths. */
export const destinationProfiles = {
  general: tempBase,
  movies: tempBase,
  software: tempBase,
};

export function resolveDestination(_category) {
  return tempBase;
}

export function resolveFinalDestination(_category) {
  return finalBase;
}

/** Move a completed file from staging into the final library folder. */
export async function finalizeDownloadPath(stagingPath, _category) {
  const finalDir = finalBase;
  await fsp.mkdir(finalDir, { recursive: true });

  const base = path.basename(stagingPath);
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let dest = path.join(finalDir, base);
  let n = 1;

  while (fs.existsSync(dest)) {
    dest = path.join(finalDir, `${stem} (${n})${ext}`);
    n += 1;
  }

  try {
    await fsp.rename(stagingPath, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fsp.copyFile(stagingPath, dest);
      await fsp.unlink(stagingPath).catch(() => {});
    } else {
      throw err;
    }
  }
  return dest;
}

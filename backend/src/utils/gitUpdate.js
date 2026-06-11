import { execFile, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(__dirname, '../../..');
export const UPDATE_LOG =
  process.env.RDM_UPDATE_LOG || path.join(APP_DIR, 'backend/data/update.log');
export const UPDATE_SCRIPT = path.join(APP_DIR, 'scripts/auto-update.sh');
export const GITHUB_REPO =
  process.env.GITHUB_REPO || 'TechVatika/RDM---Remote-Download-Manager';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

async function git(...args) {
  const { stdout } = await execFileAsync('git', args, { cwd: APP_DIR, timeout: 60000 });
  return stdout.trim();
}

export async function appendUpdateLog(line) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${line}\n`;
  await fs.mkdir(path.dirname(UPDATE_LOG), { recursive: true });
  await fs.appendFile(UPDATE_LOG, entry, 'utf8');
}

function parseCommitLine(line) {
  const [hash, shortHash, message, date, author] = line.split('|');
  if (!hash) return null;
  return { hash, shortHash, message, date, author };
}

export async function getCommitLog(range, limit = 30) {
  try {
    const raw = await git(
      'log',
      range,
      `--max-count=${limit}`,
      '--pretty=format:%H|%h|%s|%ci|%an',
    );
    if (!raw) return [];
    return raw.split('\n').map(parseCommitLine).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchUpdateStatus({ fetchRemote = true } = {}) {
  const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
  const localFull = await git('rev-parse', 'HEAD');
  const local = localFull.slice(0, 7);
  const commitMsg = await git('log', '-1', '--pretty=%s');
  const commitDate = await git('log', '-1', '--pretty=%ci');

  let remoteFull = null;
  let remote = null;
  let updateAvailable = false;
  let behindBy = 0;
  let remoteMsg = null;
  let remoteDate = null;
  let incomingCommits = [];
  let recentCommits = [];

  if (fetchRemote) {
    try {
      await git('fetch', 'origin', branch, '--quiet');
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Could not reach GitHub (git fetch failed)',
        branch,
        local,
        localFull,
        commit: { msg: commitMsg, date: commitDate },
        repo: GITHUB_REPO,
        repoUrl: GITHUB_REPO_URL,
      };
    }
  }

  try {
    remoteFull = await git('rev-parse', `origin/${branch}`);
    remote = remoteFull.slice(0, 7);
    updateAvailable = localFull !== remoteFull;
    if (updateAvailable) {
      remoteMsg = await git('log', '-1', '--pretty=%s', `origin/${branch}`);
      remoteDate = await git('log', '-1', '--pretty=%ci', `origin/${branch}`);
      const behind = await git('rev-list', '--count', `HEAD..origin/${branch}`);
      behindBy = parseInt(behind, 10) || 0;
      incomingCommits = await getCommitLog(`HEAD..origin/${branch}`, 50);
    }
    recentCommits = await getCommitLog('-30', 30);
  } catch {
    /* no remote tracking */
  }

  let lastLogAt = null;
  try {
    const stat = await fs.stat(UPDATE_LOG);
    lastLogAt = stat.mtime.toISOString();
  } catch {
    /* no log yet */
  }

  return {
    ok: true,
    branch,
    local,
    localFull,
    remote,
    remoteFull,
    updateAvailable,
    behindBy,
    commit: { msg: commitMsg, date: commitDate },
    remoteCommit: updateAvailable ? { msg: remoteMsg, date: remoteDate } : null,
    incomingCommits,
    recentCommits,
    lastLogAt,
    repo: GITHUB_REPO,
    repoUrl: GITHUB_REPO_URL,
    autoUpdate: {
      checkEnabled: process.env.AUTO_UPDATE_CHECK_ENABLED !== 'false',
      applyEnabled: process.env.AUTO_UPDATE_APPLY === 'true' || process.env.AUTO_UPDATE_APPLY === '1',
      checkIntervalMs: Number(process.env.AUTO_UPDATE_CHECK_MS) || 300000,
    },
  };
}

export function runUpdateScript({ onLine } = {}) {
  return new Promise((resolve, reject) => {
    const home = process.env.HOME || `/home/${process.env.USER || 'h33t'}`;
    const proc = spawn('bash', [UPDATE_SCRIPT], {
      env: {
        ...process.env,
        PATH: `${home}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
        PM2_HOME: `${home}/.pm2`,
        HOME: home,
        RDM_UPDATE_LOG: UPDATE_LOG,
      },
    });

    const emit = (chunk) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((msg) => onLine?.(msg));
    };

    proc.stdout.on('data', emit);
    proc.stderr.on('data', emit);
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, success: code === 0 }));
  });
}

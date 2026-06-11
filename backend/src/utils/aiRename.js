import fs from 'fs';
import path from 'path';
import { sanitizeFilename } from './filename.js';

const AI_ENABLED = process.env.AI_RENAME !== 'false';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'auto').toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const AI_FETCH_TIMEOUT_MS = Number(process.env.AI_RENAME_TIMEOUT_MS) || 5000;
const AI_POST_DOWNLOAD_TIMEOUT_MS = Number(process.env.AI_POST_DOWNLOAD_TIMEOUT_MS) || 6000;
const AI_CIRCUIT_MS = Number(process.env.AI_CIRCUIT_BREAKER_MS) || 5 * 60 * 1000;

const suggestionCache = new Map();
const SUGGESTION_CACHE_MAX = 128;
let aiCircuitOpenUntil = 0;

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_FETCH_TIMEOUT_MS) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

function isAiCircuitOpen() {
  return Date.now() < aiCircuitOpenUntil;
}

function tripAiCircuit() {
  aiCircuitOpenUntil = Date.now() + AI_CIRCUIT_MS;
}

function isQuotaError(message = '') {
  return /\b429\b|quota|rate.?limit|resource.?exhausted/i.test(message);
}

function cacheKey(ctx) {
  return `${ctx.url}|${ctx.title || ''}|${ctx.originalName || ''}|${ctx.category}`;
}

/** Fast local naming — no API, used as default and fallback. */
export function localSmartFilename(ctx) {
  const ext = path.extname(ctx.originalName || '') || '.bin';
  let base = '';

  if (ctx.title) {
    base = String(ctx.title)
      .replace(/\s*\[[^\]]{4,}\]\s*$/g, '')
      .replace(/\s*\([^)]{4,}\)\s*$/g, '')
      .trim();
  } else if (ctx.originalName) {
    base = path.basename(ctx.originalName, ext);
  }

  base = sanitizeFilename(base || 'download').slice(0, 180);
  if (!base) base = 'download';
  return `${base}${ext}`;
}

const OPENAI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENAI_API_BASE = (process.env.AI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

function resolveBackend() {
  if (!AI_ENABLED) return null;
  if (AI_PROVIDER === 'gemini' && GEMINI_API_KEY) return 'gemini';
  if (AI_PROVIDER === 'openai' && OPENAI_API_KEY) return 'openai';
  if (AI_PROVIDER === 'auto') {
    if (GEMINI_API_KEY) return 'gemini';
    if (OPENAI_API_KEY) return 'openai';
  }
  if (AI_PROVIDER === 'gemini' && !GEMINI_API_KEY) return null;
  if (OPENAI_API_KEY) return 'openai';
  if (GEMINI_API_KEY) return 'gemini';
  return null;
}

export function getAiRenameConfig() {
  const backend = resolveBackend();
  const configured = Boolean(GEMINI_API_KEY || OPENAI_API_KEY);
  return {
    enabled: Boolean(backend),
    configured,
    provider:
      backend === 'gemini'
        ? 'Google Gemini'
        : backend === 'openai'
          ? OPENAI_API_BASE.includes('openai.com')
            ? 'OpenAI'
            : 'OpenAI-compatible'
          : 'None',
    model: backend === 'gemini' ? GEMINI_MODEL : OPENAI_MODEL,
    backend: backend || 'none',
  };
}

export function isAiRenameEnabled() {
  return getAiRenameConfig().enabled;
}

function uniquePath(dir, filename, excludePath = null) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let counter = 1;
  while (fs.existsSync(candidate) && candidate !== excludePath) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

export function applyFilenameRename(filePath, suggestedName) {
  if (!filePath || !suggestedName || !fs.existsSync(filePath)) {
    return filePath;
  }

  const ext = path.extname(filePath);
  let base = sanitizeFilename(suggestedName);
  const suggestedExt = path.extname(base);
  if (suggestedExt && suggestedExt.toLowerCase() === ext.toLowerCase()) {
    base = path.basename(base, suggestedExt);
  } else if (suggestedExt) {
    base = path.basename(base, suggestedExt);
  }
  base = base.slice(0, 200).trim() || 'download';
  const filename = `${base}${ext}`;
  const dir = path.dirname(filePath);
  const nextPath = uniquePath(dir, filename, filePath);

  if (nextPath === filePath) return filePath;
  fs.renameSync(filePath, nextPath);
  return nextPath;
}

function buildPrompt(ctx) {
  const ext = path.extname(ctx.originalName || '') || '.bin';
  const parts = [`Ext: ${ext}`, `Category: ${ctx.category}`];
  if (ctx.title) parts.push(`Title: ${ctx.title}`);
  if (ctx.uploader) parts.push(`By: ${ctx.uploader}`);
  return `Filename only (with ${ext}), max 100 chars, Title Case, no quotes:\n${parts.join('\n')}`;
}

function parseAiFilename(content, fallbackExt) {
  if (!content) return null;
  let name = content
    .trim()
    .split('\n')[0]
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^filename:\s*/i, '')
    .trim();
  if (!name) return null;
  name = sanitizeFilename(name);
  if (!path.extname(name) && fallbackExt) {
    name += fallbackExt;
  }
  return name;
}

async function callGemini(userPrompt, timeoutMs = AI_FETCH_TIMEOUT_MS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: 'You name downloaded files descriptively for personal media libraries. Output only a safe ASCII filename with extension.',
        }],
      },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 48,
      },
    }),
  }, timeoutMs);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.slice(0, 300) || `Gemini HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function callOpenAi(userPrompt, timeoutMs = AI_FETCH_TIMEOUT_MS) {
  const res = await fetchWithTimeout(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 48,
      messages: [
        {
          role: 'system',
          content:
            'You name downloaded files descriptively for personal media libraries. Output only a safe ASCII filename with extension.',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  }, timeoutMs);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.slice(0, 300) || `OpenAI HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function suggestFilename(ctx, { useAi = true, timeoutMs = AI_FETCH_TIMEOUT_MS } = {}) {
  const fallback = localSmartFilename(ctx);
  const key = cacheKey(ctx);

  const cached = suggestionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.filename;
  }

  if (!useAi) {
    return fallback;
  }

  const backend = resolveBackend();
  if (!backend || isAiCircuitOpen()) {
    return fallback;
  }

  const prompt = buildPrompt(ctx);
  const ext = path.extname(ctx.originalName || '') || '.bin';

  try {
    const aiCall =
      backend === 'gemini'
        ? callGemini(prompt, timeoutMs)
        : callOpenAi(prompt, timeoutMs);
    const content = await aiCall;
    const parsed = parseAiFilename(content, ext);
    const filename = parsed || fallback;

    if (suggestionCache.size >= SUGGESTION_CACHE_MAX) {
      const first = suggestionCache.keys().next().value;
      suggestionCache.delete(first);
    }
    suggestionCache.set(key, { filename, expiresAt: Date.now() + 10 * 60 * 1000 });

    return filename;
  } catch (err) {
    if (isQuotaError(err.message)) {
      tripAiCircuit();
    }
    console.warn(`[ai-rename/${backend}] fallback:`, err.message?.slice(0, 120));
    return fallback;
  }
}

export async function maybeRenameDownload(row, result) {
  if (row.ai_rename === 0 || row.ai_rename === false) return result;
  if (row.filename) return result;
  if (!isAiRenameEnabled()) return result;

  const originalName = path.basename(result.filePath);

  try {
    const suggested = await suggestFilename(
      {
        url: row.url,
        title: row.title || null,
        category: row.category,
        mediaKind: row.media_kind || null,
        originalName,
        uploader: row.uploader || null,
        extractor: row.extractor || null,
      },
      { useAi: true, timeoutMs: AI_POST_DOWNLOAD_TIMEOUT_MS },
    );

    const newPath = applyFilenameRename(result.filePath, suggested);
    if (newPath !== result.filePath) {
      console.log(`[ai-rename] #${row.id}: ${originalName} -> ${path.basename(newPath)}`);
    }
    return { ...result, filePath: newPath };
  } catch (err) {
    console.warn(`[ai-rename] #${row.id} skipped, keeping original name:`, err.message);
    return result;
  }
}

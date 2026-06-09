import fs from 'fs';
import path from 'path';
import { sanitizeFilename } from './filename.js';

const AI_ENABLED = process.env.AI_RENAME !== 'false';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'auto').toLowerCase();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

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
  const lines = [
    'Generate one descriptive filename for a downloaded file.',
    'Reply with ONLY the filename (include extension). No quotes, markdown, or explanation.',
    'Use clear Title Case, hyphens or spaces, max 120 characters before extension.',
    'Keep the exact same file extension as the original.',
    '',
    `Original filename: ${ctx.originalName}`,
    `URL: ${ctx.url}`,
    `Category folder: ${ctx.category}`,
  ];
  if (ctx.title) lines.push(`Media title: ${ctx.title}`);
  if (ctx.uploader) lines.push(`Uploader: ${ctx.uploader}`);
  if (ctx.mediaKind) lines.push(`Type: ${ctx.mediaKind}`);
  if (ctx.extractor) lines.push(`Source: ${ctx.extractor}`);
  return lines.join('\n');
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

async function callGemini(userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
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
        temperature: 0.3,
        maxOutputTokens: 80,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.slice(0, 300) || `Gemini HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function callOpenAi(userPrompt) {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content:
            'You name downloaded files descriptively for personal media libraries. Output only a safe ASCII filename with extension.',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.slice(0, 300) || `OpenAI HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function suggestFilename(ctx) {
  const ext = path.extname(ctx.originalName || '') || '.bin';
  const fallback = ctx.title
    ? sanitizeFilename(`${ctx.title}${ext}`)
    : sanitizeFilename(ctx.originalName || `download${ext}`);

  const backend = resolveBackend();
  if (!backend) return fallback;

  const prompt = buildPrompt(ctx);

  try {
    const content =
      backend === 'gemini' ? await callGemini(prompt) : await callOpenAi(prompt);
    const parsed = parseAiFilename(content, ext);
    return parsed || fallback;
  } catch (err) {
    console.warn(`[ai-rename/${backend}] fallback:`, err.message);
    return fallback;
  }
}

export async function maybeRenameDownload(row, result) {
  if (row.ai_rename === 0 || row.ai_rename === false) return result;
  if (row.filename) return result;
  if (!isAiRenameEnabled()) return result;

  const originalName = path.basename(result.filePath);
  const suggested = await suggestFilename({
    url: row.url,
    title: row.title || null,
    category: row.category,
    mediaKind: row.media_kind || null,
    originalName,
    uploader: row.uploader || null,
    extractor: row.extractor || null,
  });

  const newPath = applyFilenameRename(result.filePath, suggested);
  if (newPath !== result.filePath) {
    console.log(`[ai-rename] #${row.id}: ${originalName} -> ${path.basename(newPath)}`);
  }
  return { ...result, filePath: newPath };
}

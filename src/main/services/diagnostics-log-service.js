/**
 * Lightweight diagnostics logging service.
 *
 * Uses newline-delimited JSON records in app userData and keeps a small rolling history.
 */
import { appendFile, mkdir, readFile, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

const LOG_FILE_NAME = 'diagnostics.log';
const MAX_LOG_BYTES = 1_000_000;
const MAX_LOG_LINES = 400;
let debugLoggingEnabled = false;

function getLogPath() {
  return join(app.getPath('userData'), LOG_FILE_NAME);
}

function normalizeError(error) {
  if (!error) return '';
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }
  return String(error);
}

function formatRecord(level, message, context = {}) {
  return JSON.stringify({
    ts: Date.now(),
    level,
    message: String(message || ''),
    context
  });
}

function compactContext(context) {
  if (!context || typeof context !== 'object') return {};
  const out = {};
  const passthrough = ['reason', 'file', 'line', 'column'];
  for (const key of passthrough) {
    if (key in context) out[key] = context[key];
  }
  if (!Object.keys(out).length && 'error' in context) {
    out.error = String(context.error || '').slice(0, 240);
  }
  return out;
}

async function ensureDir() {
  await mkdir(app.getPath('userData'), { recursive: true });
}

async function rotateIfNeeded() {
  try {
    const raw = await readFile(getLogPath(), 'utf-8');
    if (raw.length <= MAX_LOG_BYTES) return;

    const lines = raw
      .split('\n')
      .filter(Boolean)
      .slice(-MAX_LOG_LINES);

    await truncate(getLogPath(), 0);
    if (lines.length) {
      await appendFile(getLogPath(), `${lines.join('\n')}\n`, 'utf-8');
    }
  } catch {
    // Best-effort rotation; ignore read/trim failures.
  }
}

export async function logInfo(message, context) {
  if (!debugLoggingEnabled && context && Object.keys(context).length) return;
  await ensureDir();
  await appendFile(getLogPath(), `${formatRecord('info', message, context)}\n`, 'utf-8');
  await rotateIfNeeded();
}

export async function logDebug(message, context) {
  if (!debugLoggingEnabled) return;
  await ensureDir();
  await appendFile(getLogPath(), `${formatRecord('debug', message, context)}\n`, 'utf-8');
  await rotateIfNeeded();
}

export async function logError(message, error, context = {}) {
  const nextContext = debugLoggingEnabled ? context : compactContext(context);
  await ensureDir();
  await appendFile(
    getLogPath(),
    `${formatRecord('error', message, { ...nextContext, error: normalizeError(error) })}\n`,
    'utf-8'
  );
  await rotateIfNeeded();
}

export function setDebugLoggingEnabled(enabled) {
  debugLoggingEnabled = Boolean(enabled);
}

export async function readRecentLogs(limit = 200) {
  try {
    const raw = await readFile(getLogPath(), 'utf-8');
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .slice(-Math.max(1, Number(limit || 200)));

    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function clearLogs() {
  await ensureDir();
  await truncate(getLogPath(), 0).catch(() => appendFile(getLogPath(), '', 'utf-8'));
}

/**
 * File/folder scanning and lightweight metadata extraction (main process).
 *
 * Notes:
 * - Uses an iterative directory traversal to avoid recursion depth crashes.
 * - Yields periodically to keep the main process responsive during large scans.
 * - Skips symlinks to avoid cycles.
 */
import { readdir, lstat, stat } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { isSupportedAudioFilePath } from '../utils/path-utils.js';
import { trackIdForPath } from '../utils/ids.js';
import { readAudioMetadata } from './audio-metadata-service.js';
import { hashFileSha1 } from './file-hash-service.js';

const SCAN_LIMITS = {
  maxFiles: 15000,
  maxDepth: 25,
  yieldEvery: 250,
  progressEvery: 50
};

function yieldToEventLoop() {
  return new Promise((resolvePromise) => setImmediate(resolvePromise));
}

function isAborted(signal) {
  return Boolean(signal?.aborted);
}

function emitProgress(progress, patch) {
  if (typeof progress !== 'function') return;
  progress({ ...patch, ts: Date.now() });
}

async function collectAudioFiles(inputPath, errors, options = {}) {
  const absolute = resolve(inputPath);
  const results = [];
  const signal = options.signal;

  const stack = [{ path: absolute, depth: 0 }];
  let visited = 0;

  while (stack.length) {
    if (isAborted(signal)) break;

    const next = stack.pop();
    if (!next) break;

    visited += 1;
    if (visited % SCAN_LIMITS.yieldEvery === 0) {
      await yieldToEventLoop();
    }

    if (results.length >= SCAN_LIMITS.maxFiles) {
      errors.push({ path: absolute, reason: `Scan limit reached (max ${SCAN_LIMITS.maxFiles} files).` });
      break;
    }

    let details;
    try {
      details = await lstat(next.path);
    } catch (error) {
      errors.push({ path: next.path, reason: error instanceof Error ? error.message : 'Failed to stat path.' });
      continue;
    }

    if (details.isSymbolicLink()) {
      continue;
    }

    if (details.isFile()) {
      if (isSupportedAudioFilePath(next.path)) {
        results.push(next.path);
        if (results.length % SCAN_LIMITS.progressEvery === 0) {
          emitProgress(options.progress, {
            phase: 'discover',
            discoveredCount: results.length,
            processedCount: 0,
            errorCount: errors.length,
            totalDiscovered: results.length,
            currentPath: next.path
          });
        }
      }
      continue;
    }

    if (!details.isDirectory()) {
      continue;
    }

    if (next.depth >= SCAN_LIMITS.maxDepth) {
      errors.push({ path: next.path, reason: `Max directory depth reached (${SCAN_LIMITS.maxDepth}).` });
      continue;
    }

    let entries;
    try {
      entries = await readdir(next.path, { withFileTypes: true });
    } catch (error) {
      errors.push({ path: next.path, reason: error instanceof Error ? error.message : 'Failed to read directory.' });
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink?.()) continue;
      const entryPath = join(next.path, entry.name);

      if (entry.isDirectory()) {
        stack.push({ path: entryPath, depth: next.depth + 1 });
        continue;
      }

      if (entry.isFile() && isSupportedAudioFilePath(entryPath)) {
        results.push(entryPath);
        if (results.length % SCAN_LIMITS.progressEvery === 0) {
          emitProgress(options.progress, {
            phase: 'discover',
            discoveredCount: results.length,
            processedCount: 0,
            errorCount: errors.length,
            totalDiscovered: results.length,
            currentPath: entryPath
          });
        }
        if (results.length >= SCAN_LIMITS.maxFiles) break;
      }
    }
  }

  return results;
}

function inferTrackInfo(filePath) {
  const fileName = basename(filePath);
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const parts = withoutExt.split(' - ');

  if (parts.length >= 2) {
    return {
      title: parts.slice(1).join(' - ').trim() || withoutExt,
      artist: parts[0].trim() || 'Unknown Artist',
      album: 'Unknown Album',
      genre: 'Unknown Genre'
    };
  }

  return {
    title: withoutExt,
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    genre: 'Unknown Genre'
  };
}

async function buildTrackRecord(filePath, options = {}) {
  const info = inferTrackInfo(filePath);
  const metadata = await readAudioMetadata(filePath);
  const details = await stat(filePath);

  const artist = metadata?.artist?.trim() || info.artist;
  const author = metadata?.author?.trim() || artist;
  const contentHash = options.includeHash ? await hashFileSha1(filePath).catch(() => '') : '';

  return {
    id: trackIdForPath(filePath),
    path: filePath,
    fileName: basename(filePath),
    title: metadata?.title?.trim() || info.title,
    artist,
    author,
    album: metadata?.album?.trim() || info.album,
    genre: metadata?.genre?.trim() || info.genre,
    trackNumber: Number(metadata?.trackNumber || 0),
    artworkDataUrl: metadata?.artworkDataUrl || '',
    replayGainTrackDb: Number.isFinite(Number(metadata?.replayGainTrackDb)) ? Number(metadata.replayGainTrackDb) : null,
    replayGainAlbumDb: Number.isFinite(Number(metadata?.replayGainAlbumDb)) ? Number(metadata.replayGainAlbumDb) : null,
    contentHash,
    durationSec: 0,
    sizeBytes: details.size,
    modifiedMs: details.mtimeMs,
    missing: false
  };
}

export async function scanPaths(paths, options = {}) {
  const dedupedInput = [...new Set((paths || []).map((path) => resolve(path)))];
  const errors = [];
  const discoveredFiles = [];
  const signal = options.signal;

  emitProgress(options.progress, {
    phase: 'start',
    discoveredCount: 0,
    processedCount: 0,
    errorCount: 0,
    totalDiscovered: 0
  });

  for (const input of dedupedInput) {
    if (isAborted(signal)) break;

    try {
      discoveredFiles.push(...(await collectAudioFiles(input, errors, options)));
    } catch (error) {
      errors.push({ path: input, reason: error instanceof Error ? error.message : 'Failed to read path.' });
    }

    emitProgress(options.progress, {
      phase: 'discover',
      discoveredCount: discoveredFiles.length,
      processedCount: 0,
      errorCount: errors.length,
      totalDiscovered: discoveredFiles.length,
      currentPath: input
    });
  }

  const uniqueFiles = [...new Set(discoveredFiles)].sort((a, b) => a.localeCompare(b));
  const tracks = [];

  emitProgress(options.progress, {
    phase: 'process',
    discoveredCount: uniqueFiles.length,
    processedCount: 0,
    errorCount: errors.length,
    totalDiscovered: uniqueFiles.length
  });

  for (const filePath of uniqueFiles) {
    if (isAborted(signal)) break;

    try {
      tracks.push(await buildTrackRecord(filePath, options));
    } catch (error) {
      errors.push({
        path: filePath,
        reason: error instanceof Error ? error.message : 'Failed to read file.'
      });
    }

    if (tracks.length % SCAN_LIMITS.progressEvery === 0 || tracks.length === uniqueFiles.length) {
      emitProgress(options.progress, {
        phase: 'process',
        discoveredCount: uniqueFiles.length,
        processedCount: tracks.length,
        errorCount: errors.length,
        totalDiscovered: uniqueFiles.length,
        currentPath: filePath
      });
    }
  }

  const canceled = isAborted(signal);
  emitProgress(options.progress, {
    phase: canceled ? 'canceled' : 'done',
    discoveredCount: uniqueFiles.length,
    processedCount: tracks.length,
    errorCount: errors.length,
    totalDiscovered: uniqueFiles.length,
    canceled
  });

  return { tracks, errors, canceled };
}

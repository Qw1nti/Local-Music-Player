/**
 * Incremental folder watch service for audio library paths.
 *
 * Sends debounced change events to renderer; renderer decides how/when to merge scanned tracks.
 */
import { watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { IPC_EVENTS } from '../../shared/constants/ipc.js';
import { isSupportedAudioFilePath } from '../utils/path-utils.js';

const DEBOUNCE_MS = 650;

const watchers = new Map();
const pendingByFolder = new Map();

function normalizeFolderPath(folderPath) {
  return resolve(folderPath);
}

function flush(window, folderPath) {
  const pending = pendingByFolder.get(folderPath);
  pendingByFolder.delete(folderPath);
  if (!pending || !pending.size) return;

  window.webContents.send(IPC_EVENTS.libraryWatchUpdate, {
    folderPath,
    changedPaths: [...pending]
  });
}

function queuePath(window, folderPath, changedPath) {
  const current = pendingByFolder.get(folderPath) || new Set();
  current.add(changedPath);
  pendingByFolder.set(folderPath, current);

  const info = watchers.get(folderPath);
  if (!info) return;
  if (info.timer) clearTimeout(info.timer);
  info.timer = setTimeout(() => flush(window, folderPath), DEBOUNCE_MS);
}

export function watchLibraryFolder(window, folderPath) {
  const normalized = normalizeFolderPath(folderPath);
  if (watchers.has(normalized)) {
    return { path: normalized, alreadyWatching: true };
  }

  const watcher = watch(normalized, { persistent: true }, (_eventType, fileName) => {
    if (!fileName) return;
    const fullPath = join(normalized, String(fileName));
    if (!isSupportedAudioFilePath(fullPath)) return;
    queuePath(window, normalized, fullPath);
  });

  watcher.on('error', () => {
    // Ignore transient watch errors; user can re-add watch folder.
  });

  watchers.set(normalized, { watcher, timer: null });
  return { path: normalized, alreadyWatching: false };
}

export function unwatchLibraryFolder(folderPath) {
  const normalized = normalizeFolderPath(folderPath);
  const info = watchers.get(normalized);
  if (!info) return { path: normalized, removed: false };

  if (info.timer) clearTimeout(info.timer);
  info.watcher.close();
  watchers.delete(normalized);
  pendingByFolder.delete(normalized);
  return { path: normalized, removed: true };
}

export function clearLibraryWatches() {
  for (const [path, info] of watchers.entries()) {
    if (info.timer) clearTimeout(info.timer);
    info.watcher.close();
    pendingByFolder.delete(path);
  }
  watchers.clear();
}

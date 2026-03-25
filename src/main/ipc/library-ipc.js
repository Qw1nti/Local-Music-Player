/**
 * IPC bridge for library operations.
 *
 * This is the main-process side of the contract used by preload (`window.musicApi`).
 * Keep channels explicit and payloads validated to avoid accidental privilege expansion.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from '../../shared/constants/ipc.js';
import { pickAudioFiles, pickAudioFolder } from '../services/file-picker-service.js';
import { clearLibraryState, loadLibraryState, saveLibraryState } from '../services/library-state-service.js';
import { scanPaths } from '../services/track-scan-service.js';
import { clearLibraryWatches, unwatchLibraryFolder, watchLibraryFolder } from '../services/library-watch-service.js';
import { exportPlayerData, importPlayerData } from '../services/data-transfer-service.js';
import { clearLogs, logError, readRecentLogs } from '../services/diagnostics-log-service.js';

function assertStringArray(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Expected string path array.');
  }
  return value;
}

function parseScanPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      paths: assertStringArray(payload),
      options: { includeHash: false }
    };
  }

  if (payload && typeof payload === 'object') {
    return {
      paths: assertStringArray(payload.paths),
      options: {
        includeHash: Boolean(payload.options?.includeHash),
        scanId: typeof payload.options?.scanId === 'string' ? payload.options.scanId : ''
      }
    };
  }

  throw new Error('Invalid scan payload.');
}

const scanControllers = new Map();

export function registerLibraryIpc(window) {
  ipcMain.handle(IPC_CHANNELS.pickFiles, () => pickAudioFiles(window));
  ipcMain.handle(IPC_CHANNELS.pickFolder, () => pickAudioFolder(window));
  ipcMain.handle(IPC_CHANNELS.scanPaths, (_event, payload) => {
    const parsed = parseScanPayload(payload);
    const scanId = String(parsed.options.scanId || `scan-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    const controller = new AbortController();
    scanControllers.set(scanId, controller);

    const progress = (progressPayload) => {
      window.webContents.send(IPC_EVENTS.libraryScanProgress, {
        scanId,
        ...progressPayload
      });
    };

    return scanPaths(parsed.paths, {
      ...parsed.options,
      signal: controller.signal,
      progress
    }).finally(() => {
      scanControllers.delete(scanId);
    });
  });
  ipcMain.handle(IPC_CHANNELS.cancelScan, (_event, payload) => {
    const scanId = String(payload?.scanId || '');
    const controller = scanControllers.get(scanId);
    if (!controller) return { canceled: false, scanId };
    controller.abort();
    return { canceled: true, scanId };
  });
  ipcMain.handle(IPC_CHANNELS.loadState, () => loadLibraryState());
  ipcMain.handle(IPC_CHANNELS.saveState, (_event, state) => saveLibraryState(state));
  ipcMain.handle(IPC_CHANNELS.clearState, () => clearLibraryState());
  ipcMain.handle(IPC_CHANNELS.watchFolder, (_event, folderPath) => watchLibraryFolder(window, String(folderPath || '')));
  ipcMain.handle(IPC_CHANNELS.unwatchFolder, (_event, folderPath) => unwatchLibraryFolder(String(folderPath || '')));
  ipcMain.handle(IPC_CHANNELS.exportData, (_event, payload) => exportPlayerData(window, payload));
  ipcMain.handle(IPC_CHANNELS.importData, () => importPlayerData(window));
  ipcMain.handle(IPC_CHANNELS.diagnosticsLogs, (_event, limit) => readRecentLogs(Number(limit || 200)));
  ipcMain.handle(IPC_CHANNELS.diagnosticsClear, () => clearLogs());
  ipcMain.handle(IPC_CHANNELS.diagnosticsRecordRendererError, (_event, payload) => {
    const message = typeof payload?.message === 'string' ? payload.message : 'Renderer error';
    const context = payload && typeof payload === 'object' ? payload : {};
    return logError(message, null, context);
  });

  window.on('closed', () => {
    for (const controller of scanControllers.values()) {
      controller.abort();
    }
    scanControllers.clear();
    clearLibraryWatches();
  });
}

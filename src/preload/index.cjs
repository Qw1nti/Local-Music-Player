/**
 * Preload entry point (CommonJS).
 *
 * Preload scripts are most reliably executed as CommonJS across Electron versions and
 * packaging modes. This file exposes a minimal `window.musicApi` surface to the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Keep IPC names in-sync with src/shared/constants/*.js.
const IPC_CHANNELS = {
  pickFiles: 'library:pick-files',
  pickFolder: 'library:pick-folder',
  scanPaths: 'library:scan',
  cancelScan: 'library:scan-cancel',
  loadState: 'library:load',
  saveState: 'library:save',
  clearState: 'library:clear',
  watchFolder: 'library:watch-folder',
  unwatchFolder: 'library:unwatch-folder',
  exportData: 'data:export',
  importData: 'data:import',
  diagnosticsLogs: 'diagnostics:get-logs',
  diagnosticsClear: 'diagnostics:clear-logs',
  diagnosticsRecordRendererError: 'diagnostics:renderer-error'
};
const IPC_EVENTS = {
  libraryWatchUpdate: 'library:watch-update',
  libraryScanProgress: 'library:scan-progress'
};

const SETTINGS_IPC = {
  channels: {
    get: 'settings:get',
    update: 'settings:update',
    reset: 'settings:reset'
  },
  events: {
    changed: 'settings:changed'
  }
};

const APP_IPC = {
  channels: {
    openPreferences: 'app:open-preferences'
  }
};

contextBridge.exposeInMainWorld('musicApi', {
  pickAudioFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickFiles),
  pickAudioFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickFolder),
  scanPaths: (paths, options = {}) => ipcRenderer.invoke(IPC_CHANNELS.scanPaths, { paths, options }),
  cancelScan: (scanId) => ipcRenderer.invoke(IPC_CHANNELS.cancelScan, { scanId }),
  loadLibraryState: () => ipcRenderer.invoke(IPC_CHANNELS.loadState),
  saveLibraryState: (state) => ipcRenderer.invoke(IPC_CHANNELS.saveState, state),
  clearLibraryState: () => ipcRenderer.invoke(IPC_CHANNELS.clearState),
  watchLibraryFolder: (folderPath) => ipcRenderer.invoke(IPC_CHANNELS.watchFolder, folderPath),
  unwatchLibraryFolder: (folderPath) => ipcRenderer.invoke(IPC_CHANNELS.unwatchFolder, folderPath),
  onLibraryWatchUpdate: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on(IPC_EVENTS.libraryWatchUpdate, handler);
    return () => ipcRenderer.off(IPC_EVENTS.libraryWatchUpdate, handler);
  },
  onLibraryScanProgress: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on(IPC_EVENTS.libraryScanProgress, handler);
    return () => ipcRenderer.off(IPC_EVENTS.libraryScanProgress, handler);
  },

  exportData: (payload) => ipcRenderer.invoke(IPC_CHANNELS.exportData, payload),
  importData: () => ipcRenderer.invoke(IPC_CHANNELS.importData),
  getDiagnosticsLogs: (limit) => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsLogs, limit),
  clearDiagnosticsLogs: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsClear),
  logRendererError: (payload) => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsRecordRendererError, payload),

  openPreferences: () => ipcRenderer.invoke(APP_IPC.channels.openPreferences),

  getSettings: () => ipcRenderer.invoke(SETTINGS_IPC.channels.get),
  updateSetting: (path, value) => ipcRenderer.invoke(SETTINGS_IPC.channels.update, { path, value }),
  resetSettings: () => ipcRenderer.invoke(SETTINGS_IPC.channels.reset),
  onSettingsChanged: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, settings) => listener(settings);
    ipcRenderer.on(SETTINGS_IPC.events.changed, handler);
    return () => ipcRenderer.off(SETTINGS_IPC.events.changed, handler);
  }
});

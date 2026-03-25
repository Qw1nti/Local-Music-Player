// Central list of IPC channels used between preload <-> main.
export const IPC_CHANNELS = {
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

export const IPC_EVENTS = {
  libraryWatchUpdate: 'library:watch-update',
  libraryScanProgress: 'library:scan-progress'
};

/**
 * Electron main-process entry point.
 *
 * Responsibilities:
 * - Manage Electron lifecycle (ready/activate/window-all-closed)
 * - Create the main window
 * - Register IPC handlers that expose privileged actions to the renderer via preload
 */
import { app, BrowserWindow, dialog } from 'electron';
import { createMainWindow } from './windows/main-window.js';
import { registerLibraryIpc, resetLibraryIpcState } from './ipc/library-ipc.js';
import { registerSettingsIpc, initSettingsCache } from './ipc/settings-ipc.js';
import { registerAppIpc } from './ipc/app-ipc.js';
import { setAppMenu } from './app-menu.js';
import { logError, logInfo } from './services/diagnostics-log-service.js';

let mainWindow = null;
let ipcRegistered = false;

function attachMainWindow(window) {
  mainWindow = window;
  mainWindow.on('closed', () => {
    resetLibraryIpcState();
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

async function bootstrap() {
  try {
    await logInfo('Main bootstrap start');
    await initSettingsCache();
    if (!ipcRegistered) {
      registerSettingsIpc();
      registerAppIpc();
      registerLibraryIpc(() => mainWindow);
      ipcRegistered = true;
    }
    setAppMenu();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      return;
    }

    const window = createMainWindow();
    attachMainWindow(window);
    await logInfo('Main window created');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create main window.';
    await logError('Main bootstrap failed', error);
    dialog.showErrorBox('Startup Error', message);
    app.quit();
    return;
  }
}

app.whenReady().then(bootstrap);

process.on('uncaughtException', (error) => {
  void logError('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  void logError('unhandledRejection', reason instanceof Error ? reason : null, { reason: String(reason || '') });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootstrap();
  }
});

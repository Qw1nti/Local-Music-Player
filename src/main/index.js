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
import { registerLibraryIpc } from './ipc/library-ipc.js';
import { registerSettingsIpc, initSettingsCache } from './ipc/settings-ipc.js';
import { registerAppIpc } from './ipc/app-ipc.js';
import { setAppMenu } from './app-menu.js';
import { logError, logInfo } from './services/diagnostics-log-service.js';

async function bootstrap() {
  let window;

  try {
    await logInfo('Main bootstrap start');
    await initSettingsCache();
    registerSettingsIpc();
    registerAppIpc();
    setAppMenu();

    window = createMainWindow();
    await logInfo('Main window created');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create main window.';
    await logError('Main bootstrap failed', error);
    dialog.showErrorBox('Startup Error', message);
    app.quit();
    return;
  }

  registerLibraryIpc(window);
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
  if (BrowserWindow.getAllWindows().length === 0) bootstrap();
});

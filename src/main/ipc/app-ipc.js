/**
 * IPC handlers for app-level behaviors (window management).
 */

import { ipcMain } from 'electron';
import { APP_IPC } from '../../shared/constants/settings-ipc.js';
import { createPreferencesWindow } from '../windows/preferences-window.js';

let preferencesWindow = null;

function focusOrCreatePreferences() {
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
    preferencesWindow.show();
    preferencesWindow.focus();
    return preferencesWindow;
  }

  preferencesWindow = createPreferencesWindow();
  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
  return preferencesWindow;
}

export function registerAppIpc() {
  ipcMain.handle(APP_IPC.channels.openPreferences, () => {
    focusOrCreatePreferences();
  });
}

export function openPreferencesFromMenu() {
  focusOrCreatePreferences();
}

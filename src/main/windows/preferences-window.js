/**
 * Preferences window.
 *
 * Loads `preferences.html` (separate renderer entry) and reuses the same preload.
 */

import { BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createPreferencesWindow() {
  const preloadPath = join(__dirname, '..', '..', 'preload', 'index.cjs');
  const preferencesPath = join(__dirname, '..', '..', '..', 'preferences.html');

  if (!existsSync(preferencesPath)) {
    throw new Error(`Missing preferences entry: ${preferencesPath}`);
  }

  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 640,
    title: 'Preferences',
    autoHideMenuBar: true,
    backgroundColor: '#091021',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  void window.loadFile(preferencesPath);
  return window;
}

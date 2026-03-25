/**
 * Creates the main BrowserWindow with secure defaults.
 *
 * Renderer access to privileged APIs is intentionally blocked; the renderer communicates
 * through the preload's `window.musicApi` surface only.
 */
import { BrowserWindow } from 'electron';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createMainWindow() {
  const preloadPath = join(__dirname, '..', '..', 'preload', 'index.cjs');
  const indexPath = join(__dirname, '..', '..', '..', 'index.html');

  if (!existsSync(indexPath)) {
    throw new Error(`Missing renderer entry: ${indexPath}`);
  }

  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: '#091021',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  void window.loadFile(indexPath);
  return window;
}

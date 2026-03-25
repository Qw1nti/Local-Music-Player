/**
 * Settings persistence + validation (main process).
 *
 * - Stores settings in `userData/settings.json`
 * - Normalizes all loaded settings against defaults
 * - Backs up corrupted settings files to `settings.json.bad-<timestamp>`
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { createDefaultSettings } from '../../shared/settings/default-settings.js';
import { normalizeSettings } from '../../shared/settings/settings-schema.js';

const SETTINGS_FILE_NAME = 'settings.json';

function getSettingsPath() {
  return join(app.getPath('userData'), SETTINGS_FILE_NAME);
}

export async function loadSettings() {
  const defaults = createDefaultSettings();
  const settingsPath = getSettingsPath();

  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return defaults;
    }

    // If the file exists but is corrupted, preserve it for debugging.
    if (error instanceof SyntaxError) {
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        await rename(settingsPath, `${settingsPath}.bad-${ts}`);
      } catch {
        // ignore backup errors
      }
    }
    return defaults;
  }
}

export async function saveSettings(settings) {
  const userDataDir = app.getPath('userData');
  await mkdir(userDataDir, { recursive: true });
  const path = getSettingsPath();
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
  await rename(tmpPath, path);
}

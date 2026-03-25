/**
 * IPC bridge for application settings.
 *
 * The main process is the source of truth for persisted settings.
 * Renderers load settings at startup and apply changes through this IPC layer.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import { createDefaultSettings } from '../../shared/settings/default-settings.js';
import { normalizeSettings, validateSettingsUpdate } from '../../shared/settings/settings-schema.js';
import { SETTINGS_IPC } from '../../shared/constants/settings-ipc.js';
import { loadSettings, saveSettings } from '../services/settings-state-service.js';
import { setDebugLoggingEnabled } from '../services/diagnostics-log-service.js';

let cachedSettings = createDefaultSettings();

function broadcastSettings(excludeWebContentsId = null) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (excludeWebContentsId && window.webContents.id === excludeWebContentsId) continue;
    window.webContents.send(SETTINGS_IPC.events.changed, cachedSettings);
  }
}

function setAtPath(target, path, value) {
  const parts = path.split('.').filter(Boolean);
  if (!parts.length) return;

  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function applyLoginItemSetting(settings) {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(settings.general?.launchOnStartup) });
  } catch {
    // Ignore unsupported platforms/errors; the setting is still persisted.
  }
}

function applyDiagnosticsSettings(settings) {
  setDebugLoggingEnabled(Boolean(settings?.advanced?.debugLogging));
}

export async function initSettingsCache() {
  cachedSettings = await loadSettings();
  applyLoginItemSetting(cachedSettings);
  applyDiagnosticsSettings(cachedSettings);
}

export function registerSettingsIpc() {
  ipcMain.handle(SETTINGS_IPC.channels.get, async () => cachedSettings);

  ipcMain.handle(SETTINGS_IPC.channels.reset, async () => {
    const next = createDefaultSettings();
    await saveSettings(next);
    cachedSettings = next;
    applyLoginItemSetting(cachedSettings);
    applyDiagnosticsSettings(cachedSettings);
    broadcastSettings();
    return cachedSettings;
  });

  ipcMain.handle(SETTINGS_IPC.channels.update, async (event, payload) => {
    const validated = validateSettingsUpdate(payload);
    if (!validated.valid) {
      throw new Error(validated.error);
    }

    const draft = structuredClone(cachedSettings);
    setAtPath(draft, validated.path, validated.value);
    const normalized = normalizeSettings(draft);

    await saveSettings(normalized);
    cachedSettings = normalized;
    applyLoginItemSetting(cachedSettings);
    applyDiagnosticsSettings(cachedSettings);
    // The initiating renderer receives updated settings via invoke() response,
    // so broadcast only to other windows to avoid duplicate same-frame re-renders.
    broadcastSettings(event.sender.id);
    return cachedSettings;
  });
}

/**
 * Settings schema and validation helpers.
 *
 * This is a pragmatic, lightweight schema (no dependencies) intended for:
 * - validating persisted settings on load
 * - validating updates coming from the renderer via IPC
 *
 * If this grows significantly, consider replacing with a dedicated schema library,
 * but keep the preload surface unchanged.
 */

import { createDefaultSettings } from './default-settings.js';
import { isBuiltinThemeId, THEME_TOKEN_KEYS } from './theme-registry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const DEFAULTS = createDefaultSettings();
const SETTINGS_UPDATE_VALIDATORS = new Map([
  ['general.launchOnStartup', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  ['general.resumeLastSession', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  [
    'general.startupPage',
    (value) => ({ valid: value === 'library' || value === 'playlists', value: value === 'playlists' ? 'playlists' : 'library' })
  ],
  ['general.rememberLastTrack', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  [
    'playback.defaultVolume',
    (value) => ({ valid: Number.isFinite(Number(value)), value: clampNumber(Number(value), 0, 1, DEFAULTS.playback.defaultVolume) })
  ],
  [
    'playback.crossfadeMs',
    (value) => ({ valid: Number.isFinite(Number(value)), value: clampNumber(Number(value), 0, 12000, DEFAULTS.playback.crossfadeMs) })
  ],
  ['playback.gaplessPlayback', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  [
    'playback.replayGain',
    (value) => ({ valid: value === 'off' || value === 'track' || value === 'album', value: value === 'track' || value === 'album' ? value : 'off' })
  ],
  [
    'playback.endOfQueueBehavior',
    (value) => ({ valid: value === 'stop' || value === 'repeat-all', value: value === 'repeat-all' ? 'repeat-all' : 'stop' })
  ],
  ['library.autoScanOnLaunch', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  ['library.showMissingTracks', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  [
    'appearance.uiScale',
    (value) => ({ valid: Number.isFinite(Number(value)), value: clampNumber(Number(value), 0.85, 1.25, DEFAULTS.appearance.uiScale) })
  ],
  [
    'appearance.density',
    (value) => ({ valid: value === 'comfortable' || value === 'compact', value: value === 'compact' ? 'compact' : 'comfortable' })
  ],
  ['appearance.showAlbumArt', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })],
  [
    'themes.activeThemeId',
    (value) => {
      const next = String(value || '');
      return { valid: next === 'custom' || isBuiltinThemeId(next), value: next === 'custom' || isBuiltinThemeId(next) ? next : 'dark' };
    }
  ],
  [
    'themes.customTheme.label',
    (value) => {
      const next = String(value || '').trim();
      return { valid: true, value: next ? next.slice(0, 40) : 'Custom' };
    }
  ],
  ['advanced.debugLogging', (value) => ({ valid: typeof value === 'boolean', value: Boolean(value) })]
]);

function normalizeThemeTokens(tokens, defaults) {
  if (!isPlainObject(tokens)) return defaults;

  const nextTokens = {};
  for (const key of THEME_TOKEN_KEYS) {
    const raw = tokens[key];
    if (typeof raw === 'string' && HEX_COLOR_RE.test(raw)) {
      nextTokens[key] = raw;
    }
  }
  return nextTokens;
}

export function normalizeSettings(maybeSettings) {
  const defaults = createDefaultSettings();
  if (!isPlainObject(maybeSettings)) return defaults;

  const next = structuredClone(defaults);
  const input = maybeSettings;

  next.version = 1;

  if (isPlainObject(input.general)) {
    next.general.launchOnStartup = Boolean(input.general.launchOnStartup);
    next.general.resumeLastSession = Boolean(input.general.resumeLastSession);
    next.general.rememberLastTrack = Boolean(input.general.rememberLastTrack);
    next.general.startupPage = input.general.startupPage === 'playlists' ? 'playlists' : 'library';
  }

  if (isPlainObject(input.playback)) {
    next.playback.defaultVolume = clampNumber(Number(input.playback.defaultVolume), 0, 1, defaults.playback.defaultVolume);
    next.playback.crossfadeMs = clampNumber(Number(input.playback.crossfadeMs), 0, 12000, defaults.playback.crossfadeMs);
    next.playback.gaplessPlayback = Boolean(input.playback.gaplessPlayback);
    next.playback.replayGain =
      input.playback.replayGain === 'track' || input.playback.replayGain === 'album' ? input.playback.replayGain : 'off';
    next.playback.endOfQueueBehavior =
      input.playback.endOfQueueBehavior === 'repeat-all' ? 'repeat-all' : defaults.playback.endOfQueueBehavior;
  }

  if (isPlainObject(input.library)) {
    next.library.autoScanOnLaunch = Boolean(input.library.autoScanOnLaunch);
    next.library.showMissingTracks = Boolean(input.library.showMissingTracks);
  }

  if (isPlainObject(input.appearance)) {
    next.appearance.uiScale = clampNumber(Number(input.appearance.uiScale), 0.85, 1.25, defaults.appearance.uiScale);
    next.appearance.density = input.appearance.density === 'compact' ? 'compact' : defaults.appearance.density;
    next.appearance.showAlbumArt = Boolean(input.appearance.showAlbumArt);
  }

  if (isPlainObject(input.themes)) {
    if (typeof input.themes.activeThemeId === 'string' && (input.themes.activeThemeId === 'custom' || isBuiltinThemeId(input.themes.activeThemeId))) {
      next.themes.activeThemeId = input.themes.activeThemeId;
    }
    if (isPlainObject(input.themes.customTheme)) {
      next.themes.customTheme.label = String(input.themes.customTheme.label || defaults.themes.customTheme.label);
      next.themes.customTheme.tokens = normalizeThemeTokens(input.themes.customTheme.tokens, defaults.themes.customTheme.tokens);
    }
  }

  if (isPlainObject(input.advanced)) {
    next.advanced.debugLogging = Boolean(input.advanced.debugLogging);
  }

  return next;
}

export function isSettingsUpdate(value) {
  return isPlainObject(value) && typeof value.path === 'string' && 'value' in value;
}

export function validateSettingsUpdate(update) {
  if (!isSettingsUpdate(update)) {
    return { valid: false, error: 'Invalid settings update payload.' };
  }

  const directValidator = SETTINGS_UPDATE_VALIDATORS.get(update.path);
  if (directValidator) {
    const result = directValidator(update.value);
    if (!result.valid) {
      return { valid: false, error: `Invalid value for "${update.path}".` };
    }
    return { valid: true, path: update.path, value: result.value };
  }

  const tokenPrefix = 'themes.customTheme.tokens.';
  if (update.path.startsWith(tokenPrefix)) {
    const key = update.path.slice(tokenPrefix.length);
    if (!THEME_TOKEN_KEYS.includes(key)) {
      return { valid: false, error: `Unknown theme token "${key}".` };
    }
    if (typeof update.value !== 'string' || !HEX_COLOR_RE.test(update.value)) {
      return { valid: false, error: `Invalid color value for "${key}". Use hex format.` };
    }
    return { valid: true, path: update.path, value: update.value };
  }

  return { valid: false, error: `Unknown settings path "${update.path}".` };
}

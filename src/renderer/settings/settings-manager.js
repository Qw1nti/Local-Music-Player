/**
 * Renderer-side settings manager.
 *
 * Loads settings from the main process via preload, applies them to the document
 * (theme + density + scale), and keeps in sync across windows via change events.
 */

import { getThemeById, isLightThemeId, THEME_TOKEN_KEYS } from '../../shared/settings/theme-registry.js';
import { createDefaultSettings } from '../../shared/settings/default-settings.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function setAtPath(target, path, value) {
  const parts = String(path || '')
    .split('.')
    .filter(Boolean);
  if (!parts.length) return;

  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const DEFAULT_THEME_TOKENS = createDefaultSettings().themes.customTheme.tokens;

function normalizeCustomThemeTokens(rawTokens) {
  if (!isPlainObject(rawTokens)) return DEFAULT_THEME_TOKENS;
  const next = {};

  for (const tokenKey of THEME_TOKEN_KEYS) {
    const value = rawTokens[tokenKey];
    if (typeof value === 'string' && HEX_COLOR_RE.test(value)) {
      next[tokenKey] = value;
    }
  }
  return next;
}

export class SettingsManager {
  constructor(api) {
    this.api = api;
    this.settings = null;
    this.unsub = null;
    this.listeners = new Set();
    this.lastMutationId = 0;
  }

  async init() {
    try {
      this.settings = await this.api.getSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load settings.';
      throw new Error(message);
    }
    this.applyToDocument(document);

    this.unsub = this.api.onSettingsChanged((next) => {
      this.settings = next;
      this.applyToDocument(document);
      this.notifyListeners();
    });

    return this.settings;
  }

  destroy() {
    this.unsub?.();
    this.unsub = null;
    this.listeners.clear();
  }

  get() {
    return this.settings;
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    for (const listener of this.listeners) listener(this.settings);
  }

  async set(path, value) {
    if (!this.settings) throw new Error('Settings are not initialized.');

    const mutationId = ++this.lastMutationId;
    const optimistic = structuredClone(this.settings);
    setAtPath(optimistic, path, value);

    this.settings = optimistic;
    this.applyToDocument(document);
    this.notifyListeners();

    try {
      const next = await this.api.updateSetting(path, value);
      // Ignore stale responses when multiple updates are in-flight.
      if (mutationId === this.lastMutationId) {
        this.settings = next;
        this.applyToDocument(document);
        this.notifyListeners();
      }
      return next;
    } catch (error) {
      // On failure, force-refresh from source of truth.
      this.settings = await this.api.getSettings();
      this.applyToDocument(document);
      this.notifyListeners();
      const message = error instanceof Error ? error.message : `Failed to update setting "${path}".`;
      throw new Error(message);
    }
  }

  async reset() {
    let next;
    try {
      next = await this.api.resetSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset settings.';
      throw new Error(message);
    }
    this.settings = next;
    return next;
  }

  applyToDocument(doc) {
    if (!this.settings || !doc?.documentElement) return;

    const root = doc.documentElement;

    const uiScale = Number(this.settings.appearance?.uiScale ?? 1);
    root.style.setProperty('--ui-scale', String(uiScale));

    root.dataset.density = this.settings.appearance?.density === 'compact' ? 'compact' : 'comfortable';

    const activeThemeId = String(this.settings.themes?.activeThemeId || 'dark');
    root.dataset.theme = activeThemeId;
    root.style.colorScheme = isLightThemeId(activeThemeId) ? 'light' : 'dark';

    const customTokens = normalizeCustomThemeTokens(this.settings.themes?.customTheme?.tokens);
    const builtin = getThemeById(activeThemeId);

    // Apply built-in tokens via inline variables for immediate effect.
    for (const [key, value] of Object.entries(builtin.tokens)) {
      root.style.setProperty(key, value);
    }

    // Custom theme overlays the built-ins on known safe token keys only.
    if (activeThemeId === 'custom') {
      for (const tokenKey of THEME_TOKEN_KEYS) {
        const value = customTokens[tokenKey];
        if (value) root.style.setProperty(tokenKey, value);
      }
    }
  }

}

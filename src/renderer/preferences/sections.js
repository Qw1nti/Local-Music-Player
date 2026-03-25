/**
 * Preferences section definitions and section renderers.
 */

import { createDefaultSettings } from '../../shared/settings/default-settings.js';
import { BUILTIN_THEMES } from '../../shared/settings/theme-registry.js';
import { colorControl, escapeHtml, rangeControl, selectControl, settingRow, toggleControl } from './view-helpers.js';

const CUSTOM_THEME_DEFAULTS = createDefaultSettings().themes.customTheme.tokens;

export const PREFERENCES_SECTIONS = [
  { id: 'general', label: 'General', description: 'Startup and session behavior.' },
  { id: 'playback', label: 'Playback', description: 'Audio, queue, and transitions.' },
  { id: 'library', label: 'Library', description: 'Import and scanning preferences.' },
  { id: 'appearance', label: 'Appearance', description: 'Density, scale, and artwork.' },
  { id: 'themes', label: 'Themes', description: 'Preset themes and custom tokens.' },
  { id: 'advanced', label: 'Advanced', description: 'Cache, export, and debugging tools.' },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Local logs and troubleshooting.' }
];

export const PREFERENCES_SEARCH_INDEX = [
  { sectionId: 'general', terms: ['launch on startup', 'resume last session', 'remember last played track', 'default startup page'] },
  { sectionId: 'playback', terms: ['default volume', 'crossfade', 'gapless playback', 'replay gain', 'playlist ends'] },
  { sectionId: 'library', terms: ['auto-scan on launch', 'show missing tracks', 'refresh library'] },
  { sectionId: 'appearance', terms: ['ui scale', 'density', 'album artwork'] },
  { sectionId: 'themes', terms: ['curated themes', 'built-in themes', 'custom theme', 'theme tokens', 'export custom theme'] },
  { sectionId: 'advanced', terms: ['debug logging', 'clear library cache', 'export data', 'import data', 'reset settings'] },
  { sectionId: 'diagnostics', terms: ['diagnostics logs', 'refresh', 'copy', 'clear logs'] }
];

function renderThemes(settings) {
  const activeThemeId = String(settings.themes?.activeThemeId || 'dark');
  const tokens = settings.themes?.customTheme?.tokens || {};

  const cards = BUILTIN_THEMES.map((theme) => {
    const isSelected = theme.id === activeThemeId;
    const preview = theme.tokens;

    return `
      <div class="theme-card ${isSelected ? 'selected' : ''}" data-theme-pick="${theme.id}" style="
        --preview-bg: ${preview['--bg']};
        --preview-accent: ${preview['--accent']};
        --preview-surface: ${preview['--surface']};
        --preview-surface-strong: ${preview['--surface-strong']};
        --preview-line: ${preview['--line']};
      ">
        <div class="theme-preview">
          <div class="bar"></div>
          <div class="body">
            <div class="chip"></div>
            <div class="chip subtle"></div>
          </div>
        </div>
        <div class="label-row"><strong>${escapeHtml(theme.label)}</strong><span>${isSelected ? 'Active' : ''}</span></div>
        <p class="theme-note">${escapeHtml(theme.description || '')}</p>
      </div>
    `;
  }).join('');

  const custom = {
    bg: String(tokens['--bg'] || CUSTOM_THEME_DEFAULTS['--bg']),
    surface: String(tokens['--surface'] || CUSTOM_THEME_DEFAULTS['--surface']),
    surfaceStrong: String(tokens['--surface-strong'] || CUSTOM_THEME_DEFAULTS['--surface-strong']),
    text: String(tokens['--text'] || CUSTOM_THEME_DEFAULTS['--text']),
    muted: String(tokens['--muted'] || CUSTOM_THEME_DEFAULTS['--muted']),
    accent: String(tokens['--accent'] || CUSTOM_THEME_DEFAULTS['--accent']),
    danger: String(tokens['--danger'] || CUSTOM_THEME_DEFAULTS['--danger'])
  };

  return `
    <div class="prefs-section">
      <h3>Curated Themes</h3>
      <div class="themes-grid">${cards}</div>
    </div>

    <div class="prefs-section">
      <h3>Custom Theme</h3>
      ${settingRow('Activate Custom Theme', 'Switch to your custom theme.', `<button data-theme-pick="custom">Use Custom</button>`)}
      <div class="token-grid">
        <label>Background ${colorControl('themes.customTheme.tokens.--bg', custom.bg)}</label>
        <label>Surface ${colorControl('themes.customTheme.tokens.--surface', custom.surface)}</label>
        <label>Surface Strong ${colorControl('themes.customTheme.tokens.--surface-strong', custom.surfaceStrong)}</label>
        <label>Text ${colorControl('themes.customTheme.tokens.--text', custom.text)}</label>
        <label>Muted ${colorControl('themes.customTheme.tokens.--muted', custom.muted)}</label>
        <label>Accent ${colorControl('themes.customTheme.tokens.--accent', custom.accent)}</label>
        <label>Danger ${colorControl('themes.customTheme.tokens.--danger', custom.danger)}</label>
      </div>
      ${settingRow('Export Custom Theme', 'Copy custom theme tokens to clipboard.', `<button id="exportThemeBtn">Copy JSON</button>`)}
    </div>
  `;
}

export function renderSection(settings, activeSectionId) {
  switch (activeSectionId) {
    case 'general':
      return `
        <div class="prefs-section">
          <h3>Startup</h3>
          ${settingRow('Launch on startup', 'Start the app automatically when you log in.', toggleControl('general.launchOnStartup', Boolean(settings.general?.launchOnStartup)))}
          ${settingRow('Resume last session', 'Restore view, playlists, and library state on launch.', toggleControl('general.resumeLastSession', Boolean(settings.general?.resumeLastSession)))}
          ${settingRow('Remember last played track', 'Restore the previously selected track (no auto-play).', toggleControl('general.rememberLastTrack', Boolean(settings.general?.rememberLastTrack)))}
          ${settingRow(
            'Default startup page',
            'Choose which page opens by default.',
            selectControl('general.startupPage', String(settings.general?.startupPage || 'library'), [
              { value: 'library', label: 'Library' },
              { value: 'playlists', label: 'Playlists' }
            ])
          )}
        </div>
      `;

    case 'playback':
      return `
        <div class="prefs-section">
          <h3>Playback</h3>
          ${settingRow('Default volume', 'Applied when starting a fresh session.', rangeControl('playback.defaultVolume', Number(settings.playback?.defaultVolume ?? 0.9).toFixed(2), 0, 1, 0.01))}
          ${settingRow('Crossfade', 'Blend tracks when switching.', rangeControl('playback.crossfadeMs', Number(settings.playback?.crossfadeMs ?? 0), 0, 12000, 250, 'ms'))}
          ${settingRow('Gapless playback', 'Reduce transition gaps between tracks.', toggleControl('playback.gaplessPlayback', Boolean(settings.playback?.gaplessPlayback)))}
          ${settingRow(
            'Replay gain',
            'Normalize loudness when metadata is available.',
            selectControl(
              'playback.replayGain',
              String(settings.playback?.replayGain || 'off'),
              [
                { value: 'off', label: 'Off' },
                { value: 'track', label: 'Track' },
                { value: 'album', label: 'Album' }
              ]
            )
          )}
          ${settingRow(
            'When playlist ends',
            'Choose what happens at the end of the queue.',
            selectControl('playback.endOfQueueBehavior', String(settings.playback?.endOfQueueBehavior || 'stop'), [
              { value: 'stop', label: 'Stop' },
              { value: 'repeat-all', label: 'Repeat all' }
            ])
          )}
        </div>
      `;

    case 'library':
      return `
        <div class="prefs-section">
          <h3>Library</h3>
          ${settingRow('Auto-scan on launch', 'Scan watched library folders at startup.', toggleControl('library.autoScanOnLaunch', Boolean(settings.library?.autoScanOnLaunch)))}
          ${settingRow('Show missing tracks', 'Show tracks that are missing on disk.', toggleControl('library.showMissingTracks', Boolean(settings.library?.showMissingTracks)))}
          ${settingRow('Refresh library', 'Re-scan the library now (coming soon).', `<button disabled>Refresh</button>`)}
        </div>
      `;

    case 'appearance':
      return `
        <div class="prefs-section">
          <h3>Appearance</h3>
          ${settingRow('UI scale', 'Adjust overall UI size.', rangeControl('appearance.uiScale', Number(settings.appearance?.uiScale ?? 1).toFixed(2), 0.85, 1.25, 0.01))}
          ${settingRow(
            'Density',
            'Compact reduces padding and row height.',
            selectControl('appearance.density', String(settings.appearance?.density || 'comfortable'), [
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' }
            ])
          )}
          ${settingRow('Album artwork', 'Show album art where available.', toggleControl('appearance.showAlbumArt', Boolean(settings.appearance?.showAlbumArt)))}
        </div>
      `;

    case 'themes':
      return renderThemes(settings);

    case 'advanced':
      return `
        <div class="prefs-section">
          <h3>Advanced</h3>
          ${settingRow('Debug logging', 'Enable verbose logs for troubleshooting.', toggleControl('advanced.debugLogging', Boolean(settings.advanced?.debugLogging)))}
          ${settingRow('Clear library cache', 'Removes the saved library state file. You will need to re-import.', `<button id="clearLibraryBtn">Clear</button>`)}
          ${settingRow('Export data', 'Export playlists and settings to JSON.', `<button id="exportDataBtn">Export</button>`)}
          ${settingRow('Import data', 'Import playlists/settings from a previous export.', `<button id="importDataBtn">Import</button>`)}
          ${settingRow('Reset all settings', 'Restore defaults for all preferences.', `<button id="resetSettingsBtn">Reset</button>`)}
        </div>
      `;

    case 'diagnostics':
      return `
        <div class="prefs-section">
          <h3>Diagnostics Logs</h3>
          <p class="section-note">Recent app/runtime errors captured locally.</p>
          <div class="diag-actions">
            <button id="refreshDiagnosticsBtn">Refresh</button>
            <button id="copyDiagnosticsBtn">Copy</button>
            <button id="clearDiagnosticsBtn">Clear logs</button>
          </div>
          <pre id="diagnosticsLogOutput" class="diag-log">Loading logs…</pre>
        </div>
      `;

    default:
      return '<div class="prefs-section">Unknown section.</div>';
  }
}

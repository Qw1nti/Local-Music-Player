/**
 * Default settings for the application.
 *
 * Keep this file small and additive: new settings should be added here with a safe default.
 * Settings are persisted in the main process and exposed to the renderer via preload.
 */

export function createDefaultSettings() {
  return {
    version: 1,
    general: {
      launchOnStartup: false,
      resumeLastSession: true,
      startupPage: 'library', // 'library' | 'playlists'
      rememberLastTrack: true
    },
    playback: {
      defaultVolume: 0.9,
      crossfadeMs: 0,
      gaplessPlayback: false,
      replayGain: 'off', // 'off' | 'track' | 'album'
      endOfQueueBehavior: 'stop' // 'stop' | 'repeat-all'
    },
    library: {
      autoScanOnLaunch: false,
      showMissingTracks: true
    },
    appearance: {
      uiScale: 1.0, // 0.85 .. 1.25
      density: 'comfortable', // 'compact' | 'comfortable'
      showAlbumArt: true
    },
    themes: {
      activeThemeId: 'dark', // built-in id or 'custom'
      customTheme: {
        label: 'Custom',
        tokens: {
          '--bg': '#091021',
          '--bg-soft': '#111a33',
          '--surface': '#16213f',
          '--surface-strong': '#1b2a4e',
          '--line': '#2c3f68',
          '--text': '#f4f8ff',
          '--muted': '#9cb1d8',
          '--accent': '#5bc0ff',
          '--accent-soft': '#1b5ea6',
          '--danger': '#ff6f7d'
        }
      }
    },
    advanced: {
      debugLogging: false
    }
  };
}

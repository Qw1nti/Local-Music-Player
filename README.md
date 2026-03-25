# Local Music Player Rebuild

A local-first desktop music player built with Electron.
This repository is a clean-room rebuild of the original `webApp` player, with a stronger process split, a simpler security model, and a more polished listening experience.

[![Download for Mac](https://img.shields.io/badge/Download_for_Mac-Latest_Release-0f766e?style=for-the-badge)](https://github.com/Qw1nti/Local-Music-Player/releases/latest)

## Highlights

- Local file and folder importing
- Library persistence across launches
- Playlists with create, rename, reorder, and delete flows
- Playback controls for play/pause, next, previous, seek, and volume
- Queue management with move up/down, remove, clear, and drag support
- Shuffle, repeat, crossfade, gapless playback, and ReplayGain support
- Smart views for Recently Played and Most Played
- Album artwork and metadata display when available
- Resume position persistence per track
- Missing-file detection and library repair handling
- Preferences window for general, playback, library, appearance, themes, advanced, and diagnostics settings
- Export/import for playlists and settings

## Screenshots

Add screenshots here before publishing if you want the GitHub page to show the UI immediately.

## Tech Stack

- Electron
- Native browser APIs in the renderer
- Minimal IPC surface through preload
- String-template renderer with focused view modules

## Requirements

- macOS 13 or newer recommended for the simplest install flow
- Node.js 22 or newer recommended for development
- `npm` for local development and packaging

## Install

### For Mac users

Option A: one command

```bash
curl -fsSL https://raw.githubusercontent.com/Qw1nti/Local-Music-Player/main/scripts/install-mac.sh | bash
```

Option B: manual download

1. Open the latest GitHub Release.
2. Download `LocalMusicPlayer-mac-arm64.zip`.
3. Unzip it.
4. Drag `LocalMusicPlayer.app` into your `Applications` folder.
5. Open the app from `Applications` or Spotlight.

### For developers

From the repository root:

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

On macOS, `npm run dev` launches Electron through `scripts/launch-electron-mac.sh`, which copies the app bundle to `/tmp` first. That avoids the local launch restriction we hit with the bundled Electron app.

If you want the same launch path as production users, open the installed app instead:

```bash
open ~/Applications/LocalMusicPlayer.app
```

## Build and Release

### macOS

```bash
npm run build:mac
npm run release:mac
```

- `build:mac` packages the app into `dist/LocalMusicPlayer-darwin-arm64`
- `release:mac` packages the app, creates `dist/LocalMusicPlayer-mac-arm64.zip`, and copies `LocalMusicPlayer.app` into `~/Applications`
- The packaging scripts use the local `@electron/packager` dependency from this repository

### Windows and Linux

Packaging scripts exist for the other platforms, but they have not been the primary focus of this rebuild yet:

```bash
npm run build:win
npm run build:linux
```

## Available Scripts

```bash
npm run dev
npm start
npm run install:mac
npm run check
npm test
npm run build:mac
npm run release:mac
npm run build:win
npm run build:linux
npm run smoke:packages
```

## Features In Detail

### Library

- Browse imported tracks in a searchable, filterable library
- Filter by artist, playlist, genre, and duration
- Sort by title, artist, recency, or duration
- Group by artist, playlist, or artist -> playlist
- Select multiple tracks for batch actions

### Playlists

- Create and rename playlists
- Reorder tracks within a playlist
- Remove tracks from a playlist
- Use the active playlist when adding tracks from the library

### Playback

- Play/pause, next, previous, seek, and volume controls
- Shuffle queue mode
- Repeat modes
- Crossfade and gapless playback options
- ReplayGain support when metadata is available

### Right Rail

- Now Playing card with artwork and metadata
- Up Next queue management
- Smart Views for Recently Played and Most Played
- Quick stats for track and playlist counts

### Preferences

- General session behavior
- Playback tuning
- Library scanning options
- Appearance density and scale
- Built-in themes and custom tokens
- Diagnostics logs and troubleshooting tools

## Data Storage

The app stores its local data in Electron's user data directory.

- Library state: `library-state.json`
- Settings: `settings.json`

Imported music files are never copied into the app by default. The app references the files on disk and tracks metadata in local state.

## Keyboard Shortcuts

- `Space` - Play/pause
- Arrow keys - Track navigation and seeking in the player
- `Cmd/Ctrl+F` - Focus library search
- `Cmd/Ctrl+,` - Open Preferences

## Project Structure

```text
electron-music-player-rebuild/
  index.html
  preferences.html
  package.json
  README.md
  scripts/
  src/
    main/
      index.js
      app-menu.js
      ipc/
      services/
      utils/
      windows/
    preload/
      index.cjs
    renderer/
      components/
      preferences/
      services/
      settings/
      store/
      styles/
      utils/
    shared/
      constants/
      helpers/
      settings/
  test/
```

## Architecture

### Main Process

- Owns app lifecycle and privileged filesystem work
- Handles native dialogs, scanning, persistence, and packaging-related tasks
- Registers explicit IPC handlers

### Preload Layer

- Exposes a single `window.musicApi` surface
- Keeps Node/Electron APIs out of the renderer

### Renderer

- Renders the UI with focused view modules
- Uses a lightweight store for application state
- Wraps playback with a dedicated `AudioPlayer` service

### Shared

- IPC constants
- Audio extension rules
- Default settings and schemas
- Theme registry and persisted-state helpers

## Security

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Renderer access is limited to the preload API
- IPC payloads are validated

## Development Notes

- The frontend is intentionally desktop-first.
- The current visual system uses a shared theme layer for the main window and Preferences.
- The app is designed to be local-first and offline-friendly.
- The packaging flow currently targets macOS as the best-supported release path.

## Troubleshooting

### `npm run dev` fails with `EACCES`

This repository uses `scripts/launch-electron-mac.sh` on macOS, which copies Electron to `/tmp` before launching it. If you still see launch issues, run a clean reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### App does not open from `~/Applications`

Re-run the macOS release flow:

```bash
npm run release:mac
```

### GitHub release install

If you are publishing this repository publicly, attach `dist/LocalMusicPlayer-mac-arm64.zip` to the GitHub Release so Mac users can install by downloading, unzipping, and dragging the app into `Applications`.

For a one-command install, the release installer script downloads that ZIP automatically and installs the app into `~/Applications`.

## Testing

```bash
npm run check
npm test
```

## License

No license file has been added yet. If you plan to publish this repository publicly, add a license before making the project broadly available.

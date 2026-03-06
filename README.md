# Local Music Player

Local-first music player web app for your own audio files, with optional Spotify liked-song metadata matching.

## Features
- Import local audio files or folders
- Play, pause, seek, next, previous, volume control
- Create and manage playlists
- Theme/settings support
- Optional Spotify metadata matching
- Installable as a PWA with app icons configured

## Requirements
- Node.js LTS (includes npm)
- Google Chrome (recommended for app mode launcher)

This project does not require `npm install`.

## 1. Get the Project

### Option A: Download ZIP
1. Open the GitHub repository.
2. Click `Code` > `Download ZIP`.
3. Extract the ZIP.

### Option B: Clone with Git
```bash
git clone https://github.com/Qw1nti/Local-Music-Player.git
cd Local-Music-Player
```

## 2. Verify Node.js

### Windows (PowerShell)
```powershell
node -v
npm -v
```

### macOS/Linux (Terminal)
```bash
node -v
npm -v
```

## 3. Run the App

### Option A: Standard browser run (all OS)
Development server:
```bash
npm run dev
```
Open `http://127.0.0.1:5173`

Production preview:
```bash
npm run build
npm run preview
```
Open `http://127.0.0.1:4173`

### Option B: App-mode launcher (recommended)
Use this if you want it to behave like a desktop app window.

Windows/macOS/Linux:
```bash
npm run prod:launch
```

Stop manually if needed:
```bash
npm run prod:stop
```

### Important launcher behavior
- `prod:launch` starts a managed local server and opens Chrome app mode.
- When that managed Chrome app window is closed, the managed server is automatically stopped.
- If Chrome is not available and fallback browser open is used, auto-stop on close is not guaranteed.

## 4. First-Time Usage
1. Click `Import Files` or `Import Folder`.
2. Select audio files (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`).
3. Use playback controls at the bottom.
4. Create playlists in the sidebar.

## 5. Optional Spotify Setup
1. Create an app in Spotify Developer Dashboard.
2. Add your redirect URI exactly.
3. Edit `config.js`:

```js
window.APP_CONFIG = {
  spotifyClientId: 'YOUR_CLIENT_ID',
  spotifyRedirectUri: 'http://127.0.0.1:4173/'
};
```

For GitHub Pages, use your Pages URL as redirect URI.

## 6. Deploy to GitHub Pages
This repo includes `.github/workflows/deploy.yml`.

1. Push to `main`.
2. GitHub repository > `Settings` > `Pages`.
3. Set Source to `GitHub Actions`.
4. Wait for the deploy workflow to finish.

## Troubleshooting
- `npm` not found: reinstall Node.js and reopen terminal.
- `spawn EINVAL` on Windows: pull latest repo changes and run `npm run prod:launch` again.
- Port already in use: run `npm run prod:stop`, then relaunch.
- Spotify login fails: redirect URI mismatch is the most common cause.

## Screenshots
- Add app screenshots here.

## License
MIT

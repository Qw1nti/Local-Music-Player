# Local Music Player

Local-first web music player for your own audio files, with optional Spotify metadata matching.

## Features
- Play local music files and folders
- Full playback controls (play/pause, seek, next/previous, volume)
- Playlist management
- Theme/settings customization
- Optional Spotify liked-song metadata matching
- PWA + desktop-style launch support

## Requirements
- Node.js LTS (includes npm)
- Google Chrome (recommended for app-mode launch)

## Get the Project

### Download ZIP
1. Open the GitHub repository.
2. Click `Code` > `Download ZIP`.
3. Extract the ZIP to a folder.

### Clone with Git
```bash
git clone https://github.com/Qw1nti/Local-Music-Player.git
cd Local-Music-Player
```

## Verify Node.js

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

## Running the App (One-Click Launch)

Use these launchers from the project root.

### Windows
Double-click:
```text
launch.bat
```

### macOS
Double-click:
```text
launch.command
```
If blocked the first time, right-click `launch.command` and choose `Open`.

### Linux
Run once:
```bash
chmod +x launch.sh
```
Then launch:
```bash
./launch.sh
```

Each launcher:
- checks required runtime tools
- installs npm dependencies if needed
- builds the app
- starts the local server
- opens the app in your default browser

Stop the managed server:
```bash
npm run prod:stop
```

## Running from Terminal

### Development
```bash
npm run dev
```
Open: `http://127.0.0.1:5173`

### Production Preview
```bash
npm run build
npm run preview
```
Open: `http://127.0.0.1:4173`

### Desktop-Style App Mode
```bash
npm run prod:launch
```
This starts a managed server and opens Chrome app mode.

## First-Time Usage
1. Click `Import Files` or `Import Folder`.
2. Select audio files (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`).
3. Use controls at the bottom player bar.
4. Create playlists from the sidebar.

## Optional Spotify Setup
1. Create an app in Spotify Developer Dashboard.
2. Add redirect URI (example: `http://127.0.0.1:4173/`).
3. Edit `config.js`:

```js
window.APP_CONFIG = {
  spotifyClientId: 'YOUR_CLIENT_ID',
  spotifyRedirectUri: 'http://127.0.0.1:4173/'
};
```

For GitHub Pages deployment, use your Pages URL as the redirect URI.

## Deploy to GitHub Pages
1. Push to `main`.
2. Go to repository `Settings` > `Pages`.
3. Set Source to `GitHub Actions`.
4. Wait for workflow completion.

## Troubleshooting
- `npm` not found: reinstall Node.js and reopen terminal.
- Port already in use: run `npm run prod:stop`, then launch again.
- Spotify login fails: verify exact redirect URI match.

## License
MIT

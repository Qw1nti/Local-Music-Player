# Local Music Player

Local-first browser music player that plays your local audio files and can optionally sync Spotify liked-song metadata.

## What You Need
This project does **not** use `npm install`.
You only need:
- Node.js (to run the build script)
- Python 3 (to run a local web server)
- A modern browser (Chrome, Edge, Firefox, or Safari)

---

## 1. Download the Project

### Option A: Download ZIP (easiest)
1. Open the GitHub repository page.
2. Click **Code** -> **Download ZIP**.
3. Extract the ZIP to a folder you can find easily.

### Option B: Clone with Git
```bash
git clone https://github.com/Qw1nti/Local-Music-Player.git
cd Local-Music-Player
```

---

## 2. Install Prerequisites (by OS)

## Windows

### Install Node.js
1. Go to: https://nodejs.org
2. Download **LTS** version.
3. Run installer with default options.
4. Open **PowerShell** and verify:
```powershell
node -v
npm -v
```

### Install Python 3
1. Go to: https://python.org/downloads
2. Download latest Python 3 for Windows.
3. During install, check **Add Python to PATH**.
4. Verify in PowerShell:
```powershell
python --version
```
If that fails, try:
```powershell
py --version
```

## macOS

### Install Node.js
1. Go to: https://nodejs.org
2. Download **LTS** `.pkg` installer.
3. Install, then verify in Terminal:
```bash
node -v
npm -v
```

### Install Python 3
macOS usually has Python 3 already. Verify:
```bash
python3 --version
```
If missing, install from https://python.org/downloads or Homebrew:
```bash
brew install python
```

## Linux (Ubuntu/Debian)

### Install Node.js + npm
```bash
sudo apt update
sudo apt install -y nodejs npm
```
Verify:
```bash
node -v
npm -v
```

### Install Python 3
```bash
sudo apt install -y python3
```
Verify:
```bash
python3 --version
```

---

## 3. Open Terminal in the Project Folder

If you used ZIP extraction, open terminal in that folder.

Example:
```bash
cd /path/to/Local-Music-Player
```

On Windows PowerShell:
```powershell
cd C:\path\to\Local-Music-Player
```

---

## 4. Run the App (Step-by-Step)

## Quick run (development mode)
```bash
npm run dev
```
Open in browser:
- `http://127.0.0.1:5173`

## Build + production preview
1. Build:
```bash
npm run build
```
2. Preview build:
```bash
npm run preview
```
Open:
- `http://127.0.0.1:4173`

---

## 5. macOS One-Click Launch
If you are on macOS, you can launch build + preview + Chrome app mode with:
```bash
npm run prod:launch
```
Stop managed preview server:
```bash
npm run prod:stop
```

---

## 6. First-Time App Usage
1. Click **Import Files** or **Import Folder**.
2. Select music files (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`).
3. Use player controls at bottom (play, seek, volume, next/prev).
4. Create playlists from sidebar.

---

## 7. Optional Spotify Setup
If you want Spotify metadata matching:
1. Create a Spotify app in Spotify Developer Dashboard.
2. Set redirect URI to your app URL (must match exactly).
3. Update `config.js`:

```js
window.APP_CONFIG = {
  spotifyClientId: 'YOUR_CLIENT_ID',
  spotifyRedirectUri: 'http://127.0.0.1:4173/'
};
```

For GitHub Pages deployment, use your Pages URL as redirect URI.

---

## 8. Deploy to GitHub Pages
This repo includes `.github/workflows/deploy.yml`.

1. Push code to `main` branch.
2. GitHub repo -> **Settings** -> **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Wait for Actions workflow to finish.

---

## Troubleshooting
- `npm` not found: reinstall Node.js and reopen terminal.
- `python3` not found: install Python 3 and reopen terminal.
- Port already in use: close old terminal/server, then run command again.
- Spotify login fails: redirect URI mismatch is the most common cause.

## License
MIT

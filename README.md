🎵 Local Music Player

A local-first music player web app for playing your own audio files.
Includes optional Spotify liked-song metadata matching and can run like a desktop app.

✨ Features

🎧 Play local music

Import individual files or entire folders

Supports .mp3, .m4a, .wav, .ogg, .flac

⏯ Full playback controls

Play / Pause

Seek through track

Next / Previous

Volume control

📂 Playlist management

Create playlists

Organize your music library

🎨 Themes & settings

Switch UI themes

Customize app appearance

🔗 Spotify metadata matching (optional)

Match your local songs with Spotify metadata

🖥 Desktop-like experience

Installable Progressive Web App (PWA)

Launch in Chrome app mode

⚙️ Requirements

Before running the app, install:

Node.js LTS (includes npm)

Google Chrome (recommended)

✔ No manual npm install needed in most cases.

📥 1. Get the Project
Option A — Download ZIP

Open the GitHub repository

Click Code

Select Download ZIP

Extract the ZIP file

Option B — Clone with Git
git clone https://github.com/Qw1nti/Local-Music-Player.git
cd Local-Music-Player
🔍 2. Verify Node.js
Windows (PowerShell)
node -v
npm -v
macOS / Linux (Terminal)
node -v
npm -v

If both commands show versions, you're ready to go.

🚀 Running the App (One-Click Launch)

Run these launchers from the project root folder.

🪟 Windows

1️⃣ Double-click:

launch.bat

This script will:

Check Node/npm

Install dependencies if needed

Build the app

Start the server

Open the music player

🍎 macOS

1️⃣ Double-click:

launch.command

If blocked the first time:

Right Click → Open
🐧 Linux

First allow execution:

chmod +x launch.sh

Then run:

./launch.sh
🛑 Stop the Server

Stop the managed server anytime:

npm run prod:stop
💻 Running from Terminal
Development Mode
npm run dev

Open:

http://127.0.0.1:5173
Production Preview
npm run build
npm run preview

Open:

http://127.0.0.1:4173
🖥 Desktop-Style Launch (App Mode)

Launch the app in a standalone Chrome window:

npm run prod:launch

Behavior:

Starts a managed local server

Opens Chrome in app mode

Closing the window automatically stops the server

Manual stop:

npm run prod:stop
🎧 First-Time Usage

1️⃣ Click Import Files or Import Folder

2️⃣ Select your music files

Supported formats:

.mp3
.m4a
.wav
.ogg
.flac

3️⃣ Use the playback controls at the bottom

4️⃣ Create playlists in the sidebar

🔗 Optional Spotify Setup

If you want Spotify metadata matching:

1️⃣ Create a Spotify App

Go to:

Spotify Developer Dashboard

Create a new application.

2️⃣ Add Redirect URI

Example:

http://127.0.0.1:4173/
3️⃣ Edit config.js
window.APP_CONFIG = {
  spotifyClientId: 'YOUR_CLIENT_ID',
  spotifyRedirectUri: 'http://127.0.0.1:4173/'
};

If deploying to GitHub Pages, use your Pages URL as the redirect URI.

🌐 Deploy to GitHub Pages

This repository already includes a deployment workflow.

Steps:

1️⃣ Push to the main branch

2️⃣ Go to:

Repository → Settings → Pages

3️⃣ Set Source → GitHub Actions

4️⃣ Wait for the workflow to complete.

🛠 Troubleshooting
npm not found

Reinstall Node.js and reopen the terminal.

spawn EINVAL on Windows

Pull the latest repository changes and run:

npm run prod:launch
Port already in use
npm run prod:stop

Then relaunch.

Spotify login fails

Most common cause:

⚠ Redirect URI mismatch in Spotify dashboard.

📸 Screenshots

Add screenshots here.

Example:

/screenshots/player.png
/screenshots/library.png
📄 License

MIT License

✅ Improvements made:

Better visual hierarchy

Emoji navigation

Clear step-by-step setup

Cleaner code blocks

More readable GitHub formatting

If you want, I can also make a 🔥 “really polished open-source style README” with:

badges (build status, license, stars)

screenshots layout

feature GIFs

install buttons

better GitHub marketing style.

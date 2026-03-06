# Local Music Player

Local-first browser music player with optional Spotify metadata sync.

## Requirements
- Node.js (for build script only)
- Python 3 (for local static server)

No `npm install` is required.

## Local Development
Serve the current project files directly:

```bash
npm run dev
```

App URL: `http://127.0.0.1:5173`

## Production Build
```bash
npm run build
```

Build output goes to `dist/`.

## Local Production Preview
```bash
npm run preview
```

Preview URL: `http://127.0.0.1:4173`

## One-Click Local Launch (macOS)
```bash
npm run prod:launch
```

Stops managed preview process:
```bash
npm run prod:stop
```

## GitHub Pages Deployment
This repo includes `.github/workflows/deploy.yml`.

1. Push to `main`
2. GitHub repo -> **Settings** -> **Pages**
3. Set Source to **GitHub Actions**

The workflow builds with:
- `node ./scripts/build-static.mjs`

## Spotify Setup
Set values in `config.js` or app settings:

```js
window.APP_CONFIG = {
  spotifyClientId: 'YOUR_CLIENT_ID',
  spotifyRedirectUri: 'https://<your-pages-url>/'
};
```

## License
MIT

export function renderShell() {
  return `
    <div class="app-shell">
      <aside class="left-rail glass-panel">
        <div class="brand-block">
          <div class="brand-mark" aria-hidden="true">
            <div class="brand-dot"></div>
          </div>
          <div class="brand-copy">
            <h1>Local Music Player</h1>
            <p>Private listening, curated like a gallery.</p>
          </div>
        </div>

        <div class="rail-intro">
          <span class="eyebrow">Navigation</span>
          <p>Switch between the library, playlists, and preferences without losing your place.</p>
        </div>

        <nav class="view-switcher" aria-label="Main navigation">
          <button class="nav-btn nav-pill" data-view="library">Library</button>
          <button class="nav-btn nav-pill" data-view="playlists">Playlists</button>
          <button id="openPreferencesBtn" class="nav-pill">Open Preferences</button>
        </nav>

        <section class="library-block">
          <div class="library-head">
            <h2>Your Playlists</h2>
            <button id="createPlaylistBtn" class="ghost-btn">+ Create</button>
          </div>
          <div id="playlistList" class="playlist-list"></div>
        </section>
      </aside>

      <main class="center-stage">
        <header class="toolbar glass-panel">
          <div class="toolbar-copy">
            <span class="eyebrow">Library Browser</span>
            <h2>Find, filter, and shape your collection.</h2>
          </div>
          <div class="toolbar-actions">
            <button id="importFilesBtn">Import Files</button>
            <button id="importFolderBtn">Import Folder</button>
            <button id="exportDataBtn">Export Data</button>
            <button id="importDataBtn">Import Data</button>
          </div>
        </header>

        <div class="surface-stack">
          <section id="scanProgressBanner" class="banner hidden" aria-live="polite"></section>
          <section id="importSummaryBanner" class="banner hidden" aria-live="polite"></section>

          <div id="statusBanner" class="banner hidden" role="status" aria-live="polite"></div>
          <div id="errorBanner" class="banner error hidden"></div>
          <div id="undoToast" class="toast hidden"></div>

          <section id="libraryView" class="view glass-panel"></section>
          <section id="playlistsView" class="view glass-panel hidden"></section>
        </div>
      </main>

      <aside id="nowPlayingRail" class="right-rail glass-panel"></aside>

      <footer id="playerBar" class="player-bar"></footer>

      <div id="appModal" class="app-modal hidden" aria-hidden="true"></div>
    </div>
  `;
}

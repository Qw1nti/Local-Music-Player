import { formatTime } from '../utils/format.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function selectOptions(selected, options) {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');
}

function renderControlBar(model, options = {}) {
  const { browser, controls, resultCount, totalCount, activeFilters } = model;
  const advancedCollapsed = options.advancedCollapsed !== false;

  const artistOptions = [{ value: 'all', label: 'All artists' }, ...controls.artists.map((artist) => ({ value: artist, label: artist }))];
  const playlistOptions = [{ value: 'all', label: 'All playlists' }, ...controls.playlists.map((playlist) => ({ value: playlist.id, label: playlist.name }))];
  const genreOptions = [{ value: 'all', label: 'All genres' }, ...controls.genres.map((genre) => ({ value: genre, label: genre }))];

  const durationOptions = [
    { value: 'all', label: 'All durations' },
    { value: 'under-2', label: 'Under 2 min' },
    { value: '2-4', label: '2-4 min' },
    { value: '4-6', label: '4-6 min' },
    { value: 'over-6', label: 'Over 6 min' }
  ];

  const sortOptions = [
    { value: 'title-asc', label: 'Title A-Z' },
    { value: 'artist-asc', label: 'Artist A-Z' },
    { value: 'recent-desc', label: 'Recently added' },
    { value: 'duration-asc', label: 'Duration' }
  ];

  const groupOptions = [
    { value: 'none', label: 'None' },
    { value: 'artist', label: 'Artist' },
    { value: 'playlist', label: 'Playlist' },
    { value: 'artist-playlist', label: 'Artist -> Playlist' }
  ];

  return `
    <section class="library-browser-controls">
      <div class="library-browser-head">
        <div>
          <span class="eyebrow">Browse</span>
          <h3>Filter the library without losing context.</h3>
        </div>
        <div class="library-browser-summary">
          <strong>${resultCount}</strong> of ${totalCount} songs
        </div>
      </div>

      <div class="library-browser-row search-row">
        <input id="librarySearchInput" type="search" value="${escapeHtml(browser.searchQuery)}" placeholder="Search title, artist, album, genre" aria-label="Search library" />
        <button id="clearLibraryFiltersBtn" aria-label="Reset current library filters">Reset View</button>
      </div>

      <button id="toggleAdvancedFiltersBtn" class="advanced-toggle" aria-expanded="${advancedCollapsed ? 'false' : 'true'}">
        ${advancedCollapsed ? 'Show Advanced Filters' : 'Hide Advanced Filters'}
      </button>

      <div class="library-browser-row grid-row ${advancedCollapsed ? 'hidden' : ''}" id="advancedFiltersPanel">
        <label>
          <span>Artist</span>
          <select id="libraryFilterArtist">${selectOptions(browser.filters.artist, artistOptions)}</select>
        </label>
        <label>
          <span>Playlist</span>
          <select id="libraryFilterPlaylist">${selectOptions(browser.filters.playlist, playlistOptions)}</select>
        </label>
        <label>
          <span>Genre</span>
          <select id="libraryFilterGenre">${selectOptions(browser.filters.genre, genreOptions)}</select>
        </label>
        <label>
          <span>Duration</span>
          <select id="libraryFilterDuration">${selectOptions(browser.filters.durationRange, durationOptions)}</select>
        </label>
        <label>
          <span>Sort</span>
          <select id="librarySortMode">${selectOptions(browser.sortMode, sortOptions)}</select>
        </label>
        <label>
          <span>Group by</span>
          <select id="libraryGroupMode">${selectOptions(browser.groupMode, groupOptions)}</select>
        </label>
      </div>

      <div class="library-browser-meta">
        <div class="active-filter-chips">
        ${activeFilters.length ? activeFilters.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('') : '<span class="chip subtle">No active filters</span>'}
        </div>
      </div>
    </section>
  `;
}

function renderTrackRow(track, context = {}) {
  const author = track.author && track.author !== track.artist ? ` • ${escapeHtml(track.author)}` : '';
  const indexHtml = context.index === null ? '' : String(context.index + 1);
  const showAlbumArt = context.showAlbumArt !== false;
  const selectedTrackIds = context.selectedTrackIds || new Set();
  const selected = selectedTrackIds.has(track.id);
  const isNowPlaying = Boolean(context.currentTrackId && context.currentTrackId === track.id);
  const isUpNext = Boolean(context.upNextTrackIds?.has(track.id));

  const art = showAlbumArt
    ? track.artworkDataUrl
      ? `<img class="track-art" src="${escapeHtml(track.artworkDataUrl)}" alt="" />`
      : '<div class="track-art placeholder" aria-hidden="true"></div>'
    : '<div class="track-art hidden-art" aria-hidden="true"></div>';

  return `
    <article class="track-row ${track.missing ? 'is-missing' : ''} ${isNowPlaying ? 'is-now-playing' : ''} ${isUpNext ? 'is-up-next' : ''}" style="--group-depth:${context.depth || 0}" data-track-id="${track.id}">
      <label class="track-select">
        <input type="checkbox" data-action="toggle-track-selected" data-track-id="${track.id}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(track.title)}" />
      </label>
      <div class="track-index">${indexHtml}</div>
      ${art}
      <div class="track-meta">
        <div class="track-title-line">
          <strong>${escapeHtml(track.title)}</strong>
          ${isNowPlaying ? '<span class="tag playing">Now Playing</span>' : ''}
          ${isUpNext ? '<span class="tag queued">Up Next</span>' : ''}
          ${track.missing ? '<span class="tag">Missing</span>' : ''}
        </div>
        <div class="track-subtitle">${escapeHtml(track.artist)}${author} • ${escapeHtml(track.album)} • ${escapeHtml(track.genre || 'Unknown Genre')}</div>
      </div>
      <div class="track-duration">${formatTime(track.durationSec)}</div>
      <div class="track-actions">
        <button data-action="play-track" data-track-id="${track.id}" aria-label="Play ${escapeHtml(track.title)}">Play</button>
        <button data-action="add-track-active-playlist" data-track-id="${track.id}" aria-label="Add ${escapeHtml(track.title)} to playlist">Add to Playlist</button>
      </div>
    </article>
  `;
}

function renderGroup(group, context = {}) {
  const children = [];
  if (group.expanded) {
    if (group.groups.length) {
      for (const child of group.groups) {
        children.push(renderGroup(child, { ...context, depth: (context.depth || 0) + 1 }));
      }
    }

    if (group.tracks.length) {
      for (const track of group.tracks) {
        children.push(renderTrackRow(track, {
          ...context,
          index: null,
          depth: (context.depth || 0) + 1
        }));
      }
    }
  }

  return `
    <section class="library-group" style="--group-depth:${context.depth || 0}">
      <button class="group-toggle" data-action="toggle-library-group" data-group-key="${escapeHtml(group.key)}" aria-expanded="${group.expanded ? 'true' : 'false'}">
        <span class="caret">${group.expanded ? '▾' : '▸'}</span>
        <strong>${escapeHtml(group.label)}</strong>
        <span class="group-count">${group.count}</span>
      </button>
      ${group.expanded ? `<div class="group-children">${children.join('')}</div>` : ''}
    </section>
  `;
}

function renderBulkActions(selectedCount, isPlaylistsView = false) {
  if (!selectedCount) return '';
  return `
    <div class="bulk-actions">
      <strong>${selectedCount}</strong> selected
      <button data-action="bulk-add-selected">Add to Active Playlist</button>
      ${isPlaylistsView ? '<button data-action="bulk-remove-selected">Remove from Active Playlist</button>' : ''}
      <button data-action="clear-track-selection">Clear Selection</button>
    </div>
  `;
}

function renderOnboardingEmptyState() {
  return `
    <section class="onboarding-card" aria-label="Library setup guide">
      <h3>Start your library</h3>
      <p>Set up your music in three quick steps.</p>
      <ol>
        <li><button data-action="onboard-import-folder">1. Import a Music Folder</button></li>
        <li><button data-action="onboard-import-files">2. Add Individual Files</button></li>
        <li><button data-action="onboard-create-playlist">3. Create Your First Playlist</button></li>
      </ol>
    </section>
  `;
}

function renderList(model, options = {}) {
  const selectedCount = (options.selectedTrackIds || new Set()).size;
  const bulk = renderBulkActions(selectedCount, options.isPlaylistsView);
  const showOnboarding = Boolean(options.showOnboarding);

  if (model.grouped.mode === 'none') {
    if (!model.flatTracks.length) {
      if (showOnboarding) {
        return `${bulk}${renderOnboardingEmptyState()}`;
      }
      return `${bulk}<div class="empty">No songs match this view. Try adjusting filters or importing music.</div>`;
    }

    return `
      ${bulk}
      <section class="track-list" aria-label="Library tracks">
        ${model.flatTracks.map((track, index) => renderTrackRow(track, { ...options, index, depth: 0 })).join('')}
      </section>
    `;
  }

  if (!model.grouped.groups.length) {
    return `${bulk}<div class="empty">No songs match this view. Try adjusting filters.</div>`;
  }

  return `
    ${bulk}
    <section class="group-list" aria-label="Grouped library tracks">
      ${model.grouped.groups.map((group) => renderGroup(group, { ...options, depth: 0 })).join('')}
    </section>
  `;
}

export function renderLibraryView(model, options = {}) {
  return `${renderControlBar(model, options)}${renderList(model, options)}`;
}

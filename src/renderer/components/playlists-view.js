import { formatTime } from '../utils/format.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderPlaylistRenameField(playlistId, draftName) {
  return `
    <input
      class="playlist-rename-input"
      data-playlist-rename-input="true"
      data-playlist-id="${playlistId}"
      value="${escapeHtml(draftName)}"
      maxlength="120"
      aria-label="Rename playlist"
    />
  `;
}

function renderPlaylistTrack(track, index, options = {}) {
  const author = track.author && track.author !== track.artist ? ` • ${escapeHtml(track.author)}` : '';
  const showAlbumArt = options.showAlbumArt !== false;
  const selected = options.selectedTrackIds?.has(track.id);
  const isNowPlaying = Boolean(options.currentTrackId && options.currentTrackId === track.id);
  const isUpNext = Boolean(options.upNextTrackIds?.has(track.id));

  const art = showAlbumArt
    ? track.artworkDataUrl
      ? `<img class="track-art" src="${escapeHtml(track.artworkDataUrl)}" alt="" />`
      : '<div class="track-art placeholder" aria-hidden="true"></div>'
    : '<div class="track-art hidden-art" aria-hidden="true"></div>';

  return `
    <article class="track-row ${isNowPlaying ? 'is-now-playing' : ''} ${isUpNext ? 'is-up-next' : ''}" data-track-id="${track.id}">
      <label class="track-select">
        <input type="checkbox" data-action="toggle-track-selected" data-track-id="${track.id}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(track.title)}" />
      </label>
      <div class="track-index">${index + 1}</div>
      ${art}
      <div class="track-meta">
        <div class="track-title-line">
          <strong>${escapeHtml(track.title)}</strong>
          ${isNowPlaying ? '<span class="tag playing">Now Playing</span>' : ''}
          ${isUpNext ? '<span class="tag queued">Up Next</span>' : ''}
        </div>
        <div class="track-subtitle">${escapeHtml(track.artist)}${author} • ${escapeHtml(track.album)}</div>
      </div>
      <div class="track-duration">${formatTime(track.durationSec)}</div>
      <div class="track-actions">
        <button data-action="play-track-from-playlist" data-track-id="${track.id}" aria-label="Play ${escapeHtml(track.title)}">Play</button>
        <button data-action="playlist-track-up" data-track-index="${index}" aria-label="Move ${escapeHtml(track.title)} up">Move Up</button>
        <button data-action="playlist-track-down" data-track-index="${index}" aria-label="Move ${escapeHtml(track.title)} down">Move Down</button>
        <button data-action="playlist-track-remove" data-track-id="${track.id}" aria-label="Remove ${escapeHtml(track.title)} from playlist">Remove</button>
      </div>
    </article>
  `;
}

export function renderPlaylistList(playlists, activePlaylistId, renameState = null) {
  if (!playlists.length) {
    return '<div class="empty small">No playlists yet.</div>';
  }

  const editingId = renameState?.editingPlaylistId || null;
  const draft = renameState?.draft || '';

  return playlists
    .map((playlist) => `
      <button class="playlist-item ${playlist.id === activePlaylistId ? 'active' : ''}" data-action="select-playlist" data-playlist-id="${playlist.id}" aria-label="Open playlist ${escapeHtml(playlist.name)}">
        ${
          editingId === playlist.id
            ? renderPlaylistRenameField(playlist.id, draft)
            : `<span class="playlist-name" data-action="start-rename-playlist" data-playlist-id="${playlist.id}" title="Rename playlist">${escapeHtml(playlist.name)}</span>`
        }
        <span class="playlist-count">${playlist.trackIds.length}</span>
      </button>
    `)
    .join('');
}

function renderBulkActions(selectedCount) {
  if (!selectedCount) return '';
  return `
    <div class="bulk-actions">
      <strong>${selectedCount}</strong> selected
      <button data-action="bulk-remove-selected">Remove from Active Playlist</button>
      <button data-action="clear-track-selection">Clear Selection</button>
    </div>
  `;
}

export function renderPlaylistsView(activePlaylist, tracksById, renameState = null, options = {}) {
  if (!activePlaylist) {
    return '<div class="empty playlist-empty">Create or select a playlist from the left panel.</div>';
  }

  const tracks = activePlaylist.trackIds
    .map((trackId) => tracksById.get(trackId))
    .filter(Boolean);

  return `
    <section class="playlist-shell">
      <header class="playlist-header">
        <div class="playlist-header-copy">
          <span class="eyebrow">Playlist</span>
          <h2>
          ${
            renameState?.editingPlaylistId === activePlaylist.id
              ? renderPlaylistRenameField(activePlaylist.id, renameState.draft || activePlaylist.name)
              : `<span data-action="start-rename-playlist" data-playlist-id="${activePlaylist.id}" title="Rename playlist">${escapeHtml(activePlaylist.name)}</span>`
          }
          </h2>
          <p>${tracks.length} track${tracks.length === 1 ? '' : 's'}</p>
        </div>
        <div class="playlist-header-actions">
          <button id="renamePlaylistBtn" data-action="start-rename-playlist" data-playlist-id="${activePlaylist.id}">Rename Playlist</button>
          <button id="deletePlaylistBtn">Delete Playlist</button>
        </div>
      </header>
      <section class="track-list">
      ${renderBulkActions((options.selectedTrackIds || new Set()).size)}
      ${tracks.length ? tracks.map((track, index) => renderPlaylistTrack(track, index, options)).join('') : '<div class="empty">No tracks in this playlist yet.</div>'}
      </section>
    </section>
  `;
}

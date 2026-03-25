function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderQueueRow(track, index, options = {}) {
  const isUpNext = Boolean(options.upNextTrackIds?.has(track?.id));
  const isCurrent = Boolean(options.currentTrackId && track?.id === options.currentTrackId);

  return `
    <li class="queue-row ${isUpNext ? 'is-up-next' : ''} ${isCurrent ? 'is-current' : ''}" draggable="true" data-action="queue-drag-start" data-queue-index="${index}" tabindex="0" data-queue-row="${index}">
      <div class="queue-meta">
        <strong>${escapeHtml(track?.title || 'Unknown')}</strong>
        <span>${escapeHtml(track?.artist || 'Unknown Artist')}</span>
      </div>
      <div class="queue-actions">
        <button data-action="queue-move-up" data-queue-index="${index}" aria-label="Move queue item up">↑</button>
        <button data-action="queue-move-down" data-queue-index="${index}" aria-label="Move queue item down">↓</button>
        <button data-action="queue-remove" data-track-id="${escapeHtml(track?.id || '')}" data-queue-index="${index}" aria-label="Remove from queue">×</button>
      </div>
    </li>
  `;
}

export function renderNowPlayingRail({
  track,
  totalTracks,
  totalPlaylists,
  upNextTracks = [],
  queueTracks = [],
  shuffleEnabled = false,
  smartViews = {},
  showAlbumArt = true,
  currentTrackId = null,
  upNextTrackIds = new Set()
}) {
  const mostPlayed = smartViews.mostPlayed || [];
  const recent = smartViews.recent || [];

  const nowPlayingSection = track
    ? `
      <section class="now-rail-card now-rail-hero">
        <span class="eyebrow">Now Playing</span>
        ${showAlbumArt ? (track.artworkDataUrl ? `<img class="cover-art-img" src="${escapeHtml(track.artworkDataUrl)}" alt="" />` : '<div class="cover-art" aria-hidden="true"></div>') : '<div class="cover-art hidden-art" aria-hidden="true"></div>'}
        <div class="now-rail-copy">
          <h3>${escapeHtml(track.title)}</h3>
          <p>${escapeHtml(track.artist)}</p>
          <small>${escapeHtml(track.author || track.artist)} • ${escapeHtml(track.album)}</small>
        </div>
      </section>
    `
    : `
      <section class="now-rail-empty">
        <span class="eyebrow">Now Playing</span>
        <h2>Nothing selected</h2>
        <p>Pick a track from the library to turn this rail into a listening dashboard.</p>
      </section>
    `;

  return `
    ${nowPlayingSection}

    <section class="queue-panel" aria-label="Playback queue">
      <div class="queue-head">
        <div>
          <span class="eyebrow">Queue</span>
          <h3>Up Next</h3>
        </div>
        <div class="queue-head-actions">
          <button data-action="toggle-shuffle">Shuffle: ${shuffleEnabled ? 'On' : 'Off'}</button>
          <button data-action="queue-clear">Clear Queue</button>
        </div>
      </div>
      ${upNextTracks.length ? `<ul class="queue-list">${upNextTracks.map((item, idx) => renderQueueRow(item, idx + 1, { upNextTrackIds, currentTrackId })).join('')}</ul>` : '<div class="empty small">Queue is empty.</div>'}
      ${queueTracks.length ? `<div class="queue-summary">${Math.max(queueTracks.length - 1, 0)} track(s) up next</div>` : ''}
    </section>

    <section class="now-rail-meta">
      <div class="section-head">
        <span class="eyebrow">Library Insights</span>
        <h4>Smart Views</h4>
      </div>
      <div class="smart-view-grid">
        <article>
          <strong>Recently Played</strong>
          <span>${recent.length ? escapeHtml(recent[0].title) : 'No recent tracks'}</span>
          <button data-action="open-smart-view" data-smart-view="recent">Open</button>
        </article>
        <article>
          <strong>Most Played</strong>
          <span>${mostPlayed.length ? escapeHtml(mostPlayed[0].title) : 'No play stats yet'}</span>
          <button data-action="open-smart-view" data-smart-view="most-played">Open</button>
        </article>
      </div>
      <div class="stats-grid">
        <article><strong>${totalTracks}</strong><span>Tracks</span></article>
        <article><strong>${totalPlaylists}</strong><span>Playlists</span></article>
      </div>
    </section>
  `;
}

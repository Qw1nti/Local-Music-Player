import { formatTime } from '../utils/format.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderBadge(label) {
  return `<span class="player-badge">${escapeHtml(label)}</span>`;
}

export function renderPlayerBar(model) {
  const title = escapeHtml(model.track?.title ?? 'No track selected');
  const subtitle = model.track
    ? escapeHtml(`${model.track.artist}${model.track.author && model.track.author !== model.track.artist ? ` • ${model.track.author}` : ''} • ${model.track.album}`)
    : 'Import music to begin';
  const art = model.showAlbumArt
    ? model.track?.artworkDataUrl
      ? `<img class="player-art" src="${escapeHtml(model.track.artworkDataUrl)}" alt="" />`
      : '<div class="player-art"></div>'
    : '<div class="player-art hidden-art"></div>';

  const badges = [];
  if (model.shuffleEnabled) badges.push(renderBadge('Shuffle'));
  if (model.repeatMode && model.repeatMode !== 'off') badges.push(renderBadge(`Repeat ${model.repeatMode}`));
  if (Number(model.crossfadeMs || 0) > 0) badges.push(renderBadge(`Crossfade ${Number(model.crossfadeMs)}ms`));
  if (model.gaplessPlayback) badges.push(renderBadge('Gapless'));
  if (model.replayGainMode && model.replayGainMode !== 'off') badges.push(renderBadge(`ReplayGain ${model.replayGainMode}`));

  return `
    <div class="player-now">
      <div class="player-art-frame">${art}</div>
      <div class="player-copy">
        <span class="eyebrow">Now Playing</span>
        <div class="title">${title}</div>
        <div class="subtitle">${subtitle}</div>
        <div class="player-badges" aria-live="polite">${badges.join('')}</div>
      </div>
    </div>

    <div class="player-center">
      <div class="controls">
        <button data-action="prev-track" aria-label="Previous track">⏮</button>
        <button class="primary" data-action="toggle-play" aria-label="${model.isPlaying ? 'Pause' : 'Play'}">${model.isPlaying ? '⏸' : '▶'}</button>
        <button data-action="next-track" aria-label="Next track">⏭</button>
        <button data-action="cycle-repeat" aria-label="Repeat mode">${escapeHtml(model.repeatMode)}</button>
      </div>

      <div class="timeline">
        <span id="timeCurrent">${formatTime(model.currentTime)}</span>
        <input id="seekInput" aria-label="Seek" type="range" min="0" max="${Math.max(model.duration, 1)}" step="0.1" value="${Math.min(model.currentTime, model.duration || 0)}" />
        <span id="timeDuration">${formatTime(model.duration)}</span>
      </div>
    </div>

    <div class="volume-control">
      <span class="volume-label">Volume</span>
      <input id="volumeInput" aria-label="Volume" type="range" min="0" max="1" step="0.01" value="${model.volume}" />
    </div>
  `;
}

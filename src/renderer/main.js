/**
 * Renderer entry point.
 *
 * High-level architecture:
 * - `LibraryStore` holds UI + playback state and persists through preload IPC.
 * - `AudioPlayer` wraps a single `HTMLAudioElement` instance.
 * - Render is string-based for simplicity; the playback timeline is updated in-place to
 *   avoid full UI re-renders during `timeupdate` events.
 */
import { renderShell } from './components/layout.js';
import { renderLibraryView } from './components/library-view.js';
import { renderPlaylistList, renderPlaylistsView } from './components/playlists-view.js';
import { renderPlayerBar } from './components/player-bar.js';
import { renderNowPlayingRail } from './components/now-playing-rail.js';
import { AudioPlayer } from './services/audio-player.js';
import { LibraryStore } from './store/library-store.js';
import { formatTime } from './utils/format.js';
import { SettingsManager } from './settings/settings-manager.js';
import { applyImportedSettings, mergePlaylists } from './services/data-transfer-client.js';
import { buildImportSummary, resolveDuplicateMode } from './services/import-ux-service.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fatalRendererError(message) {
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = `<div class="prefs-fatal" role="alert">\n      <h2>Startup Error</h2>\n      <div>${escapeHtml(message)}</div>\n      <div class="fatal-detail">The preload API (window.musicApi) is unavailable.</div>\n    </div>`;
  }
}

if (!window.musicApi) {
  fatalRendererError('This app failed to initialize. Please reinstall/relaunch the app bundle.');
  // Stop module evaluation early to avoid cryptic runtime errors.
  throw new Error('window.musicApi is undefined');
}

const store = new LibraryStore();
const player = new AudioPlayer();
const settingsManager = new SettingsManager(window.musicApi);

let currentSettings = null;

let statusMessage = '';
let errorMessage = '';
let currentTime = 0;
let duration = 0;
let saveTimer = null;
let lastLoadedTrackId = null;
let persistEnabled = false;
let renamePlaylistState = {
  editingPlaylistId: null,
  draft: ''
};
let pendingRenameInputFocusForId = null;
let pendingQueueDragIndex = null;
let positionPersistTimer = null;
let activeSmartView = null;
let selectedTrackIds = new Set();
let unbindWatchUpdates = null;
let unbindScanProgress = null;
let undoToast = {
  message: '',
  expiresAt: 0,
  undo: null,
  timer: null
};
let scanProgressState = null;
let duplicateModalState = {
  open: false,
  total: 0,
  duplicates: 0,
  defaultMode: 'skip',
  allowRemember: true,
  resolve: null
};
let pendingSeamlessSwitch = false;
let rememberedDuplicateMode = null;
let lastDuplicateStats = null;
let importSummary = null;
let issuesModalState = {
  open: false,
  title: '',
  issues: []
};
let pendingQueueFocusIndex = null;

const playerDom = {
  seekInput: null,
  volumeInput: null,
  timeCurrent: null,
  timeDuration: null
};

function syncPlayerDomRefs() {
  // Re-query if the player bar was re-rendered.
  if (!playerDom.seekInput || !document.body.contains(playerDom.seekInput)) {
    playerDom.seekInput = document.getElementById('seekInput');
  }
  if (!playerDom.volumeInput || !document.body.contains(playerDom.volumeInput)) {
    playerDom.volumeInput = document.getElementById('volumeInput');
  }
  if (!playerDom.timeCurrent || !document.body.contains(playerDom.timeCurrent)) {
    playerDom.timeCurrent = document.getElementById('timeCurrent');
  }
  if (!playerDom.timeDuration || !document.body.contains(playerDom.timeDuration)) {
    playerDom.timeDuration = document.getElementById('timeDuration');
  }
}

function renderTimelineUI() {
  syncPlayerDomRefs();
  if (playerDom.seekInput) {
    const max = Math.max(duration || 0, 1);
    playerDom.seekInput.max = String(max);
    playerDom.seekInput.value = String(Math.min(currentTime, max));
  }
  if (playerDom.timeCurrent) {
    playerDom.timeCurrent.textContent = formatTime(currentTime);
  }
  if (playerDom.timeDuration) {
    playerDom.timeDuration.textContent = formatTime(duration);
  }
}

function isShowMissingTracksEnabled() {
  return currentSettings?.library?.showMissingTracks !== false;
}

function isShowAlbumArtEnabled() {
  return currentSettings?.appearance?.showAlbumArt !== false;
}

function isDebugLoggingEnabled() {
  return Boolean(currentSettings?.advanced?.debugLogging);
}

function getPlaybackOptions() {
  return {
    crossfadeMs: Math.max(0, Number(currentSettings?.playback?.crossfadeMs || 0)),
    gaplessPlayback: Boolean(currentSettings?.playback?.gaplessPlayback),
    replayGainMode: currentSettings?.playback?.replayGain || 'off'
  };
}

function replayGainMultiplierForTrack(track) {
  if (!track) return 1;
  const replayMode = getPlaybackOptions().replayGainMode;
  if (replayMode === 'off') return 1;
  const gainDb = replayMode === 'album' ? Number(track.replayGainAlbumDb) : Number(track.replayGainTrackDb);
  if (!Number.isFinite(gainDb)) return 1;
  const multiplier = 10 ** (gainDb / 20);
  return Number.isFinite(multiplier) ? Math.min(Math.max(multiplier, 0.05), 2.5) : 1;
}

function setScanProgress(next) {
  scanProgressState = next;
  render();
}

function clearScanProgress() {
  scanProgressState = null;
  render();
}

function openDuplicateModeModal({ total = 0, duplicates = 0 } = {}) {
  if (duplicateModalState.open) {
    return Promise.resolve({ mode: rememberedDuplicateMode || 'skip', remember: false });
  }

  return new Promise((resolve) => {
    duplicateModalState = {
      open: true,
      total,
      duplicates,
      defaultMode: rememberedDuplicateMode || 'skip',
      allowRemember: true,
      resolve
    };
    render();
  });
}

function resolveDuplicateModalChoice(mode, remember = false) {
  if (!duplicateModalState.open) return;
  const resolver = duplicateModalState.resolve;
  if (remember && mode && mode !== 'cancel') {
    rememberedDuplicateMode = mode;
  }
  duplicateModalState = {
    open: false,
    total: 0,
    duplicates: 0,
    defaultMode: 'skip',
    allowRemember: true,
    resolve: null
  };
  render();
  resolver?.({ mode, remember });
}

function openIssuesModal(title, issues = []) {
  issuesModalState = {
    open: true,
    title: String(title || 'Import Issues'),
    issues: Array.isArray(issues) ? issues : []
  };
  render();
}

function closeIssuesModal() {
  issuesModalState = { open: false, title: '', issues: [] };
  render();
}

function clearImportSummary() {
  importSummary = null;
}

function setImportSummary(summary) {
  importSummary = summary;
}

function setStatus(message) {
  statusMessage = message;
  errorMessage = '';
  render();
}

function setError(message) {
  errorMessage = message;
  statusMessage = '';
  render();
}

function clearMessages() {
  statusMessage = '';
  errorMessage = '';
}

function clearSelection() {
  selectedTrackIds = new Set();
}

function getPlaylistById(playlistId) {
  if (!playlistId) return null;
  return store.getState().playlists.find((playlist) => playlist.id === playlistId) || null;
}

function startPlaylistRename(playlistId) {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return;

  renamePlaylistState = {
    editingPlaylistId: playlist.id,
    draft: playlist.name
  };
  pendingRenameInputFocusForId = playlist.id;
  clearMessages();
  render();
}

function cancelPlaylistRename() {
  renamePlaylistState = {
    editingPlaylistId: null,
    draft: ''
  };
  pendingRenameInputFocusForId = null;
  render();
}

function updatePlaylistRenameDraft(nextValue) {
  if (!renamePlaylistState.editingPlaylistId) return;
  renamePlaylistState = {
    ...renamePlaylistState,
    draft: String(nextValue || '')
  };
}

function commitPlaylistRename() {
  const playlistId = renamePlaylistState.editingPlaylistId;
  if (!playlistId) return;

  const playlist = getPlaylistById(playlistId);
  if (!playlist) {
    cancelPlaylistRename();
    return;
  }

  const trimmed = renamePlaylistState.draft.trim();
  if (!trimmed) {
    setError('Playlist name cannot be empty.');
    pendingRenameInputFocusForId = playlistId;
    render();
    return;
  }

  if (trimmed !== playlist.name) {
    store.renamePlaylist(playlistId, trimmed);
    setStatus('Playlist renamed.');
  }

  renamePlaylistState = {
    editingPlaylistId: null,
    draft: ''
  };

  render();
}

function showUndoToast(message, undoFn, timeoutMs = 6000) {
  if (undoToast.timer) clearTimeout(undoToast.timer);
  undoToast = {
    message: String(message || ''),
    expiresAt: Date.now() + timeoutMs,
    undo: typeof undoFn === 'function' ? undoFn : null,
    timer: setTimeout(() => {
      undoToast = { message: '', expiresAt: 0, undo: null, timer: null };
      render();
    }, timeoutMs)
  };
  render();
}

function triggerUndoIfAvailable() {
  const undo = undoToast.undo;
  if (!undo) return;
  if (undoToast.timer) clearTimeout(undoToast.timer);
  undoToast = { message: '', expiresAt: 0, undo: null, timer: null };
  undo();
}

function getQueueTracks() {
  const state = store.getState();
  const byId = new Map(state.tracks.map((track) => [track.id, track]));
  return state.playback.queueTrackIds.map((id) => byId.get(id)).filter(Boolean);
}

function getPlaybackSnapshot() {
  const playback = store.getState().playback;
  return {
    queueTrackIds: [...playback.queueTrackIds],
    queueIndex: playback.queueIndex,
    currentTrackId: playback.currentTrackId,
    isPlaying: playback.isPlaying
  };
}

function saveCurrentTrackPosition() {
  const current = getCurrentTrack();
  if (!current) return;
  store.setTrackPosition(current.id, currentTime, false);
}

function maybePersistTrackPosition() {
  if (positionPersistTimer) return;
  positionPersistTimer = setTimeout(() => {
    positionPersistTimer = null;
    saveCurrentTrackPosition();
  }, 1000);
}

function debouncePersist() {
  if (!persistEnabled) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.musicApi.saveLibraryState(store.exportPersistedState()).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to save library state.';
      setError(message);
    });
  }, 200);
}

function getCurrentTrack() {
  const state = store.getState();
  if (!state.playback.currentTrackId) return null;
  return state.tracks.find((track) => track.id === state.playback.currentTrackId) || null;
}

function getTrackMap() {
  const state = store.getState();
  return new Map(state.tracks.map((track) => [track.id, track]));
}

function buildQueueFromCurrentView() {
  const state = store.getState();
  const includeMissing = isShowMissingTracksEnabled();
  const visibleTrackIds = new Set(state.tracks.filter((track) => includeMissing || !track.missing).map((track) => track.id));
  if (state.view === 'playlists') {
    const playlist = store.getActivePlaylist();
    if (playlist) {
      return playlist.trackIds.filter((id) => visibleTrackIds.has(id));
    }
  }
  return store
    .getLibraryFlatTracks()
    .filter((track) => includeMissing || !track.missing)
    .map((track) => track.id);
}

async function startPlayback(trackId, queueTrackIds) {
  const state = store.getState();
  const track = state.tracks.find((entry) => entry.id === trackId);

  if (!track || track.missing) {
    setError('Track is missing on disk. Re-import your library.');
    return;
  }

  const playbackOptions = getPlaybackOptions();
  const nextTrackGain = replayGainMultiplierForTrack(track);
  const shouldTransition =
    lastLoadedTrackId &&
    lastLoadedTrackId !== trackId &&
    player.isPlaying &&
    (playbackOptions.crossfadeMs > 0 || playbackOptions.gaplessPlayback);

  if (shouldTransition) {
    const transitionMs = playbackOptions.crossfadeMs > 0 ? playbackOptions.crossfadeMs : playbackOptions.gaplessPlayback ? 80 : 0;
    await player.transitionTo(track.path, {
      startAt: 0,
      transitionMs,
      nextGain: nextTrackGain
    });
    currentTime = 0;
    duration = track.durationSec;
    lastLoadedTrackId = trackId;
  } else if (lastLoadedTrackId !== trackId) {
    await player.load(track.path);
    player.setTrackGain(nextTrackGain);
    lastLoadedTrackId = trackId;
    const resumeAt = store.getTrackPosition(trackId);
    currentTime = Math.max(0, Number(resumeAt || 0));
    duration = track.durationSec;
    if (currentTime > 0) {
      player.seek(currentTime);
    }
  } else {
    player.setTrackGain(nextTrackGain);
  }

  store.setQueueAndCurrent(queueTrackIds, trackId);

  try {
    if (!shouldTransition) {
      await player.play();
    }
    store.recordTrackPlayed(trackId);
    clearMessages();
  } catch {
    setError('Playback was blocked or failed to start.');
  }
}

async function togglePlay() {
  const state = store.getState();

  if (!state.playback.currentTrackId) {
    const queue = buildQueueFromCurrentView();
    if (!queue.length) {
      setError('No tracks available to play.');
      return;
    }
    await startPlayback(queue[0], queue);
    return;
  }

  if (player.isPlaying) {
    player.pause();
    return;
  }

  try {
    await player.play();
  } catch {
    setError('Playback could not resume.');
  }
}

async function playByQueueOffset(offset) {
  const state = store.getState();
  const { queueTrackIds, queueIndex, repeatMode } = state.playback;

  if (!queueTrackIds.length) return;

  if (repeatMode === 'one' && offset > 0) {
    const current = getCurrentTrack();
    if (current) await startPlayback(current.id, queueTrackIds);
    return;
  }

  let nextIndex = queueIndex + offset;

  if (nextIndex >= queueTrackIds.length) {
    const endBehavior = currentSettings?.playback?.endOfQueueBehavior || 'stop';
    if (state.playback.shuffleEnabled && queueTrackIds.length > 1) {
      store.toggleShuffleFrom(queueTrackIds, null);
      nextIndex = 0;
    } else if (repeatMode === 'all' || endBehavior === 'repeat-all') {
      nextIndex = 0;
    } else {
      player.pause();
      store.setPlaying(false);
      return;
    }
  }

  if (nextIndex < 0) {
    nextIndex = repeatMode === 'all' ? queueTrackIds.length - 1 : 0;
  }

  const nextId = queueTrackIds[nextIndex];
  if (nextId) await startPlayback(nextId, queueTrackIds);
}

function maybeTriggerSeamlessTransition() {
  if (pendingSeamlessSwitch) return;
  const current = getCurrentTrack();
  if (!current) return;
  const { crossfadeMs, gaplessPlayback } = getPlaybackOptions();
  if (!crossfadeMs && !gaplessPlayback) return;

  const remaining = Math.max(0, Number(duration || 0) - Number(currentTime || 0));
  const thresholdSec = crossfadeMs > 0 ? Math.max(0.15, crossfadeMs / 1000) : gaplessPlayback ? 0.14 : 0;
  if (thresholdSec <= 0 || remaining > thresholdSec) return;

  pendingSeamlessSwitch = true;
  void playByQueueOffset(1).finally(() => {
    pendingSeamlessSwitch = false;
  });
}

function cycleRepeatMode() {
  const current = store.getState().playback.repeatMode;
  const next = current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
  store.setRepeatMode(next);
}

function toggleShuffleMode() {
  const queue = buildQueueFromCurrentView();
  const currentTrackId = store.getState().playback.currentTrackId || queue[0] || null;
  store.toggleShuffleFrom(queue, currentTrackId);
}

function openSmartView(view) {
  activeSmartView = view === 'recent' || view === 'most-played' ? view : null;
  if (!activeSmartView) return;

  store.setView('library');
  const label = activeSmartView === 'recent' ? 'Recently Played' : 'Most Played';
  setStatus(`Showing ${label}. Clear filters to return.`);
}

function mergeDuplicateTrack(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    title: incoming.title || existing.title,
    artist: incoming.artist || existing.artist,
    album: incoming.album || existing.album,
    genre: incoming.genre || existing.genre,
    artworkDataUrl: incoming.artworkDataUrl || existing.artworkDataUrl
  };
}

function applyDuplicateMode(scanTracks, mode) {
  const existingTracks = store.getState().tracks;
  const currentById = new Map(existingTracks.map((track) => [track.id, track]));
  const deduped = [];
  const counts = {
    added: 0,
    merged: 0,
    skipped: 0
  };

  for (const track of scanTracks) {
    const existing =
      currentById.get(track.id) ||
      existingTracks.find((entry) => entry.path === track.path || (entry.contentHash && track.contentHash && entry.contentHash === track.contentHash));
    if (!existing) {
      deduped.push(track);
      counts.added += 1;
      continue;
    }

    if (mode === 'keep') {
      deduped.push({ ...track, id: `${track.id}::dup::${Date.now()}::${Math.random().toString(16).slice(2, 6)}` });
      counts.added += 1;
      continue;
    }

    if (mode === 'merge') {
      deduped.push(mergeDuplicateTrack(existing, track));
      counts.merged += 1;
      continue;
    }
    counts.skipped += 1;
  }

  return { tracks: deduped, counts };
}

async function runScanWithProgress(paths, includeHash = true) {
  const scanId = `scan-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  setScanProgress({
    scanId,
    phase: 'start',
    discoveredCount: 0,
    processedCount: 0,
    errorCount: 0,
    totalDiscovered: 0,
    canceled: false
  });

  try {
    const scan = await window.musicApi.scanPaths(paths, { includeHash, scanId });
    return { ...scan, scanId };
  } finally {
    clearScanProgress();
  }
}

async function importFiles() {
  clearMessages();
  clearImportSummary();
  const result = await window.musicApi.pickAudioFiles();
  if (!result.paths.length) return;

  const scan = await runScanWithProgress(result.paths, true);
  if (scan.canceled) {
    setStatus('Import canceled.');
    return;
  }

  const existingTracks = store.getState().tracks;
  const existingByPath = new Set(existingTracks.map((track) => track.path));
  const existingByHash = new Set(existingTracks.map((track) => track.contentHash).filter(Boolean));
  const duplicateCount = scan.tracks.filter(
    (track) => existingByPath.has(track.path) || (track.contentHash && existingByHash.has(track.contentHash))
  ).length;

  let mode = 'skip';
  if (duplicateCount > 0) {
    if (rememberedDuplicateMode) {
      mode = rememberedDuplicateMode;
    } else {
      const selected = await openDuplicateModeModal({ total: scan.tracks.length, duplicates: duplicateCount });
      const resolvedMode = resolveDuplicateMode({
        rememberedMode: rememberedDuplicateMode,
        selectedMode: selected?.mode,
        rememberChoice: selected?.remember
      });
      mode = resolvedMode.mode;
      rememberedDuplicateMode = resolvedMode.rememberedMode;
    }
  }
  lastDuplicateStats = { total: scan.tracks.length, duplicates: duplicateCount };
  if (mode === 'cancel') {
    setStatus('Import canceled.');
    return;
  }
  const resolved = applyDuplicateMode(scan.tracks, mode);
  store.mergeTracks(resolved.tracks);
  const summary = buildImportSummary('Files', resolved.counts, scan.errors);
  setImportSummary(summary);

  if (scan.errors.length) {
    setError(`Imported ${resolved.tracks.length} tracks with ${scan.errors.length} issue(s).`);
  } else {
    setStatus(`Imported ${resolved.tracks.length} tracks.`);
  }
}

async function importFolder() {
  clearMessages();
  clearImportSummary();
  const result = await window.musicApi.pickAudioFolder();
  if (!result.path) return;

  const scan = await runScanWithProgress([result.path], true);
  if (scan.canceled) {
    setStatus('Import canceled.');
    return;
  }

  const existingTracks = store.getState().tracks;
  const existingByPath = new Set(existingTracks.map((track) => track.path));
  const existingByHash = new Set(existingTracks.map((track) => track.contentHash).filter(Boolean));
  const duplicateCount = scan.tracks.filter(
    (track) => existingByPath.has(track.path) || (track.contentHash && existingByHash.has(track.contentHash))
  ).length;
  let mode = 'skip';
  if (duplicateCount > 0) {
    if (rememberedDuplicateMode) {
      mode = rememberedDuplicateMode;
    } else {
      const selected = await openDuplicateModeModal({ total: scan.tracks.length, duplicates: duplicateCount });
      const resolvedMode = resolveDuplicateMode({
        rememberedMode: rememberedDuplicateMode,
        selectedMode: selected?.mode,
        rememberChoice: selected?.remember
      });
      mode = resolvedMode.mode;
      rememberedDuplicateMode = resolvedMode.rememberedMode;
    }
  }
  lastDuplicateStats = { total: scan.tracks.length, duplicates: duplicateCount };
  if (mode === 'cancel') {
    setStatus('Import canceled.');
    return;
  }
  const resolved = applyDuplicateMode(scan.tracks, mode);
  store.mergeTracks(resolved.tracks);
  const summary = buildImportSummary('Folder', resolved.counts, scan.errors);
  setImportSummary(summary);

  const watched = new Set(store.getState().watchedFolders || []);
  watched.add(result.path);
  store.setWatchedFolders([...watched]);
  void window.musicApi.watchLibraryFolder(result.path).catch(() => {});

  if (scan.errors.length) {
    setError(`Imported ${resolved.tracks.length} tracks with ${scan.errors.length} issue(s).`);
  } else {
    setStatus(`Imported ${resolved.tracks.length} tracks from folder.`);
  }
}

async function exportUserData() {
  const payload = {
    playlists: store.getState().playlists,
    settings: settingsManager.get()
  };
  const result = await window.musicApi.exportData(payload);
  if (result?.canceled) return;
  setStatus(`Exported data to ${result.filePath}`);
}

async function importUserData() {
  const result = await window.musicApi.importData();
  if (!result || result.canceled) return;

  const data = result.data || {};
  if (Array.isArray(data.playlists)) {
    const merged = mergePlaylists(store.getState().playlists, data.playlists);
    for (const playlist of merged) {
      store.restorePlaylistSnapshot(playlist, false);
    }
  }

  if (data.settings && typeof data.settings === 'object') {
    await applyImportedSettings(settingsManager, data.settings);
  }

  setStatus(`Imported data from ${result.filePath}`);
}

function ensureActivePlaylist() {
  const active = store.getState().activePlaylistId;
  if (active) return active;
  store.createPlaylist('New Playlist');
  return store.getState().activePlaylistId || null;
}

function bindEvents() {
  const root = document.getElementById('app');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'cancelScanBtn') {
      const scanId = scanProgressState?.scanId;
      if (scanId) void window.musicApi.cancelScan(scanId);
      return;
    }

    const duplicateMode = target.getAttribute('data-duplicate-mode');
    if (duplicateMode) {
      const remember = Boolean(document.getElementById('duplicateRememberChoice')?.checked);
      resolveDuplicateModalChoice(duplicateMode, remember);
      return;
    }

    if (target.id === 'duplicateCancelBtn') {
      resolveDuplicateModalChoice('cancel');
      return;
    }

    if (target.id === 'duplicateRememberChoice') {
      return;
    }

    if (target.id === 'toggleAdvancedFiltersBtn') {
      store.toggleLibraryAdvancedCollapsed();
      return;
    }

    if (target.id === 'viewImportIssuesBtn') {
      if (importSummary?.errors?.length) {
        openIssuesModal('Import Issues', importSummary.errors);
      }
      return;
    }

    if (target.id === 'clearImportSummaryBtn') {
      clearImportSummary();
      render();
      return;
    }

    if (target.id === 'changeDuplicateModeBtn') {
      const duplicateInfo = lastDuplicateStats || { total: 0, duplicates: 0 };
      void openDuplicateModeModal(duplicateInfo).then((selected) => {
        const resolved = resolveDuplicateMode({
          rememberedMode: rememberedDuplicateMode,
          selectedMode: selected?.mode,
          rememberChoice: true
        });
        const mode = resolved.mode;
        if (mode !== 'cancel') {
          rememberedDuplicateMode = resolved.rememberedMode;
          setStatus(`Duplicate strategy set to \"${mode}\" for this session.`);
        }
      });
      return;
    }

    if (target.id === 'closeIssuesModalBtn' || target.id === 'appModal') {
      if (issuesModalState.open) closeIssuesModal();
      return;
    }

    const viewTarget = target.closest('[data-view]');
    const view = viewTarget?.getAttribute('data-view');
    if (view === 'library' || view === 'playlists') {
      clearSelection();
      store.setView(view);
      return;
    }

    if (target.id === 'importFilesBtn') {
      void importFiles();
      return;
    }

    if (target.id === 'openPreferencesBtn') {
      void window.musicApi.openPreferences();
      return;
    }

    if (target.id === 'importFolderBtn') {
      void importFolder();
      return;
    }

    if (target.id === 'exportDataBtn') {
      void exportUserData();
      return;
    }

    if (target.id === 'importDataBtn') {
      void importUserData();
      return;
    }

    if (target.id === 'createPlaylistBtn') {
      const nextName = window.prompt('Playlist name', `Playlist ${store.getState().playlists.length + 1}`);
      if (nextName) store.createPlaylist(nextName);
      return;
    }

    if (target.id === 'deletePlaylistBtn') {
      const playlist = store.getActivePlaylist();
      if (!playlist) return;
      if (window.confirm(`Delete playlist "${playlist.name}"?`)) {
        const snapshot = { ...playlist, trackIds: [...playlist.trackIds] };
        store.deletePlaylist(playlist.id);
        showUndoToast(`Deleted playlist "${playlist.name}"`, () => {
          store.restorePlaylistSnapshot(snapshot, true);
        });
      }
      return;
    }

    const actionTarget = target.closest('[data-action]');
    const action = actionTarget?.getAttribute('data-action');
    if (!action) return;

    if (action === 'onboard-import-folder') {
      void importFolder();
      return;
    }

    if (action === 'onboard-import-files') {
      void importFiles();
      return;
    }

    if (action === 'onboard-create-playlist') {
      const nextName = window.prompt('Playlist name', `Playlist ${store.getState().playlists.length + 1}`);
      if (nextName) store.createPlaylist(nextName);
      return;
    }

    if (action === 'play-track' || action === 'play-track-from-playlist') {
      const trackId = actionTarget?.getAttribute('data-track-id');
      if (!trackId) return;
      const queue = action === 'play-track' ? store.getLibraryFlatTracks().map((track) => track.id) : buildQueueFromCurrentView();
      void startPlayback(trackId, queue);
      return;
    }

    if (action === 'add-track-active-playlist') {
      const trackId = actionTarget?.getAttribute('data-track-id');
      if (!trackId) return;
      const playlistId = ensureActivePlaylist();
      if (!playlistId) return;
      store.addTrackToPlaylist(playlistId, trackId);
      setStatus('Track added to playlist.');
      return;
    }

    if (action === 'select-playlist') {
      if (renamePlaylistState.editingPlaylistId) return;
      const playlistId = actionTarget?.getAttribute('data-playlist-id');
      store.setActivePlaylist(playlistId);
      store.setView('playlists');
      return;
    }

    if (action === 'start-rename-playlist') {
      const playlistId = actionTarget?.getAttribute('data-playlist-id');
      if (playlistId) startPlaylistRename(playlistId);
      return;
    }

    if (action === 'playlist-track-remove') {
      const playlist = store.getActivePlaylist();
      const trackId = actionTarget?.getAttribute('data-track-id');
      if (playlist && trackId) {
        const previousIndex = playlist.trackIds.indexOf(trackId);
        store.removeTrackFromPlaylist(playlist.id, trackId);
        showUndoToast('Removed track from playlist', () => {
          const latest = store.getActivePlaylist();
          if (!latest || latest.id !== playlist.id) return;
          const nextIds = [...latest.trackIds];
          const idx = previousIndex >= 0 ? Math.min(previousIndex, nextIds.length) : nextIds.length;
          nextIds.splice(idx, 0, trackId);
          store.restorePlaylistSnapshot({ ...latest, trackIds: nextIds, updatedAt: Date.now() }, true);
        });
      }
      return;
    }

    if (action === 'playlist-track-up' || action === 'playlist-track-down') {
      const playlist = store.getActivePlaylist();
      const rawIndex = actionTarget?.getAttribute('data-track-index');
      if (!playlist || rawIndex === null) return;
      const index = Number(rawIndex);
      store.moveTrackInPlaylist(playlist.id, index, action === 'playlist-track-up' ? index - 1 : index + 1);
      return;
    }

    if (action === 'toggle-play') {
      void togglePlay();
      return;
    }

    if (action === 'next-track') {
      void playByQueueOffset(1);
      return;
    }

    if (action === 'prev-track') {
      void playByQueueOffset(-1);
      return;
    }

    if (action === 'cycle-repeat') {
      cycleRepeatMode();
      return;
    }

    if (action === 'toggle-library-group') {
      const groupKey = actionTarget?.getAttribute('data-group-key');
      if (groupKey) store.toggleLibraryGroupExpanded(groupKey);
      return;
    }

    if (action === 'toggle-shuffle') {
      toggleShuffleMode();
      return;
    }

    if (action === 'queue-clear') {
      const before = getPlaybackSnapshot();
      store.clearQueue();
      player.pause();
      showUndoToast('Cleared queue', () => {
        store.restorePlaybackSnapshot(before);
      });
      pendingQueueFocusIndex = 1;
      return;
    }

    if (action === 'queue-remove') {
      const trackId = actionTarget?.getAttribute('data-track-id');
      if (!trackId) return;
      const before = getPlaybackSnapshot();
      store.removeQueueItem(trackId);
      showUndoToast('Removed track from queue', () => {
        store.restorePlaybackSnapshot(before);
      });
      pendingQueueFocusIndex = Number(actionTarget?.getAttribute('data-queue-index') || 1);
      return;
    }

    if (action === 'queue-move-up' || action === 'queue-move-down') {
      const rawIndex = actionTarget?.getAttribute('data-queue-index');
      const from = Number(rawIndex);
      if (!Number.isInteger(from)) return;
      const to = action === 'queue-move-up' ? from - 1 : from + 1;
      store.moveQueueItem(from, to);
      setStatus('Queue order updated.');
      pendingQueueFocusIndex = Math.max(1, to);
      return;
    }

    if (action === 'open-smart-view') {
      const view = actionTarget?.getAttribute('data-smart-view');
      if (view) openSmartView(view);
      return;
    }

    if (action === 'undo-last-action') {
      triggerUndoIfAvailable();
      return;
    }

    if (action === 'toggle-track-selected') {
      const trackId = actionTarget?.getAttribute('data-track-id');
      if (!trackId) return;
      if (selectedTrackIds.has(trackId)) selectedTrackIds.delete(trackId);
      else selectedTrackIds.add(trackId);
      render();
      return;
    }

    if (action === 'bulk-add-selected') {
      const playlistId = ensureActivePlaylist();
      if (!playlistId) return;
      store.bulkAddTracksToPlaylist(playlistId, [...selectedTrackIds]);
      setStatus(`Added ${selectedTrackIds.size} selected track(s) to playlist.`);
      clearSelection();
      return;
    }

    if (action === 'bulk-remove-selected') {
      const playlist = store.getActivePlaylist();
      if (!playlist || !selectedTrackIds.size) return;
      const removed = [...selectedTrackIds].filter((id) => playlist.trackIds.includes(id));
      if (!removed.length) return;
      store.bulkRemoveTracksFromPlaylist(playlist.id, removed);
      showUndoToast(`Removed ${removed.length} track(s) from playlist`, () => {
        const latest = store.getActivePlaylist();
        if (!latest || latest.id !== playlist.id) return;
        const restored = [...latest.trackIds];
        for (const id of removed) {
          if (!restored.includes(id)) restored.push(id);
        }
        store.restorePlaylistSnapshot({ ...latest, trackIds: restored, updatedAt: Date.now() }, true);
      });
      clearSelection();
      return;
    }

    if (action === 'clear-track-selection') {
      clearSelection();
      render();
      return;
    }

    if (target.id === 'clearLibraryFiltersBtn') {
      activeSmartView = null;
      store.clearLibraryFilters();
      clearSelection();
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'librarySearchInput' && target instanceof HTMLInputElement) {
      activeSmartView = null;
      store.setLibrarySearch(target.value);
      return;
    }

    if (target.matches('[data-playlist-rename-input]') && target instanceof HTMLInputElement) {
      updatePlaylistRenameDraft(target.value);
      return;
    }

    if (target.id === 'seekInput' && target instanceof HTMLInputElement) {
      const value = Number(target.value);
      player.seek(value);
      currentTime = value;
      renderTimelineUI();
      return;
    }

    if (target.id === 'volumeInput' && target instanceof HTMLInputElement) {
      const volume = Number(target.value);
      player.setVolume(volume);
      store.setPlaybackVolume(volume);
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === 'libraryFilterArtist' && target instanceof HTMLSelectElement) {
      activeSmartView = null;
      store.setLibraryFilter('artist', target.value);
      return;
    }

    if (target.id === 'libraryFilterPlaylist' && target instanceof HTMLSelectElement) {
      activeSmartView = null;
      store.setLibraryFilter('playlist', target.value);
      return;
    }

    if (target.id === 'libraryFilterGenre' && target instanceof HTMLSelectElement) {
      activeSmartView = null;
      store.setLibraryFilter('genre', target.value);
      return;
    }

    if (target.id === 'libraryFilterDuration' && target instanceof HTMLSelectElement) {
      activeSmartView = null;
      store.setLibraryFilter('durationRange', target.value);
      return;
    }

    if (target.id === 'librarySortMode' && target instanceof HTMLSelectElement) {
      activeSmartView = null;
      store.setLibrarySort(target.value);
      return;
    }

    if (target.id === 'libraryGroupMode' && target instanceof HTMLSelectElement) {
      activeSmartView = null;
      store.setLibraryGroupMode(target.value);
    }
  });

  root.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('[data-playlist-rename-input]')) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      commitPlaylistRename();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelPlaylistRename();
    }
  });

  root.addEventListener(
    'focusout',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('[data-playlist-rename-input]')) return;
      if (!renamePlaylistState.editingPlaylistId) return;

      // Commit when user clicks away from rename input.
      commitPlaylistRename();
    },
    true
  );

  root.addEventListener('dragstart', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const actionTarget = target.closest('[data-action="queue-drag-start"]');
    if (!actionTarget) return;

    const index = Number(actionTarget.getAttribute('data-queue-index'));
    if (!Number.isInteger(index)) return;
    pendingQueueDragIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
    event.dataTransfer?.setDragImage?.(actionTarget, 16, 16);
  });

  root.addEventListener('dragover', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest('[data-action="queue-drag-start"]');
    if (!row) return;
    event.preventDefault();
  });

  root.addEventListener('drop', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest('[data-action="queue-drag-start"]');
    if (!row) return;
    event.preventDefault();

    const to = Number(row.getAttribute('data-queue-index'));
    const from = pendingQueueDragIndex;
    pendingQueueDragIndex = null;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    store.moveQueueItem(from, to);
    setStatus('Queue order updated.');
    pendingQueueFocusIndex = to;
  });

  document.addEventListener('keydown', (event) => {
    if (duplicateModalState.open || issuesModalState.open) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (duplicateModalState.open) resolveDuplicateModalChoice('cancel');
        if (issuesModalState.open) closeIssuesModal();
        return;
      }
      if (event.key === 'Tab') {
        const modal = document.querySelector('.modal-card');
        if (!modal) return;
        const focusables = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex=\"-1\"])')].filter(
          (el) => el instanceof HTMLElement && !el.hasAttribute('disabled')
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }
        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }

    const target = event.target;
    const isInputLike =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (isInputLike) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.getElementById('librarySearchInput')?.focus();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === ',') {
      event.preventDefault();
      void window.musicApi.openPreferences();
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      void togglePlay();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      void playByQueueOffset(1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      void playByQueueOffset(-1);
      return;
    }

    if (target instanceof HTMLElement && target.matches('[data-queue-row]')) {
      const index = Number(target.getAttribute('data-queue-row'));
      if (!Number.isInteger(index)) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        store.moveQueueItem(index, index - 1);
        pendingQueueFocusIndex = Math.max(1, index - 1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        store.moveQueueItem(index, index + 1);
        pendingQueueFocusIndex = index + 1;
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        const rowTrack = store.getUpNextTrackIds()[index - 1];
        if (rowTrack) {
          const before = getPlaybackSnapshot();
          store.removeQueueItem(rowTrack);
          showUndoToast('Removed track from queue', () => store.restorePlaybackSnapshot(before));
          pendingQueueFocusIndex = Math.max(1, index - 1);
        }
      }
    }
  });
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!app.dataset.initialized) {
    app.innerHTML = renderShell();
    app.dataset.initialized = 'true';
  }

  const state = store.getState();
  const showMissingTracks = isShowMissingTracksEnabled();
  const showAlbumArt = isShowAlbumArtEnabled();
  let browserModel = store.getLibraryBrowserModel();
  if (!showMissingTracks) {
    browserModel = {
      ...browserModel,
      flatTracks: browserModel.flatTracks.filter((track) => !track.missing),
      resultCount: browserModel.flatTracks.filter((track) => !track.missing).length,
      grouped: { mode: 'none', groups: [] }
    };
  }
  if (activeSmartView) {
    const smartTracks = store.getSmartViewTracks(activeSmartView).filter((track) => showMissingTracks || !track.missing);
    browserModel = {
      ...browserModel,
      flatTracks: smartTracks,
      resultCount: smartTracks.length,
      activeFilters: [`Smart View: ${activeSmartView === 'recent' ? 'Recently Played' : 'Most Played'}`],
      grouped: { mode: 'none', groups: [] }
    };
  }
  const trackMap = getTrackMap();

  const playlistList = document.getElementById('playlistList');
  const libraryView = document.getElementById('libraryView');
  const playlistsView = document.getElementById('playlistsView');
  const nowPlayingRail = document.getElementById('nowPlayingRail');
  const playerBar = document.getElementById('playerBar');
  const statusBanner = document.getElementById('statusBanner');
  const errorBanner = document.getElementById('errorBanner');
  const undoToastEl = document.getElementById('undoToast');
  const scanProgressBanner = document.getElementById('scanProgressBanner');
  const importSummaryBanner = document.getElementById('importSummaryBanner');
  const modalHost = document.getElementById('appModal');

  if (!playlistList || !libraryView || !playlistsView || !nowPlayingRail || !playerBar || !statusBanner || !errorBanner || !undoToastEl || !scanProgressBanner || !importSummaryBanner || !modalHost) return;

  const upNextTrackIds = new Set(store.getUpNextTrackIds());
  const currentTrackId = state.playback.currentTrackId;
  const advancedCollapsed = state.tracks.length > 0 ? browserModel.browser?.advancedControlsCollapsed !== false : false;

  playlistList.innerHTML = renderPlaylistList(state.playlists, state.activePlaylistId, renamePlaylistState);
  libraryView.innerHTML = renderLibraryView(browserModel, {
    selectedTrackIds,
    isPlaylistsView: false,
    showAlbumArt,
    currentTrackId,
    upNextTrackIds,
    advancedCollapsed,
    showOnboarding: state.tracks.length === 0 && !browserModel.browser?.searchQuery
  });

  const filteredTrackMap = showMissingTracks ? trackMap : new Map([...trackMap.entries()].filter(([, track]) => !track?.missing));
  let activePlaylist = store.getActivePlaylist();
  if (activePlaylist && !showMissingTracks) {
    activePlaylist = {
      ...activePlaylist,
      trackIds: activePlaylist.trackIds.filter((id) => filteredTrackMap.has(id))
    };
  }
  playlistsView.innerHTML = renderPlaylistsView(activePlaylist, filteredTrackMap, renamePlaylistState, {
    selectedTrackIds,
    showAlbumArt,
    currentTrackId,
    upNextTrackIds
  });

  libraryView.classList.toggle('hidden', state.view !== 'library');
  playlistsView.classList.toggle('hidden', state.view !== 'playlists');

  app.querySelectorAll('.nav-btn[data-view]').forEach((button) => {
    if (button instanceof HTMLElement) {
      button.classList.toggle('active', button.dataset.view === state.view);
    }
  });

  nowPlayingRail.innerHTML = renderNowPlayingRail({
    track: getCurrentTrack(),
    totalTracks: showMissingTracks ? state.tracks.length : state.tracks.filter((track) => !track.missing).length,
    totalPlaylists: state.playlists.length,
    queueTracks: getQueueTracks().filter((track) => showMissingTracks || !track.missing),
    upNextTracks: store
      .getUpNextTrackIds()
      .map((id) => trackMap.get(id))
      .filter((track) => track && (showMissingTracks || !track.missing)),
    shuffleEnabled: state.playback.shuffleEnabled,
    smartViews: {
      recent: store.getSmartViewTracks('recent').filter((track) => showMissingTracks || !track.missing).slice(0, 5),
      mostPlayed: store.getSmartViewTracks('most-played').filter((track) => showMissingTracks || !track.missing).slice(0, 5)
    },
    showAlbumArt,
    currentTrackId,
    upNextTrackIds
  });

  playerBar.innerHTML = renderPlayerBar({
    track: getCurrentTrack(),
    isPlaying: state.playback.isPlaying,
    repeatMode: state.playback.repeatMode,
    volume: state.playback.volume,
    currentTime,
    duration,
    showAlbumArt,
    shuffleEnabled: state.playback.shuffleEnabled,
    crossfadeMs: getPlaybackOptions().crossfadeMs,
    gaplessPlayback: getPlaybackOptions().gaplessPlayback,
    replayGainMode: getPlaybackOptions().replayGainMode
  });
  renderTimelineUI();

  if (scanProgressState) {
    const total = Math.max(Number(scanProgressState.totalDiscovered || 0), 1);
    const processed = Math.max(0, Number(scanProgressState.processedCount || 0));
    const percent = Math.min(100, Math.round((processed / total) * 100));
    const label =
      scanProgressState.phase === 'discover'
        ? `Discovering files... ${scanProgressState.discoveredCount || 0}`
        : scanProgressState.phase === 'process'
          ? `Reading metadata... ${processed}/${scanProgressState.totalDiscovered || 0}`
          : 'Scanning library...';
    scanProgressBanner.innerHTML = `
      <div class="scan-progress">
        <strong>${escapeHtml(label)}</strong>
        <meter min="0" max="${total}" value="${Math.min(processed, total)}"></meter>
        <span>${percent}%</span>
      </div>
      <button id="cancelScanBtn">Cancel</button>
    `;
    scanProgressBanner.classList.remove('hidden');
  } else {
    scanProgressBanner.innerHTML = '';
    scanProgressBanner.classList.add('hidden');
  }

  if (importSummary) {
    importSummaryBanner.innerHTML = `
      <div class=\"import-summary\">
        <strong>Import Summary (${escapeHtml(importSummary.sourceLabel)})</strong>
        <span>Added: ${importSummary.added}</span>
        <span>Merged: ${importSummary.merged}</span>
        <span>Skipped: ${importSummary.skipped}</span>
        <span>Errors: ${importSummary.errors.length}</span>
      </div>
      <div class=\"import-summary-actions\">
        ${importSummary.errors.length ? '<button id=\"viewImportIssuesBtn\">View Issues</button>' : ''}
        ${rememberedDuplicateMode ? `<button id=\"changeDuplicateModeBtn\">Duplicate mode: ${escapeHtml(rememberedDuplicateMode)}</button>` : ''}
        <button id=\"clearImportSummaryBtn\">Dismiss</button>
      </div>
    `;
    importSummaryBanner.classList.remove('hidden');
  } else {
    importSummaryBanner.innerHTML = '';
    importSummaryBanner.classList.add('hidden');
  }

  statusBanner.textContent = statusMessage;
  statusBanner.classList.toggle('hidden', !statusMessage);
  errorBanner.textContent = errorMessage;
  errorBanner.classList.toggle('hidden', !errorMessage);

  undoToastEl.innerHTML = undoToast.message
    ? `<div class="toast-inner"><span>${escapeHtml(undoToast.message)}</span><button data-action="undo-last-action">Undo</button></div>`
    : '';
  undoToastEl.classList.toggle('hidden', !undoToast.message);

  if (duplicateModalState.open) {
    modalHost.classList.remove('hidden');
    modalHost.setAttribute('aria-hidden', 'false');
    modalHost.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="Duplicate tracks found">
        <h3>Duplicate Tracks Found</h3>
        <div>${duplicateModalState.duplicates} of ${duplicateModalState.total} tracks already exist in your library.</div>
        <div>Choose how to import duplicates:</div>
        ${
          rememberedDuplicateMode
            ? `<div class=\"modal-note\">Current remembered strategy: <strong>${escapeHtml(rememberedDuplicateMode)}</strong></div>`
            : ''
        }
        <label class=\"modal-remember\"><input id=\"duplicateRememberChoice\" type=\"checkbox\" ${rememberedDuplicateMode ? 'checked' : ''} /> Remember this choice for this session</label>
        <div class="modal-actions">
          <button id="duplicateCancelBtn">Cancel Import</button>
          <button data-duplicate-mode="skip">Skip Duplicates</button>
          <button data-duplicate-mode="merge">Merge Metadata</button>
          <button data-duplicate-mode="keep">Keep Both</button>
        </div>
      </div>
    `;
  } else if (issuesModalState.open) {
    modalHost.classList.remove('hidden');
    modalHost.setAttribute('aria-hidden', 'false');
    modalHost.innerHTML = `
      <div class=\"modal-card\" role=\"dialog\" aria-modal=\"true\" aria-label=\"${escapeHtml(issuesModalState.title)}\">
        <h3>${escapeHtml(issuesModalState.title)}</h3>
        <div class=\"issues-list\" role=\"list\">
          ${
            issuesModalState.issues.length
              ? issuesModalState.issues
                  .slice(0, 300)
                  .map((issue) => `<div role=\"listitem\"><code>${escapeHtml(issue.path || '')}</code><br /><span>${escapeHtml(issue.reason || 'Unknown issue')}</span></div>`)
                  .join('')
              : '<div>No issues to display.</div>'
          }
        </div>
        <div class=\"modal-actions\">
          <button id=\"closeIssuesModalBtn\">Close</button>
        </div>
      </div>
    `;
  } else {
    modalHost.classList.add('hidden');
    modalHost.setAttribute('aria-hidden', 'true');
    modalHost.innerHTML = '';
  }

  if (pendingRenameInputFocusForId) {
    const input = document.querySelector(`[data-playlist-rename-input][data-playlist-id="${pendingRenameInputFocusForId}"]`);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
      pendingRenameInputFocusForId = null;
    }
  }

  if (duplicateModalState.open || issuesModalState.open) {
    const modalPrimary = modalHost.querySelector('button');
    if (modalPrimary instanceof HTMLElement && !modalHost.contains(document.activeElement)) {
      modalPrimary.focus();
    }
  }

  if (pendingQueueFocusIndex !== null) {
    const nextFocus = document.querySelector(`[data-queue-row=\"${pendingQueueFocusIndex}\"]`);
    if (nextFocus instanceof HTMLElement) {
      nextFocus.focus();
    }
    pendingQueueFocusIndex = null;
  }
}

async function validateLoadedTracks(state) {
  if (!state.tracks?.length) return state;

  const scan = await window.musicApi.scanPaths(state.tracks.map((track) => track.path));
  const scannedById = new Map(scan.tracks.map((track) => [track.id, track]));

  return {
    ...state,
    tracks: state.tracks.map((track) => scannedById.get(track.id) || { ...track, missing: true })
  };
}

async function bootstrap() {
  currentSettings = await settingsManager.init();
  player.setPlaybackOptions(getPlaybackOptions());
  settingsManager.onChange((next) => {
    currentSettings = next;
    player.setPlaybackOptions(getPlaybackOptions());
    player.setTrackGain(replayGainMultiplierForTrack(getCurrentTrack()));
  });

  bindEvents();

  window.addEventListener('error', (event) => {
    const payload = isDebugLoggingEnabled()
      ? {
          message: event.message || 'Unhandled renderer error',
          file: event.filename,
          line: event.lineno,
          column: event.colno
        }
      : {
          message: event.message || 'Unhandled renderer error'
        };
    void window.musicApi.logRendererError({
      ...payload
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unknown rejection');
    void window.musicApi.logRendererError({
      message: 'Unhandled promise rejection',
      reason,
      ...(isDebugLoggingEnabled() ? { details: String(event.reason?.stack || '') } : {})
    });
  });

  player.setEvents({
    onTimeUpdate: (time) => {
      currentTime = time;
      maybePersistTrackPosition();
      maybeTriggerSeamlessTransition();
      renderTimelineUI();
    },
    onDurationChange: (nextDuration) => {
      duration = nextDuration;
      const current = getCurrentTrack();
      if (current && Number(nextDuration) > 0 && Math.abs((current.durationSec || 0) - nextDuration) > 0.5) {
        // Update only the current track; do not clear `missing` flags on unrelated tracks.
        store.updateTrack(current.id, { durationSec: nextDuration });
      }
      renderTimelineUI();
    },
    onPlayStateChange: (isPlaying) => store.setPlaying(isPlaying),
    onEnded: () => {
      const current = getCurrentTrack();
      if (current) store.clearTrackPosition(current.id);
      void playByQueueOffset(1);
    },
    onError: (message) => {
      setError(message);
      store.setPlaying(false);
    }
  });

  const loaded = await window.musicApi.loadLibraryState();
  const validated = await validateLoadedTracks(loaded);
  store.hydrate(validated);

  unbindScanProgress = window.musicApi.onLibraryScanProgress((payload) => {
    if (!payload || !scanProgressState?.scanId || payload.scanId !== scanProgressState.scanId) return;
    setScanProgress({
      ...scanProgressState,
      ...payload
    });
  });

  unbindWatchUpdates = window.musicApi.onLibraryWatchUpdate(async (payload) => {
    const changed = Array.isArray(payload?.changedPaths) ? payload.changedPaths : [];
    if (!changed.length) return;
    const scan = await window.musicApi.scanPaths(changed);
    const scannedByPath = new Map(scan.tracks.map((track) => [track.path, track]));
    const next = [];

    for (const path of changed) {
      const scanned = scannedByPath.get(path);
      if (scanned) {
        next.push(scanned);
        continue;
      }

      const existing = store.getState().tracks.find((track) => track.path === path);
      if (existing) {
        next.push({ ...existing, missing: true, modifiedMs: Date.now() });
      }
    }

    if (next.length) {
      store.mergeTracks(next);
      setStatus(`Detected ${next.length} library change(s).`);
    }
  });

  // Apply startup preferences on top of persisted library state.
  if (currentSettings?.general?.startupPage === 'playlists') {
    store.setView('playlists');
  } else {
    store.setView('library');
  }

  if (currentSettings?.general?.resumeLastSession === false) {
    // Keep library + playlists but clear playback pointers.
    store.setQueueAndCurrent([], '');
    store.setPlaying(false);
  } else if (currentSettings?.general?.rememberLastTrack === false) {
    store.setQueueAndCurrent([], '');
    store.setPlaying(false);
  }

  const initialVolume =
    currentSettings?.general?.resumeLastSession === false
      ? Number(currentSettings?.playback?.defaultVolume ?? 0.9)
      : Number(validated.playback?.volume ?? currentSettings?.playback?.defaultVolume ?? 0.9);

  player.setVolume(initialVolume);
  store.setPlaybackVolume(initialVolume);

  const current = validated.playback?.currentTrackId
    ? validated.tracks.find((track) => track.id === validated.playback.currentTrackId)
    : null;
  player.setTrackGain(replayGainMultiplierForTrack(current));

  if (currentSettings?.general?.rememberLastTrack !== false && current && !current.missing) {
    await player.load(current.path);
    lastLoadedTrackId = current.id;
    duration = current.durationSec || 0;
    const resumeAt = store.getTrackPosition(current.id);
    if (resumeAt > 0) {
      player.seek(resumeAt);
      currentTime = resumeAt;
    }
  }

  if (Array.isArray(validated.watchedFolders)) {
    for (const folder of validated.watchedFolders) {
      // eslint-disable-next-line no-await-in-loop
      await window.musicApi.watchLibraryFolder(folder).catch(() => {});
    }

    if (currentSettings?.library?.autoScanOnLaunch === true && validated.watchedFolders.length) {
      const startupScan = await runScanWithProgress(validated.watchedFolders, true).catch(() => null);
      if (startupScan?.tracks?.length) {
        store.mergeTracks(applyDuplicateMode(startupScan.tracks, 'merge').tracks);
      }
      if (startupScan?.errors?.length && isDebugLoggingEnabled()) {
        setStatus(`Startup scan completed with ${startupScan.errors.length} issue(s).`);
      }
    }
  }

  store.subscribe(() => {
    debouncePersist();
    render();
  });

  render();

  // Avoid overwriting persisted state during bootstrap (for example, if user disables session restore).
  // Normal UI interactions after startup are persisted as usual.
  setTimeout(() => {
    persistEnabled = true;
  }, 0);
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : 'Failed to initialize app.';
  setError(message);
});

window.addEventListener('beforeunload', () => {
  if (unbindWatchUpdates) unbindWatchUpdates();
  if (unbindScanProgress) unbindScanProgress();
  if (duplicateModalState.open) resolveDuplicateModalChoice('skip');
});

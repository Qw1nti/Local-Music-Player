/**
 * App state container for the renderer.
 *
 * The store:
 * - owns the authoritative in-memory state
 * - emits changes to subscribers
 * - normalizes references (playlist track IDs, active playlist, playback pointers)
 *
 * `getState()` returns the live state object. Treat it as immutable outside the store.
 */
import { createId } from '../utils/ids.js';
import { buildLibraryBrowserModel } from '../services/library-browser-service.js';

function createDefaultState() {
  return {
    version: 1,
    tracks: [],
    playlists: [],
    activePlaylistId: null,
    playback: {
      currentTrackId: null,
      queueTrackIds: [],
      queueIndex: -1,
      isPlaying: false,
      volume: 0.9,
      repeatMode: 'off',
      shuffleEnabled: false
    },
    trackPositions: {},
    trackStats: {},
    recentlyPlayedIds: [],
    watchedFolders: [],
    libraryBrowser: {
      searchQuery: '',
      filters: {
        artist: 'all',
        playlist: 'all',
        genre: 'all',
        durationRange: 'all'
      },
      sortMode: 'title-asc',
      groupMode: 'none',
      advancedControlsCollapsed: true,
      expandedGroups: {}
    },
    view: 'library'
  };
}

function byTrackTitle(a, b) {
  return a.title.localeCompare(b.title);
}

export class LibraryStore {
  constructor() {
    this.state = createDefaultState();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState() {
    // Expose the live state object. Treat it as immutable outside the store.
    return this.state;
  }

  hydrate(persisted) {
    const defaults = createDefaultState();
    const persistedBrowser = persisted.libraryBrowser || {};
    const persistedFilters = persistedBrowser.filters || {};
    this.state = {
      ...defaults,
      ...persisted,
      tracks: Array.isArray(persisted.tracks) ? [...persisted.tracks] : [],
      playlists: Array.isArray(persisted.playlists) ? [...persisted.playlists] : [],
      playback: {
        ...defaults.playback,
        ...(persisted.playback || {})
      },
      trackPositions: typeof persisted.trackPositions === 'object' && persisted.trackPositions ? { ...persisted.trackPositions } : {},
      trackStats: typeof persisted.trackStats === 'object' && persisted.trackStats ? { ...persisted.trackStats } : {},
      recentlyPlayedIds: Array.isArray(persisted.recentlyPlayedIds) ? [...persisted.recentlyPlayedIds] : [],
      watchedFolders: Array.isArray(persisted.watchedFolders) ? [...persisted.watchedFolders] : [],
      libraryBrowser: {
        ...defaults.libraryBrowser,
        ...persistedBrowser,
        filters: {
          ...defaults.libraryBrowser.filters,
          ...persistedFilters
        },
        expandedGroups: {
          ...(persistedBrowser.expandedGroups || {})
        },
        advancedControlsCollapsed: typeof persistedBrowser.advancedControlsCollapsed === 'boolean' ? persistedBrowser.advancedControlsCollapsed : defaults.libraryBrowser.advancedControlsCollapsed
      }
    };

    this.normalizeState();
    this.emit();
  }

  setLibrarySearch(query) {
    this.state.libraryBrowser.searchQuery = String(query || '');
    this.emit();
  }

  setLibraryFilter(filterKey, value) {
    if (!['artist', 'playlist', 'genre', 'durationRange'].includes(filterKey)) return;
    this.state.libraryBrowser.filters[filterKey] = String(value || 'all');
    this.emit();
  }

  setLibrarySort(sortMode) {
    const valid = ['title-asc', 'artist-asc', 'recent-desc', 'duration-asc'];
    this.state.libraryBrowser.sortMode = valid.includes(sortMode) ? sortMode : 'title-asc';
    this.emit();
  }

  setLibraryGroupMode(groupMode) {
    const valid = ['none', 'artist', 'playlist', 'artist-playlist'];
    this.state.libraryBrowser.groupMode = valid.includes(groupMode) ? groupMode : 'none';
    this.emit();
  }

  setLibraryAdvancedCollapsed(collapsed) {
    this.state.libraryBrowser.advancedControlsCollapsed = Boolean(collapsed);
    this.emit();
  }

  toggleLibraryAdvancedCollapsed() {
    this.state.libraryBrowser.advancedControlsCollapsed = !Boolean(this.state.libraryBrowser.advancedControlsCollapsed);
    this.emit();
  }

  clearLibraryFilters() {
    this.state.libraryBrowser.searchQuery = '';
    this.state.libraryBrowser.filters = {
      artist: 'all',
      playlist: 'all',
      genre: 'all',
      durationRange: 'all'
    };
    this.emit();
  }

  toggleLibraryGroupExpanded(groupKey) {
    if (!groupKey) return;
    const current = this.state.libraryBrowser.expandedGroups[groupKey];
    this.state.libraryBrowser.expandedGroups[groupKey] = current === undefined ? false : !current;
    this.emit();
  }

  setView(view) {
    this.state.view = view;
    this.emit();
  }

  mergeTracks(nextTracks) {
    const map = new Map(this.state.tracks.map((track) => [track.id, track]));
    for (const track of nextTracks) {
      map.set(track.id, { ...track, missing: false });
    }

    this.state.tracks = [...map.values()].sort(byTrackTitle);
    this.normalizeState();
    this.emit();
  }

  updateTrack(trackId, patch) {
    if (!trackId || !patch || typeof patch !== 'object') return;

    const idx = this.state.tracks.findIndex((track) => track.id === trackId);
    if (idx < 0) return;

    const previous = this.state.tracks[idx];
    const next = { ...previous, ...patch };
    this.state.tracks[idx] = next;
    this.emit();
  }

  createPlaylist(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    const now = Date.now();
    const playlist = {
      id: createId('playlist'),
      name: trimmed,
      trackIds: [],
      createdAt: now,
      updatedAt: now
    };

    this.state.playlists = [playlist, ...this.state.playlists];
    this.state.activePlaylistId = playlist.id;
    this.state.view = 'playlists';
    this.emit();
  }

  renamePlaylist(playlistId, name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;

    this.state.playlists = this.state.playlists.map((playlist) =>
      playlist.id === playlistId ? { ...playlist, name: trimmed, updatedAt: Date.now() } : playlist
    );
    this.emit();
  }

  deletePlaylist(playlistId) {
    this.state.playlists = this.state.playlists.filter((playlist) => playlist.id !== playlistId);
    if (this.state.activePlaylistId === playlistId) {
      this.state.activePlaylistId = this.state.playlists[0]?.id || null;
    }
    this.emit();
  }

  setActivePlaylist(playlistId) {
    this.state.activePlaylistId = playlistId;
    this.emit();
  }

  addTrackToPlaylist(playlistId, trackId) {
    this.state.playlists = this.state.playlists.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      if (playlist.trackIds.includes(trackId)) return playlist;
      return { ...playlist, trackIds: [...playlist.trackIds, trackId], updatedAt: Date.now() };
    });
    this.emit();
  }

  bulkAddTracksToPlaylist(playlistId, trackIds) {
    const unique = [...new Set(trackIds || [])].filter(Boolean);
    if (!unique.length) return;
    this.state.playlists = this.state.playlists.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const set = new Set(playlist.trackIds);
      for (const id of unique) set.add(id);
      return { ...playlist, trackIds: [...set], updatedAt: Date.now() };
    });
    this.emit();
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    this.state.playlists = this.state.playlists.map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId), updatedAt: Date.now() }
        : playlist
    );
    this.emit();
  }

  bulkRemoveTracksFromPlaylist(playlistId, trackIds) {
    const removeSet = new Set(trackIds || []);
    if (!removeSet.size) return;
    this.state.playlists = this.state.playlists.map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, trackIds: playlist.trackIds.filter((id) => !removeSet.has(id)), updatedAt: Date.now() }
        : playlist
    );
    this.emit();
  }

  moveTrackInPlaylist(playlistId, from, to) {
    this.state.playlists = this.state.playlists.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      if (from < 0 || to < 0 || from >= playlist.trackIds.length || to >= playlist.trackIds.length) return playlist;

      const nextIds = [...playlist.trackIds];
      const [moved] = nextIds.splice(from, 1);
      if (!moved) return playlist;
      nextIds.splice(to, 0, moved);
      return { ...playlist, trackIds: nextIds, updatedAt: Date.now() };
    });
    this.emit();
  }

  setPlaybackVolume(volume) {
    this.state.playback.volume = Math.min(Math.max(volume, 0), 1);
    this.emit();
  }

  setRepeatMode(mode) {
    this.state.playback.repeatMode = mode;
    this.emit();
  }

  setShuffleEnabled(enabled) {
    this.state.playback.shuffleEnabled = Boolean(enabled);
    this.emit();
  }

  setPlaying(isPlaying) {
    this.state.playback.isPlaying = isPlaying;
    this.emit();
  }

  setQueueAndCurrent(queueTrackIds, currentTrackId) {
    const index = queueTrackIds.findIndex((id) => id === currentTrackId);
    this.state.playback.queueTrackIds = [...queueTrackIds];
    this.state.playback.queueIndex = index;
    this.state.playback.currentTrackId = index >= 0 ? currentTrackId : null;
    this.emit();
  }

  moveQueueItem(from, to) {
    const queue = [...this.state.playback.queueTrackIds];
    if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;

    const [moved] = queue.splice(from, 1);
    if (!moved) return;
    queue.splice(to, 0, moved);

    const currentId = this.state.playback.currentTrackId;
    this.state.playback.queueTrackIds = queue;
    this.state.playback.queueIndex = currentId ? queue.indexOf(currentId) : -1;
    this.emit();
  }

  removeQueueItem(trackId) {
    if (!trackId) return;

    const currentId = this.state.playback.currentTrackId;
    const queue = this.state.playback.queueTrackIds.filter((id) => id !== trackId);
    this.state.playback.queueTrackIds = queue;

    if (currentId && queue.includes(currentId)) {
      this.state.playback.queueIndex = queue.indexOf(currentId);
    } else if (queue.length) {
      const next = queue[Math.min(this.state.playback.queueIndex, queue.length - 1)] || queue[0];
      this.state.playback.currentTrackId = next;
      this.state.playback.queueIndex = queue.indexOf(next);
    } else {
      this.state.playback.currentTrackId = null;
      this.state.playback.queueIndex = -1;
      this.state.playback.isPlaying = false;
    }
    this.emit();
  }

  clearQueue() {
    this.state.playback.queueTrackIds = [];
    this.state.playback.queueIndex = -1;
    this.state.playback.currentTrackId = null;
    this.state.playback.isPlaying = false;
    this.emit();
  }

  restorePlaybackSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    this.state.playback.queueTrackIds = Array.isArray(snapshot.queueTrackIds) ? [...snapshot.queueTrackIds] : [];
    this.state.playback.queueIndex = Number(snapshot.queueIndex ?? -1);
    this.state.playback.currentTrackId = snapshot.currentTrackId || null;
    this.state.playback.isPlaying = Boolean(snapshot.isPlaying);
    this.emit();
  }

  getUpNextTrackIds() {
    const queue = this.state.playback.queueTrackIds;
    const index = this.state.playback.queueIndex;
    if (!queue.length || index < 0) return [];
    return queue.slice(index + 1);
  }

  toggleShuffleFrom(trackIds, currentTrackId) {
    const safeTrackIds = [...new Set(trackIds)].filter(Boolean);
    if (!safeTrackIds.length) return;

    const wasEnabled = this.state.playback.shuffleEnabled;
    this.state.playback.shuffleEnabled = !wasEnabled;

    if (!this.state.playback.shuffleEnabled) {
      // Keep queue order on disable to avoid destructive queue jumps.
      this.emit();
      return;
    }

    const head = currentTrackId && safeTrackIds.includes(currentTrackId) ? [currentTrackId] : [];
    const tail = safeTrackIds.filter((id) => id !== currentTrackId);
    for (let i = tail.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tail[i], tail[j]] = [tail[j], tail[i]];
    }

    const queue = [...head, ...tail];
    this.state.playback.queueTrackIds = queue;
    this.state.playback.currentTrackId = queue[0] || null;
    this.state.playback.queueIndex = queue[0] ? 0 : -1;
    this.emit();
  }

  recordTrackPlayed(trackId) {
    if (!trackId) return;

    const prev = this.state.trackStats[trackId] || { playCount: 0, lastPlayedMs: 0 };
    this.state.trackStats[trackId] = {
      playCount: Number(prev.playCount || 0) + 1,
      lastPlayedMs: Date.now()
    };

    const nextRecent = [trackId, ...this.state.recentlyPlayedIds.filter((id) => id !== trackId)];
    this.state.recentlyPlayedIds = nextRecent.slice(0, 200);
    this.emit();
  }

  setTrackPosition(trackId, seconds, emit = false) {
    if (!trackId) return;
    const safe = Math.max(0, Number(seconds || 0));
    this.state.trackPositions[trackId] = safe;
    if (emit) this.emit();
  }

  clearTrackPosition(trackId) {
    if (!trackId) return;
    delete this.state.trackPositions[trackId];
    this.emit();
  }

  getTrackPosition(trackId) {
    return Number(this.state.trackPositions[trackId] || 0);
  }

  getSmartViewTracks(view) {
    if (view === 'recent') {
      const rank = new Map(this.state.recentlyPlayedIds.map((id, idx) => [id, idx]));
      return this.state.tracks
        .filter((track) => rank.has(track.id))
        .sort((a, b) => Number(rank.get(a.id)) - Number(rank.get(b.id)));
    }

    if (view === 'most-played') {
      return [...this.state.tracks].sort((a, b) => {
        const aCount = Number(this.state.trackStats[a.id]?.playCount || 0);
        const bCount = Number(this.state.trackStats[b.id]?.playCount || 0);
        return bCount - aCount || a.title.localeCompare(b.title);
      });
    }

    return [];
  }

  getLibraryBrowserModel() {
    return buildLibraryBrowserModel(this.state);
  }

  restorePlaylistSnapshot(playlist, makeActive = false) {
    if (!playlist?.id) return;
    const existingIndex = this.state.playlists.findIndex((entry) => entry.id === playlist.id);
    if (existingIndex >= 0) {
      this.state.playlists[existingIndex] = { ...playlist, trackIds: [...(playlist.trackIds || [])] };
    } else {
      this.state.playlists = [{ ...playlist, trackIds: [...(playlist.trackIds || [])] }, ...this.state.playlists];
    }
    if (makeActive) this.state.activePlaylistId = playlist.id;
    this.emit();
  }

  setWatchedFolders(folders) {
    this.state.watchedFolders = [...new Set((folders || []).map((value) => String(value || '').trim()).filter(Boolean))];
    this.emit();
  }

  getLibraryFlatTracks() {
    return this.getLibraryBrowserModel().flatTracks;
  }

  getActivePlaylist() {
    if (!this.state.activePlaylistId) return null;
    return this.state.playlists.find((playlist) => playlist.id === this.state.activePlaylistId) || null;
  }

  exportPersistedState() {
    return {
      version: 1,
      tracks: this.state.tracks,
      playlists: this.state.playlists,
      activePlaylistId: this.state.activePlaylistId,
      playback: this.state.playback,
      trackPositions: this.state.trackPositions,
      trackStats: this.state.trackStats,
      recentlyPlayedIds: this.state.recentlyPlayedIds,
      watchedFolders: this.state.watchedFolders,
      libraryBrowser: this.state.libraryBrowser
    };
  }

  normalizeState() {
    const validTrackIds = new Set(this.state.tracks.map((track) => track.id));

    this.state.playlists = this.state.playlists.map((playlist) => ({
      ...playlist,
      trackIds: playlist.trackIds.filter((id) => validTrackIds.has(id))
    }));

    if (this.state.activePlaylistId && !this.state.playlists.some((playlist) => playlist.id === this.state.activePlaylistId)) {
      this.state.activePlaylistId = this.state.playlists[0]?.id || null;
    }

    this.state.playback.queueTrackIds = this.state.playback.queueTrackIds.filter((id) => validTrackIds.has(id));
    this.state.recentlyPlayedIds = this.state.recentlyPlayedIds.filter((id) => validTrackIds.has(id));

    const nextPositions = {};
    for (const [id, pos] of Object.entries(this.state.trackPositions)) {
      if (validTrackIds.has(id)) nextPositions[id] = Math.max(0, Number(pos || 0));
    }
    this.state.trackPositions = nextPositions;

    const nextStats = {};
    for (const [id, stats] of Object.entries(this.state.trackStats)) {
      if (!validTrackIds.has(id)) continue;
      nextStats[id] = {
        playCount: Math.max(0, Number(stats?.playCount || 0)),
        lastPlayedMs: Math.max(0, Number(stats?.lastPlayedMs || 0))
      };
    }
    this.state.trackStats = nextStats;
    this.state.watchedFolders = [...new Set((this.state.watchedFolders || []).map((item) => String(item || '').trim()).filter(Boolean))];

    if (!this.state.playback.currentTrackId || !validTrackIds.has(this.state.playback.currentTrackId)) {
      this.state.playback.currentTrackId = null;
      this.state.playback.queueIndex = -1;
      this.state.playback.isPlaying = false;
    }
  }

  emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

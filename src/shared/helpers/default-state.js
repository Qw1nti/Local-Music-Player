// Shared defaults/validation for the persisted library state.
export function createDefaultState() {
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
    }
  };
}

export function isValidStateShape(state) {
  return (
    state &&
    typeof state === 'object' &&
    state.version === 1 &&
    Array.isArray(state.tracks) &&
    Array.isArray(state.playlists) &&
    state.playback &&
    typeof state.playback === 'object'
  );
}

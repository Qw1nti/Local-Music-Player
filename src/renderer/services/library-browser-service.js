/**
 * Library browser transformation pipeline.
 *
 * raw tracks -> search -> filters -> sort -> grouping view model
 */

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSearch(value) {
  return normalizeText(value).toLowerCase();
}

function trackGenre(track) {
  return normalizeText(track.genre) || 'Unknown Genre';
}

function trackDurationBucket(track) {
  const seconds = Number(track.durationSec || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'unknown';
  if (seconds < 120) return 'under-2';
  if (seconds < 240) return '2-4';
  if (seconds < 360) return '4-6';
  return 'over-6';
}

function compareByMode(a, b, sortMode) {
  switch (sortMode) {
    case 'artist-asc':
      return String(a.artist || '').localeCompare(String(b.artist || '')) || String(a.title || '').localeCompare(String(b.title || ''));
    case 'recent-desc':
      return Number(b.modifiedMs || 0) - Number(a.modifiedMs || 0);
    case 'duration-asc':
      return Number(a.durationSec || 0) - Number(b.durationSec || 0) || String(a.title || '').localeCompare(String(b.title || ''));
    case 'title-asc':
    default:
      return String(a.title || '').localeCompare(String(b.title || ''));
  }
}

function sortTracks(tracks, sortMode) {
  return [...tracks].sort((a, b) => compareByMode(a, b, sortMode));
}

function createPlaylistMembership(playlists) {
  const byTrackId = new Map();

  for (const playlist of playlists) {
    for (const trackId of playlist.trackIds || []) {
      const list = byTrackId.get(trackId) || [];
      list.push({ id: playlist.id, name: playlist.name });
      byTrackId.set(trackId, list);
    }
  }

  for (const list of byTrackId.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return byTrackId;
}

function applySearch(tracks, query) {
  const q = normalizeSearch(query);
  if (!q) return tracks;

  return tracks.filter((track) => {
    const haystack = `${track.title || ''} ${track.artist || ''} ${track.album || ''} ${trackGenre(track)}`.toLowerCase();
    return haystack.includes(q);
  });
}

function applyFilters(tracks, filters, membershipByTrackId) {
  const artist = filters.artist || 'all';
  const playlist = filters.playlist || 'all';
  const genre = filters.genre || 'all';
  const durationRange = filters.durationRange || 'all';

  return tracks.filter((track) => {
    if (artist !== 'all' && String(track.artist || '') !== artist) return false;

    if (playlist !== 'all') {
      const memberships = membershipByTrackId.get(track.id) || [];
      if (playlist === 'none') {
        if (memberships.length > 0) return false;
      } else if (!memberships.some((entry) => entry.id === playlist)) {
        return false;
      }
    }

    if (genre !== 'all' && trackGenre(track) !== genre) return false;

    if (durationRange !== 'all') {
      if (trackDurationBucket(track) !== durationRange) return false;
    }

    return true;
  });
}

function ensureExpanded(expandedGroups, key, defaultValue) {
  if (Object.prototype.hasOwnProperty.call(expandedGroups, key)) {
    return Boolean(expandedGroups[key]);
  }
  return defaultValue;
}

function groupByArtist(tracks, expandedGroups) {
  const map = new Map();

  for (const track of tracks) {
    const artist = normalizeText(track.artist) || 'Unknown Artist';
    const list = map.get(artist) || [];
    list.push(track);
    map.set(artist, list);
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([artist, items]) => {
      const key = `artist::${encodeURIComponent(artist)}`;
      return {
        kind: 'artist',
        key,
        label: artist,
        count: items.length,
        expanded: ensureExpanded(expandedGroups, key, true),
        tracks: items,
        groups: []
      };
    });
}

function groupByPlaylist(tracks, membershipByTrackId, expandedGroups) {
  const map = new Map();

  for (const track of tracks) {
    const memberships = membershipByTrackId.get(track.id) || [];
    if (!memberships.length) {
      const list = map.get('none') || [];
      list.push(track);
      map.set('none', list);
      continue;
    }

    for (const playlist of memberships) {
      const key = `playlist::${playlist.id}::${playlist.name}`;
      const list = map.get(key) || [];
      list.push(track);
      map.set(key, list);
    }
  }

  const entries = [...map.entries()].map(([groupKey, items]) => {
    if (groupKey === 'none') {
      return { groupKey, label: 'Not in playlist', id: 'none', items };
    }

    const [, playlistId, playlistName] = groupKey.split('::');
    return { groupKey, label: playlistName, id: playlistId, items };
  });

  entries.sort((a, b) => a.label.localeCompare(b.label));

  return entries.map((entry) => {
    const key = `playlist::${entry.id}`;
    return {
      kind: 'playlist',
      key,
      label: entry.label,
      count: entry.items.length,
      expanded: ensureExpanded(expandedGroups, key, true),
      tracks: entry.items,
      groups: []
    };
  });
}

function groupByArtistPlaylist(tracks, membershipByTrackId, expandedGroups) {
  const artistMap = new Map();

  for (const track of tracks) {
    const artist = normalizeText(track.artist) || 'Unknown Artist';
    const artistEntry = artistMap.get(artist) || new Map();

    const memberships = membershipByTrackId.get(track.id) || [];
    if (!memberships.length) {
      const list = artistEntry.get('none') || [];
      list.push(track);
      artistEntry.set('none', list);
    } else {
      for (const playlist of memberships) {
        const key = `playlist::${playlist.id}::${playlist.name}`;
        const list = artistEntry.get(key) || [];
        list.push(track);
        artistEntry.set(key, list);
      }
    }

    artistMap.set(artist, artistEntry);
  }

  return [...artistMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([artist, playlistMap]) => {
      const artistKey = `artist::${encodeURIComponent(artist)}`;

      const groups = [...playlistMap.entries()]
        .map(([playlistKey, items]) => {
          let playlistId = 'none';
          let playlistName = 'Not in playlist';

          if (playlistKey !== 'none') {
            const [, parsedId, parsedName] = playlistKey.split('::');
            playlistId = parsedId;
            playlistName = parsedName;
          }

          const key = `${artistKey}::playlist::${playlistId}`;
          return {
            kind: 'playlist',
            key,
            label: playlistName,
            count: items.length,
            expanded: ensureExpanded(expandedGroups, key, true),
            tracks: items,
            groups: []
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      const artistTrackCount = groups.reduce((acc, group) => acc + group.count, 0);

      return {
        kind: 'artist',
        key: artistKey,
        label: artist,
        count: artistTrackCount,
        expanded: ensureExpanded(expandedGroups, artistKey, true),
        tracks: [],
        groups
      };
    });
}

function buildFilterOptions(tracks, playlists) {
  const artists = [...new Set(tracks.map((track) => normalizeText(track.artist) || 'Unknown Artist'))].sort((a, b) => a.localeCompare(b));
  const genres = [...new Set(tracks.map((track) => trackGenre(track)))].sort((a, b) => a.localeCompare(b));
  const playlistOptions = [{ id: 'none', name: 'Not in playlist' }, ...playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }))].sort((a, b) => {
    if (a.id === 'none') return -1;
    if (b.id === 'none') return 1;
    return a.name.localeCompare(b.name);
  });

  return { artists, genres, playlists: playlistOptions };
}

function activeFilterSummary(browser, playlistOptions) {
  const playlistNameById = new Map(playlistOptions.map((playlist) => [playlist.id, playlist.name]));
  const out = [];
  if (normalizeText(browser.searchQuery)) out.push(`Search: "${browser.searchQuery}"`);
  if (browser.filters.artist !== 'all') out.push(`Artist: ${browser.filters.artist}`);
  if (browser.filters.playlist !== 'all') {
    out.push(`Playlist: ${playlistNameById.get(browser.filters.playlist) || browser.filters.playlist}`);
  }
  if (browser.filters.genre !== 'all') out.push(`Genre: ${browser.filters.genre}`);
  if (browser.filters.durationRange !== 'all') {
    const map = {
      'under-2': 'Under 2 min',
      '2-4': '2-4 min',
      '4-6': '4-6 min',
      'over-6': 'Over 6 min'
    };
    out.push(`Duration: ${map[browser.filters.durationRange] || browser.filters.durationRange}`);
  }
  return out;
}

export function buildLibraryBrowserModel(state) {
  const browser = state.libraryBrowser;
  const membershipByTrackId = createPlaylistMembership(state.playlists);
  const options = buildFilterOptions(state.tracks, state.playlists);

  const searched = applySearch(state.tracks, browser.searchQuery);
  const filtered = applyFilters(searched, browser.filters, membershipByTrackId);
  const sorted = sortTracks(filtered, browser.sortMode);

  let groups = [];
  if (browser.groupMode === 'artist') {
    groups = groupByArtist(sorted, browser.expandedGroups);
  } else if (browser.groupMode === 'playlist') {
    groups = groupByPlaylist(sorted, membershipByTrackId, browser.expandedGroups);
  } else if (browser.groupMode === 'artist-playlist') {
    groups = groupByArtistPlaylist(sorted, membershipByTrackId, browser.expandedGroups);
  }

  return {
    controls: options,
    browser,
    activeFilters: activeFilterSummary(browser, options.playlists),
    resultCount: sorted.length,
    totalCount: state.tracks.length,
    flatTracks: sorted,
    grouped: {
      mode: browser.groupMode,
      groups
    }
  };
}

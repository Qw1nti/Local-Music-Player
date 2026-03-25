import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLibraryView } from '../src/renderer/components/library-view.js';
import { renderPlaylistsView } from '../src/renderer/components/playlists-view.js';
import { renderPlayerBar } from '../src/renderer/components/player-bar.js';
import { renderNowPlayingRail } from '../src/renderer/components/now-playing-rail.js';

function track(id, title) {
  return {
    id,
    path: `/tmp/${id}.mp3`,
    fileName: `${id}.mp3`,
    title,
    artist: 'Artist',
    author: 'Artist',
    album: 'Album',
    genre: 'Genre',
    artworkDataUrl: '',
    durationSec: 180,
    modifiedMs: Date.now(),
    missing: false
  };
}

test('renderLibraryView includes now playing and up next markers', () => {
  const t1 = track('a', 'Alpha');
  const t2 = track('b', 'Beta');
  const html = renderLibraryView(
    {
      browser: {
        searchQuery: '',
        filters: { artist: 'all', playlist: 'all', genre: 'all', durationRange: 'all' },
        sortMode: 'title-asc',
        groupMode: 'none',
        advancedControlsCollapsed: true
      },
      controls: { artists: [], playlists: [], genres: [] },
      activeFilters: [],
      resultCount: 2,
      totalCount: 2,
      flatTracks: [t1, t2],
      grouped: { mode: 'none', groups: [] }
    },
    {
      currentTrackId: 'a',
      upNextTrackIds: new Set(['b'])
    }
  );

  assert.ok(html.includes('Now Playing'));
  assert.ok(html.includes('Up Next'));
});

test('renderPlaylistsView marks now playing and up next tracks', () => {
  const t1 = track('a', 'Alpha');
  const t2 = track('b', 'Beta');
  const html = renderPlaylistsView(
    { id: 'p1', name: 'P', trackIds: ['a', 'b'] },
    new Map([
      ['a', t1],
      ['b', t2]
    ]),
    null,
    {
      currentTrackId: 'a',
      upNextTrackIds: new Set(['b'])
    }
  );

  assert.ok(html.includes('Now Playing'));
  assert.ok(html.includes('Up Next'));
});

test('renderPlayerBar displays playback status badges', () => {
  const html = renderPlayerBar({
    track: track('a', 'Alpha'),
    isPlaying: true,
    repeatMode: 'all',
    volume: 0.8,
    currentTime: 10,
    duration: 200,
    showAlbumArt: true,
    shuffleEnabled: true,
    crossfadeMs: 250,
    gaplessPlayback: true,
    replayGainMode: 'track'
  });

  assert.ok(html.includes('Shuffle'));
  assert.ok(html.includes('Repeat all'));
  assert.ok(html.includes('Crossfade 250ms'));
  assert.ok(html.includes('Gapless'));
  assert.ok(html.includes('ReplayGain track'));
});

test('renderNowPlayingRail queue rows include keyboard/focus attributes', () => {
  const html = renderNowPlayingRail({
    track: track('a', 'Alpha'),
    totalTracks: 2,
    totalPlaylists: 1,
    queueTracks: [track('a', 'Alpha'), track('b', 'Beta')],
    upNextTracks: [track('b', 'Beta')],
    currentTrackId: 'a',
    upNextTrackIds: new Set(['b'])
  });

  assert.ok(html.includes('data-queue-row="1"'));
  assert.ok(html.includes('aria-label="Remove from queue"'));
});

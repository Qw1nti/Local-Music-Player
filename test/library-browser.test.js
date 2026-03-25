import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLibraryBrowserModel } from '../src/renderer/services/library-browser-service.js';

const tracks = [
  {
    id: '1',
    title: 'Song A',
    artist: 'Alpha',
    album: 'First',
    genre: 'Rock',
    durationSec: 100,
    modifiedMs: 1
  },
  {
    id: '2',
    title: 'Song B',
    artist: 'Beta',
    album: 'Second',
    genre: 'Jazz',
    durationSec: 250,
    modifiedMs: 2
  }
];

const baseState = {
  tracks,
  playlists: [{ id: 'p1', name: 'Fav', trackIds: ['1'] }],
  libraryBrowser: {
    searchQuery: '',
    filters: { artist: 'all', playlist: 'all', genre: 'all', durationRange: 'all' },
    sortMode: 'title-asc',
    groupMode: 'artist-playlist',
    expandedGroups: {}
  }
};

test('artist-playlist grouping includes Not in playlist bucket', () => {
  const model = buildLibraryBrowserModel(baseState);
  assert.equal(model.grouped.mode, 'artist-playlist');
  const beta = model.grouped.groups.find((group) => group.label === 'Beta');
  assert.ok(beta);
  assert.ok(beta.groups.find((group) => group.label === 'Not in playlist'));
});

test('search and genre filters reduce result set', () => {
  const model = buildLibraryBrowserModel({
    ...baseState,
    libraryBrowser: {
      ...baseState.libraryBrowser,
      searchQuery: 'song',
      filters: { ...baseState.libraryBrowser.filters, genre: 'Rock' },
      groupMode: 'none'
    }
  });

  assert.equal(model.resultCount, 1);
  assert.equal(model.flatTracks[0].id, '1');
});


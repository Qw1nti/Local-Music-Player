import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryStore } from '../src/renderer/store/library-store.js';

function createTrack(id, title) {
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
    sizeBytes: 1024,
    modifiedMs: Date.now(),
    missing: false
  };
}

test('shuffle keeps current track at head and includes all tracks once', () => {
  const store = new LibraryStore();
  const tracks = [createTrack('a', 'A'), createTrack('b', 'B'), createTrack('c', 'C')];
  store.mergeTracks(tracks);
  store.toggleShuffleFrom(tracks.map((t) => t.id), 'b');

  const queue = store.getState().playback.queueTrackIds;
  assert.equal(store.getState().playback.currentTrackId, 'b');
  assert.equal(queue.length, 3);
  assert.deepEqual([...queue].sort(), ['a', 'b', 'c']);
  assert.equal(queue[0], 'b');
});

test('queue remove recalculates index and current track safely', () => {
  const store = new LibraryStore();
  const tracks = [createTrack('a', 'A'), createTrack('b', 'B'), createTrack('c', 'C')];
  store.mergeTracks(tracks);
  store.setQueueAndCurrent(['a', 'b', 'c'], 'b');

  store.removeQueueItem('b');

  assert.equal(store.getState().playback.currentTrackId, 'c');
  assert.equal(store.getState().playback.queueIndex, 1);
  assert.deepEqual(store.getState().playback.queueTrackIds, ['a', 'c']);
});

test('library advanced controls collapsed state is persisted via export/hydrate', () => {
  const store = new LibraryStore();
  store.setLibraryAdvancedCollapsed(false);
  const exported = store.exportPersistedState();

  const next = new LibraryStore();
  next.hydrate(exported);

  assert.equal(next.getState().libraryBrowser.advancedControlsCollapsed, false);
});

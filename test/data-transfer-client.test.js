import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePlaylists, buildSettingsImportEntries } from '../src/renderer/services/data-transfer-client.js';

test('mergePlaylists merges by id and unions track ids', () => {
  const existing = [{ id: 'p1', name: 'One', trackIds: ['a', 'b'], createdAt: 1, updatedAt: 2 }];
  const incoming = [
    { id: 'p1', name: 'One+', trackIds: ['b', 'c'], updatedAt: 5 },
    { id: 'p2', name: 'Two', trackIds: ['z'] }
  ];

  const merged = mergePlaylists(existing, incoming);
  assert.equal(merged.length, 2);

  const p1 = merged.find((item) => item.id === 'p1');
  assert.ok(p1);
  assert.deepEqual([...p1.trackIds].sort(), ['a', 'b', 'c']);
  assert.equal(p1.name, 'One+');

  const p2 = merged.find((item) => item.id === 'p2');
  assert.ok(p2);
  assert.deepEqual(p2.trackIds, ['z']);
});

test('buildSettingsImportEntries includes key playback/library/settings paths', () => {
  const entries = buildSettingsImportEntries({
    playback: { crossfadeMs: 250, gaplessPlayback: true, replayGain: 'track' },
    library: { autoScanOnLaunch: true, showMissingTracks: false },
    appearance: { showAlbumArt: false },
    advanced: { debugLogging: true }
  });

  const map = new Map(entries);
  assert.equal(map.get('playback.crossfadeMs'), 250);
  assert.equal(map.get('playback.gaplessPlayback'), true);
  assert.equal(map.get('playback.replayGain'), 'track');
  assert.equal(map.get('library.autoScanOnLaunch'), true);
  assert.equal(map.get('library.showMissingTracks'), false);
  assert.equal(map.get('appearance.showAlbumArt'), false);
  assert.equal(map.get('advanced.debugLogging'), true);
});

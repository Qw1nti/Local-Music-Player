import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanPaths } from '../src/main/services/track-scan-service.js';

test('scanPaths emits progress and discovers audio files', async () => {
  const base = await mkdtemp(join(tmpdir(), 'scan-progress-'));
  try {
    await writeFile(join(base, 'a.mp3'), 'fake-audio', 'utf8');
    await writeFile(join(base, 'b.flac'), 'fake-audio', 'utf8');
    await writeFile(join(base, 'c.txt'), 'not-audio', 'utf8');

    const events = [];
    const result = await scanPaths([base], {
      includeHash: false,
      progress: (payload) => events.push(payload)
    });

    assert.equal(result.canceled, false);
    assert.equal(result.tracks.length, 2);
    assert.ok(events.some((item) => item.phase === 'start'));
    assert.ok(events.some((item) => item.phase === 'discover'));
    assert.ok(events.some((item) => item.phase === 'process'));
    assert.ok(events.some((item) => item.phase === 'done'));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('scanPaths supports cancellation via AbortSignal', async () => {
  const base = await mkdtemp(join(tmpdir(), 'scan-cancel-'));
  try {
    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await writeFile(join(base, `track-${i}.mp3`), 'fake-audio', 'utf8');
    }

    const controller = new AbortController();
    const result = await scanPaths([base], {
      includeHash: false,
      signal: controller.signal,
      progress: (payload) => {
        if (payload.phase === 'process' && Number(payload.processedCount || 0) >= 12) {
          controller.abort();
        }
      }
    });

    assert.equal(result.canceled, true);
    assert.ok(result.tracks.length < 200);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

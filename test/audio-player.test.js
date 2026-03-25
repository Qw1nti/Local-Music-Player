import test from 'node:test';
import assert from 'node:assert/strict';

class MockAudio {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.currentTime = 0;
    this.duration = 180;
    this.volume = 1;
    this.preload = 'metadata';
    this._src = '';
  }

  addEventListener(name, fn) {
    const list = this.listeners.get(name) || [];
    list.push(fn);
    this.listeners.set(name, list);
  }

  removeEventListener(name, fn) {
    const list = this.listeners.get(name) || [];
    this.listeners.set(
      name,
      list.filter((item) => item !== fn)
    );
  }

  emit(name) {
    const list = this.listeners.get(name) || [];
    for (const fn of list) fn();
  }

  set src(value) {
    this._src = value;
    queueMicrotask(() => this.emit('loadedmetadata'));
  }

  get src() {
    return this._src;
  }

  async play() {
    this.paused = false;
    this.emit('play');
  }

  pause() {
    this.paused = true;
    this.emit('pause');
  }
}

globalThis.Audio = MockAudio;

const { AudioPlayer } = await import('../src/renderer/services/audio-player.js');

test('AudioPlayer transitionTo swaps active deck', async () => {
  const player = new AudioPlayer();
  await player.load('/tmp/a.mp3');
  await player.play();
  const before = player.activeKey;

  await player.transitionTo('/tmp/b.mp3', { transitionMs: 80, nextGain: 0.75 });
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.notEqual(player.activeKey, before);
  assert.equal(player.isPlaying, true);
});

test('AudioPlayer gain staging applies gain and base volume', async () => {
  const player = new AudioPlayer();
  await player.load('/tmp/a.mp3');
  player.setVolume(0.8);
  player.setTrackGain(0.5);
  await player.play();

  assert.ok(Math.abs(player.activeAudio.volume - 0.4) < 0.02);
});

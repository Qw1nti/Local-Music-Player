/**
 * Playback engine with dual-deck transition support.
 *
 * Features:
 * - Single-track playback API compatibility (`load`, `play`, `pause`, `seek`)
 * - Crossfade/gapless transitions using a standby audio element
 * - Track gain multiplier hook for replay-gain style adjustments
 */
import { clamp } from '../utils/format.js';

function toFileUrl(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (!normalized) return '';

  const isWindowsDrive = /^[A-Za-z]:\//.test(normalized);
  const parts = normalized.split('/').map((part, idx) => {
    if (idx === 0 && part === '') return '';
    return encodeURIComponent(part);
  });

  const pathPart = parts.join('/');
  return isWindowsDrive ? `file:///${pathPart}` : `file://${pathPart}`;
}

function waitForEvent(target, eventName) {
  return new Promise((resolve) => {
    const onDone = () => {
      target.removeEventListener(eventName, onDone);
      resolve();
    };
    target.addEventListener(eventName, onDone, { once: true });
  });
}

export class AudioPlayer {
  constructor() {
    this.primary = new Audio();
    this.secondary = new Audio();
    this.events = {};
    this.activeKey = 'primary';
    this.volume = 0.9;
    this.trackGain = 1;
    this.playbackOptions = {
      crossfadeMs: 0,
      gaplessPlayback: false,
      replayGainMode: 'off'
    };
    this.transitionTimer = null;

    this.primary.preload = 'metadata';
    this.secondary.preload = 'metadata';

    this.bindAudio(this.primary, 'primary');
    this.bindAudio(this.secondary, 'secondary');
  }

  bindAudio(audio, key) {
    audio.addEventListener('timeupdate', () => {
      if (this.activeKey !== key) return;
      this.events.onTimeUpdate?.(this.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => {
      if (this.activeKey !== key) return;
      this.events.onDurationChange?.(this.duration);
    });
    audio.addEventListener('play', () => {
      if (this.activeKey !== key) return;
      this.events.onPlayStateChange?.(true);
    });
    audio.addEventListener('pause', () => {
      if (this.activeKey !== key) return;
      this.events.onPlayStateChange?.(false);
    });
    audio.addEventListener('ended', () => {
      if (this.activeKey !== key) return;
      this.events.onEnded?.();
    });
    audio.addEventListener('error', () => {
      if (this.activeKey !== key) return;
      this.events.onError?.('Unable to play this file.');
    });
  }

  setEvents(events) {
    this.events = events;
  }

  setPlaybackOptions(options = {}) {
    this.playbackOptions = {
      ...this.playbackOptions,
      ...options,
      crossfadeMs: Math.max(0, Number(options.crossfadeMs ?? this.playbackOptions.crossfadeMs ?? 0)),
      gaplessPlayback: Boolean(options.gaplessPlayback ?? this.playbackOptions.gaplessPlayback),
      replayGainMode: options.replayGainMode || this.playbackOptions.replayGainMode || 'off'
    };
  }

  get activeAudio() {
    return this.activeKey === 'primary' ? this.primary : this.secondary;
  }

  get standbyAudio() {
    return this.activeKey === 'primary' ? this.secondary : this.primary;
  }

  applyVolume(audio, gain = this.trackGain) {
    audio.volume = clamp(this.volume * gain, 0, 1);
  }

  setTrackGain(gain) {
    const next = Number(gain);
    this.trackGain = Number.isFinite(next) ? clamp(next, 0.05, 2.5) : 1;
    this.applyVolume(this.activeAudio, this.trackGain);
  }

  async load(filePath) {
    const url = toFileUrl(filePath);
    if (!url) throw new Error('Invalid file path.');
    const audio = this.activeAudio;
    audio.src = url;
    audio.currentTime = 0;
  }

  async play() {
    this.applyVolume(this.activeAudio, this.trackGain);
    await this.activeAudio.play();
  }

  pause() {
    this.activeAudio.pause();
  }

  seek(seconds) {
    this.activeAudio.currentTime = clamp(seconds, 0, this.duration || 0);
  }

  setVolume(volume) {
    this.volume = clamp(volume, 0, 1);
    this.applyVolume(this.activeAudio, this.trackGain);
  }

  async transitionTo(filePath, options = {}) {
    const transitionMs = Math.max(0, Number(options.transitionMs ?? this.playbackOptions.crossfadeMs ?? 0));
    const nextGain = Number.isFinite(Number(options.nextGain)) ? clamp(Number(options.nextGain), 0.05, 2.5) : 1;
    const startAt = Math.max(0, Number(options.startAt || 0));

    if (!this.isPlaying || transitionMs <= 0) {
      await this.load(filePath);
      this.setTrackGain(nextGain);
      if (startAt > 0) this.seek(startAt);
      await this.play();
      return;
    }

    const incoming = this.standbyAudio;
    const outgoing = this.activeAudio;

    const url = toFileUrl(filePath);
    if (!url) throw new Error('Invalid file path.');

    incoming.src = url;
    incoming.currentTime = startAt;
    incoming.volume = 0;

    await Promise.race([waitForEvent(incoming, 'loadedmetadata'), new Promise((resolve) => setTimeout(resolve, 350))]);
    await incoming.play();

    if (this.transitionTimer) clearInterval(this.transitionTimer);

    const startedAt = performance.now();
    await new Promise((resolve) => {
      this.transitionTimer = setInterval(() => {
        const elapsed = performance.now() - startedAt;
        const t = clamp(elapsed / transitionMs, 0, 1);
        outgoing.volume = clamp(this.volume * this.trackGain * (1 - t), 0, 1);
        incoming.volume = clamp(this.volume * nextGain * t, 0, 1);

        if (t >= 1) {
          clearInterval(this.transitionTimer);
          this.transitionTimer = null;
          outgoing.pause();
          outgoing.src = '';
          this.activeKey = this.activeKey === 'primary' ? 'secondary' : 'primary';
          this.trackGain = nextGain;
          this.events.onDurationChange?.(this.duration);
          this.events.onTimeUpdate?.(this.currentTime);
          resolve();
        }
      }, 28);
    });
  }

  get duration() {
    const audio = this.activeAudio;
    return Number.isFinite(audio.duration) ? audio.duration : 0;
  }

  get currentTime() {
    const audio = this.activeAudio;
    return Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  }

  get isPlaying() {
    return !this.activeAudio.paused;
  }
}

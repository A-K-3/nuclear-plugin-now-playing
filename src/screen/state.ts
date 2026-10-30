// What the screen knows about Nuclear's player: the queue, the playback state and the play modes.
// Updated from Nuclear's subscriptions; every part of the screen reads it from here.
import type { PlaybackState, PlaybackStatus, Queue, QueueItem, RepeatMode } from '@nuclearplayer/plugin-sdk';

export class PlayerState {
  queue: Queue = { items: [], currentIndex: 0 };
  status: PlaybackStatus = 'paused';
  duration = 0;
  shuffle = false;
  repeat: RepeatMode = 'off';
  private seek = 0;
  private at = performance.now();

  get current(): QueueItem | undefined { return this.queue.items[this.queue.currentIndex]; }
  get next(): QueueItem | undefined { return this.queue.items[this.queue.currentIndex + 1]; }
  get playing() { return this.status === 'playing'; }

  setPlayback(s: PlaybackState) {
    this.status = s.status;
    this.duration = s.duration;
    this.seekTo(s.seek);
  }

  seekTo(seconds: number) {
    this.seek = seconds;
    this.at = performance.now();
  }

  // Current position, advanced locally between Nuclear's updates
  position() {
    // Without a duration nothing is loaded yet: do not run a clock for audio that is not playing
    if (!this.duration) return this.seek || 0;
    return Math.min(this.duration, (this.seek || 0) + (this.playing ? (performance.now() - this.at) / 1000 : 0));
  }
}

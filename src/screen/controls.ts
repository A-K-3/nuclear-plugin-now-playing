// Timeline, playback controls and volume. Shuffle, repeat and volume have no subscription in the
// plugin API (Settings.subscribe only sees the plugin's own settings, not core.playback.*), so they are
// polled while the screen is open and repainted only when they change.
import type { NuclearPluginAPI, PlaybackState, RepeatMode } from '@nuclearplayer/plugin-sdk';

import { fmt } from '../lib/format';
import { clamp } from '../lib/math';
import { ICON } from './icons';
import type { PlayerState } from './state';
import { setOn, type Query } from './template';

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
const VOLUME_STEP = 0.05;

export class Controls {
  // The seek bar is being dragged: Nuclear's position updates must not move it meanwhile
  seeking = false;
  private volDrag = false;
  private volume = 1;
  private lastVolume = 1;
  private lastModes = '';
  private lastTime = { cur: '', dur: '', pct: -1 };
  private el;

  constructor(private api: NuclearPluginAPI, private root: HTMLElement, q: Query, private state: PlayerState) {
    this.el = {
      cur: q('.cur'), dur: q('.dur'), seek: q('.seek'), seekFill: q('.seek .fill'), seekKnob: q('.seek .knob'),
      vol: q('.vol'), volFill: q('.vol .fill'), volKnob: q('.vol .knob'), volIcon: q('.volicon path'),
      playIcon: q('.playicon path'), shuffle: q('[data-act="shuffle"]'), repeat: q('[data-act="repeat"]'), one: q('.one'),
    };
    slider(this.el.seek, (f) => {
      if (!state.duration) return;
      this.seeking = true;
      this.drawTime(f * state.duration, state.duration);
    }, (f) => {
      if (!this.seeking) return;
      this.seeking = false;
      const s = f * state.duration;
      state.seekTo(s);
      api.Playback.seekTo(s);
    });
    slider(this.el.vol, (f) => { this.volDrag = true; this.setVolume(f); }, (f) => {
      this.setVolume(f);
      setTimeout(() => (this.volDrag = false), 600);
    });
    this.el.vol.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setVolume(this.volume - Math.sign(e.deltaY) * VOLUME_STEP);
    }, { passive: false });
  }

  // Forces the next refresh to repaint (the screen was closed meanwhile)
  reset() { this.lastModes = ''; }

  renderPlayback(s: PlaybackState) {
    this.el.playIcon.setAttribute('d', s.status === 'playing' ? ICON.pause : ICON.play);
    this.root.classList.toggle('paused', s.status !== 'playing');
    // "Playing" with no duration means the stream is still being found or loaded
    this.root.classList.toggle('loading', s.status === 'playing' && !s.duration);
  }

  async refreshModes() {
    try {
      const { Playback } = this.api;
      const [sh, rep, vol, muted] = await Promise.all([Playback.isShuffleEnabled(), Playback.getRepeatMode(), Playback.getVolume(), Playback.isMuted()]);
      this.state.shuffle = sh; this.state.repeat = rep;
      const v = muted ? 0 : vol;
      const modes = `${sh}|${rep}|${this.volDrag ? '' : v}`;
      if (modes === this.lastModes) return;
      this.lastModes = modes;
      setOn(this.el.shuffle, sh);
      setOn(this.el.repeat, rep !== 'off');
      this.el.one.textContent = rep === 'one' ? '1' : '';
      if (!this.volDrag) { this.volume = v; this.renderVolume(); }
    } catch { /* Nuclear not ready */ }
  }

  // Call every frame; writes to the page only when what is shown changes
  update(pos: number) {
    if (!this.seeking) this.drawTime(pos, this.state.duration);
  }

  toggleShuffle() { return this.api.Playback.setShuffleEnabled(!this.state.shuffle).then(() => this.refreshModes()); }
  cycleRepeat() { return this.api.Playback.setRepeatMode(NEXT_REPEAT[this.state.repeat]).then(() => this.refreshModes()); }
  volumeUp() { this.setVolume(this.volume + VOLUME_STEP); }
  volumeDown() { this.setVolume(this.volume - VOLUME_STEP); }
  toggleMute() {
    if (this.volume > 0) { this.lastVolume = this.volume; this.setVolume(0); } else this.setVolume(this.lastVolume || 0.5);
  }

  private setVolume(v: number) {
    this.volume = Math.round(clamp(v, 0, 1) * 100) / 100;
    this.renderVolume();
    this.api.Playback.setMuted(false);
    this.api.Playback.setVolume(this.volume);
  }

  private renderVolume() {
    const v = this.volume;
    this.el.volFill.style.width = v * 100 + '%';
    this.el.volKnob.style.left = v * 100 + '%';
    this.el.volIcon.setAttribute('d', v === 0 ? ICON.volOff : v < 0.5 ? ICON.volLo : ICON.volHi);
  }

  private drawTime(pos: number, dur: number) {
    const t = this.lastTime;
    const pct = dur ? Math.round(Math.min(100, (pos / dur) * 100) * 100) / 100 : 0;
    if (pct !== t.pct) {
      this.el.seekFill.style.width = pct + '%';
      this.el.seekKnob.style.left = pct + '%';
      t.pct = pct;
    }
    const cur = fmt(pos), total = fmt(dur);
    if (cur !== t.cur) this.el.cur.textContent = t.cur = cur;
    if (total !== t.dur) this.el.dur.textContent = t.dur = total;
  }
}

// Horizontal slider: onMove while dragging, onEnd on release, both with the position from 0 to 1
function slider(target: HTMLElement, onMove: (f: number) => void, onEnd: (f: number) => void) {
  const frac = (e: PointerEvent) => { const r = target.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  target.addEventListener('pointerdown', (e) => { target.setPointerCapture(e.pointerId); target.classList.add('drag'); onMove(frac(e)); });
  target.addEventListener('pointermove', (e) => { if (target.classList.contains('drag')) onMove(frac(e)); });
  target.addEventListener('pointerup', (e) => {
    if (!target.classList.contains('drag')) return;
    target.classList.remove('drag');
    onEnd(frac(e));
  });
}

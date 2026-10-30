// SoundCloud timed comments on screen: bubbles float up at the exact second each comment was written,
// with markers on the timeline. Bubbles never overlap each other or the controls, keep clear of the
// artwork and title while there is room beside them, and on busy songs wait their turn.
import type { NuclearPluginAPI, Track } from '@nuclearplayer/plugin-sdk';

import { t } from '../i18n';
import { esc } from '../lib/format';
import { SoundCloudClient, type TimedComment } from '../soundcloud/client';
import { restartAnimation } from './template';

const MAX_BUBBLES = 4;
// Lifetime of a bubble: fades in, floats up with a gentle sway, fades out (keyframes in styles/comments.ts)
const BUBBLE_MS = 7000;
// How far a bubble rises over its lifetime; its whole path must stay clear
const DRIFT_PX = 50;
// Busy songs: at most one new bubble this often, the rest wait their turn
const SPAWN_GAP_MS = 900;
// A comment is dropped once it is this far behind the music
const MAX_LATE_MS = 5000;
const MAX_WAITING = 6;
// Free space kept around each bubble, and between bubbles and the window edges, in pixels
const SPACING = 12;
const EDGE_PX = 16;
const PLACEMENT_TRIES = 60;
// Widest bubble, and the narrowest side strip worth keeping the artwork and title clear for
const MAX_WIDTH_PX = 380;
const MIN_SIDE_PX = 200;

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + SPACING && b.x < a.x + a.w + SPACING && a.y < b.y + b.h + SPACING && b.y < a.y + a.h + SPACING;

export class CommentBubbles {
  private token = 0;
  private comments: TimedComment[] = [];
  private ptr = 0;
  private lastMs = 0;
  private durationMs = 0;
  private enabled = true;
  private client: SoundCloudClient;
  private waiting: TimedComment[] = [];
  private lastSpawn = 0;
  // Space taken by the bubbles on screen (including their upward path), oldest first, and when each one leaves
  private taken: (Box & { until: number })[] = [];
  // The next bubble, built and measured once and kept (hidden) until it finds a spot
  private next: { c: TimedComment; el: HTMLElement } | null = null;

  // `avoid.never`: parts bubbles must never cover (controls, buttons…). `avoid.ifRoom`: parts they keep
  // clear of while there is space elsewhere (artwork, title); on small windows they may go over them.
  constructor(api: NuclearPluginAPI, private layer: HTMLElement, private markers: HTMLElement,
    private avoid: { never: HTMLElement[]; ifRoom: HTMLElement[] }, private onStatus: (text: string) => void) {
    this.client = new SoundCloudClient(api);
    // Shared by every bubble (see styles/comments.ts)
    layer.style.setProperty('--life', `${BUBBLE_MS}ms`);
    layer.style.setProperty('--drift', `-${DRIFT_PX}px`);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.layer.style.display = on ? '' : 'none';
    this.markers.style.display = on ? '' : 'none';
    if (!on) this.clear();
    this.onStatus(this.statusText());
  }

  // Removes the bubbles currently on screen and the ones waiting to appear
  clear() {
    this.waiting = [];
    this.taken = [];
    this.next = null;
    this.layer.innerHTML = '';
  }

  private statusText() {
    return this.enabled && this.comments.length ? t('comments', { n: this.comments.length }) : '';
  }

  async load(track: Track | undefined) {
    const token = ++this.token;
    this.comments = []; this.ptr = 0; this.lastMs = 0;
    this.clear(); this.markers.innerHTML = '';
    this.onStatus('');
    if (!track) return;
    try {
      const sc = await this.client.findTrack(track);
      if (token !== this.token || !sc) return;
      this.durationMs = track.durationMs || sc.duration || 0;
      const comments = await this.client.fetchComments(sc.id);
      if (token !== this.token) return;
      this.comments = comments;
      this.drawMarkers();
      this.onStatus(this.statusText());
    } catch (e) {
      console.warn('[Now Playing] SoundCloud comments:', e);
    }
  }

  // Call every frame with the current position
  update(positionSeconds: number, playing: boolean) {
    if (!this.enabled || !this.comments.length) return;
    const ms = positionSeconds * 1000;
    if (Math.abs(ms - this.lastMs) > 2500) {
      // Seek: reposition the pointer without releasing every comment in between
      this.ptr = this.comments.findIndex((c) => c.ts >= ms);
      if (this.ptr < 0) this.ptr = this.comments.length;
      this.waiting = [];
    }
    this.lastMs = ms;
    if (!playing) return;
    while (this.ptr < this.comments.length && this.comments[this.ptr].ts <= ms) this.waiting.push(this.comments[this.ptr++]);
    if (this.waiting.length > MAX_WAITING) this.waiting.splice(0, this.waiting.length - MAX_WAITING);
    while (this.waiting.length && ms - this.waiting[0].ts >= MAX_LATE_MS) this.waiting.shift();
    if (this.next && this.next.c !== this.waiting[0]) { this.next.el.remove(); this.next = null; }
    const now = performance.now();
    if (!this.waiting.length || now - this.lastSpawn < SPAWN_GAP_MS) return;
    while (this.taken.length && this.taken[0].until <= now) this.taken.shift();
    if (this.taken.length >= MAX_BUBBLES) return;
    // Whether it fits or not, wait for the next slot before trying again
    this.lastSpawn = now;
    if (this.spawn(this.waiting[0], now)) this.waiting.shift();
  }

  // Shows a bubble in a free spot; returns false (and keeps it hidden for the next try) when there is no room yet
  private spawn(c: TimedComment, now: number) {
    if (this.next?.c !== c) {
      this.next?.el.remove();
      const el = document.createElement('div');
      el.className = 'sc-bubble';
      el.style.visibility = 'hidden';
      // Each bubble starts its sway at a different point so they do not move in step
      el.innerHTML = `<div class="sc-sway" style="animation-delay:-${Math.round(Math.random() * 3000)}ms">` +
        `${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<div><b>${esc(c.user)}</b><span>${esc(c.body)}</span></div></div>`;
      this.layer.appendChild(el);
      this.next = { c, el };
    }
    const { el } = this.next;
    // Narrow enough to fit beside the artwork and title; only when there is no such room (small
    // windows) may it go over them. With room but no free spot right now, it waits its turn.
    const area = this.layer.getBoundingClientRect();
    const ifRoom = this.boxes(this.avoid.ifRoom, area);
    const side = this.sideRoom(ifRoom, area);
    const keepClear = side >= MIN_SIDE_PX;
    el.style.maxWidth = keepClear ? `${Math.min(MAX_WIDTH_PX, side)}px` : '';
    const blocked = [...this.boxes(this.avoid.never, area), ...(keepClear ? ifRoom : []), ...this.taken];
    const spot = this.findSpot(el.offsetWidth, el.offsetHeight, area, blocked);
    if (!spot) return false;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y + DRIFT_PX}px`;
    // Restart its animation, which has been running while it waited hidden
    restartAnimation(el);
    el.style.visibility = '';
    this.next = null;
    this.taken.push({ ...spot, until: now + BUBBLE_MS });
    setTimeout(() => el.remove(), BUBBLE_MS);
    return true;
  }

  // Visible elements as boxes relative to the layer
  private boxes(els: HTMLElement[], area: DOMRect): Box[] {
    return els.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ x: r.left - area.left, y: r.top - area.top, w: r.width, h: r.height }));
  }

  // Width of the widest free strip to the left or right of the given boxes (artwork and title)
  private sideRoom(boxes: Box[], area: DOMRect) {
    if (!boxes.length) return area.width;
    const left = Math.min(...boxes.map((b) => b.x));
    const right = area.width - Math.max(...boxes.map((b) => b.x + b.w));
    return Math.max(left, right) - EDGE_PX - SPACING;
  }

  // Random spot whose whole upward path touches none of the blocked boxes
  private findSpot(w: number, h: number, area: DOMRect, blocked: Box[]): Box | null {
    const path = h + DRIFT_PX;
    const maxX = area.width - w - EDGE_PX, maxY = area.height - path - EDGE_PX;
    if (maxX < EDGE_PX || maxY < EDGE_PX) return null;
    for (let i = 0; i < PLACEMENT_TRIES; i++) {
      const box = { x: EDGE_PX + Math.random() * (maxX - EDGE_PX), y: EDGE_PX + Math.random() * (maxY - EDGE_PX), w, h: path };
      if (!blocked.some((b) => overlaps(box, b))) return box;
    }
    return null;
  }

  private drawMarkers() {
    if (!this.durationMs) return;
    // Bucket by approximate pixel so thousands of comments do not become thousands of markers
    const buckets = new Map<number, number>();
    for (const c of this.comments) {
      const b = Math.round((c.ts / this.durationMs) * 400);
      if (b >= 0 && b <= 400) buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const max = Math.max(1, ...buckets.values());
    this.markers.innerHTML = Array.from(buckets, ([b, n]) =>
      `<i style="left:${b / 4}%;height:${4 + (n / max) * 8}px"></i>`).join('');
  }
}

// SoundCloud timed comments: they float on screen at the exact second they were written,
// with markers on the timeline. Works even when the song does not stream from SoundCloud:
// it is looked up there and only accepted when the title matches plus the artist or duration.
import { t } from './i18n';
import { esc, httpJson, httpText, norm, storage } from './util';

const API = 'https://api-v2.soundcloud.com';
const MAX_BUBBLES = 4;
// Lifetime of a bubble: fades in, floats up with a gentle sway, fades out (keyframes in styles.ts)
const BUBBLE_MS = 7000;
// How far a bubble rises over its lifetime; its whole path must stay clear
const DRIFT_PX = 50;
// Busy songs: at most one new bubble this often, the rest wait their turn
const SPAWN_GAP_MS = 900;
// A comment is dropped once it is this far behind the music
const MAX_LATE_MS = 5000;
const MAX_WAITING = 6;
// Free space kept around each bubble and around the screen's own content, in pixels
const SPACING = 12;
const PLACEMENT_TRIES = 60;
// Widest bubble, and the narrowest side strip worth keeping the artwork and title clear for
const MAX_WIDTH_PX = 380;
const MIN_SIDE_PX = 200;

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + SPACING && b.x < a.x + a.w + SPACING && a.y < b.y + b.h + SPACING && b.y < a.y + a.h + SPACING;

type Comment = { ts: number; body: string; user: string; avatar: string };

export class SoundCloudComments {
  private token = 0;
  private comments: Comment[] = [];
  private ptr = 0;
  private lastMs = 0;
  private durationMs = 0;
  private enabled = true;
  private clientId = storage.get('npx-sc', { clientId: '' }).clientId;
  private waiting: Comment[] = [];
  private lastSpawn = 0;
  // Space taken by the bubbles on screen (including their upward path) and when each one leaves
  private taken: (Box & { until: number })[] = [];

  // `avoid.never`: parts bubbles must never cover (controls, buttons…). `avoid.ifRoom`: parts they keep
  // clear of while there is space elsewhere (artwork, title); on small windows they may go over them.
  constructor(private api: any, private layer: HTMLElement, private markers: HTMLElement,
    private avoid: { never: HTMLElement[]; ifRoom: HTMLElement[] }, private onStatus: (text: string) => void) {}

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
    this.layer.innerHTML = '';
  }

  private statusText() {
    return this.enabled && this.comments.length ? t('comments', { n: this.comments.length }) : '';
  }

  async load(track: any) {
    const token = ++this.token;
    this.comments = []; this.ptr = 0; this.lastMs = 0;
    this.clear(); this.markers.innerHTML = '';
    this.onStatus('');
    if (!track) return;
    try {
      const sc = await this.findTrack(track);
      if (token !== this.token || !sc) return;
      this.durationMs = track.durationMs || sc.duration || 0;
      const comments = await this.fetchComments(sc.id);
      if (token !== this.token) return;
      this.comments = comments.sort((a, b) => a.ts - b.ts);
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
    while (this.ptr < this.comments.length && this.comments[this.ptr].ts <= ms) {
      const c = this.comments[this.ptr++];
      if (ms - c.ts < MAX_LATE_MS) this.waiting.push(c);
    }
    if (!this.waiting.length) return;
    if (this.waiting.length > MAX_WAITING) this.waiting.splice(0, this.waiting.length - MAX_WAITING);
    while (this.waiting.length && ms - this.waiting[0].ts >= MAX_LATE_MS) this.waiting.shift();
    const now = performance.now();
    if (!this.waiting.length || now - this.lastSpawn < SPAWN_GAP_MS) return;
    this.taken = this.taken.filter((b) => b.until > now);
    if (this.taken.length >= MAX_BUBBLES) return;
    // Whether it fits or not, wait for the next slot before trying again
    this.lastSpawn = now;
    if (this.spawn(this.waiting[0], now)) this.waiting.shift();
  }

  // Shows a bubble in a free spot; returns false (and shows nothing) when there is no room yet
  private spawn(c: Comment, now: number) {
    const el = document.createElement('div');
    el.className = 'sc-bubble';
    el.style.visibility = 'hidden';
    el.style.animationDuration = `${BUBBLE_MS}ms`;
    el.style.setProperty('--drift', `-${DRIFT_PX}px`);
    // Each bubble starts its sway at a different point so they do not move in step
    el.innerHTML = `<div class="sc-sway" style="animation-delay:-${Math.round(Math.random() * 3000)}ms">` +
      `${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<div><b>${esc(c.user)}</b><span>${esc(c.body)}</span></div></div>`;
    this.layer.appendChild(el);
    // Narrow enough to fit beside the artwork and title; only when there is no such room (small
    // windows) may it go over them. With room but no free spot right now, it waits its turn.
    const side = this.sideRoom();
    let spot: Box | null;
    if (side >= MIN_SIDE_PX) {
      el.style.maxWidth = `${Math.min(MAX_WIDTH_PX, side)}px`;
      spot = this.findSpot(el.offsetWidth, el.offsetHeight, true);
    } else {
      spot = this.findSpot(el.offsetWidth, el.offsetHeight, false);
    }
    if (!spot) { el.remove(); return false; }
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y + DRIFT_PX}px`;
    el.style.visibility = '';
    this.taken.push({ ...spot, until: now + BUBBLE_MS });
    setTimeout(() => el.remove(), BUBBLE_MS);
    return true;
  }

  // Width of the widest free strip to the left or right of the artwork and title
  private sideRoom() {
    const area = this.layer.getBoundingClientRect();
    const rects = this.avoid.ifRoom.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rects.length) return area.width;
    const left = Math.min(...rects.map((r) => r.left)) - area.left;
    const right = area.right - Math.max(...rects.map((r) => r.right));
    return Math.max(left, right) - 16 - SPACING;
  }

  // Random spot whose whole upward path touches neither another bubble nor the screen's content
  private findSpot(w: number, h: number, keepClear: boolean): Box | null {
    const area = this.layer.getBoundingClientRect();
    const blocked: Box[] = (keepClear ? [...this.avoid.never, ...this.avoid.ifRoom] : this.avoid.never)
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => ({ x: r.left - area.left, y: r.top - area.top, w: r.width, h: r.height }));
    blocked.push(...this.taken);
    const path = h + DRIFT_PX;
    const maxX = area.width - w - 16, maxY = area.height - path - 16;
    if (maxX < 16 || maxY < 16) return null;
    for (let i = 0; i < PLACEMENT_TRIES; i++) {
      const box = { x: 16 + Math.random() * (maxX - 16), y: 16 + Math.random() * (maxY - 16), w, h: path };
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

  // --- SoundCloud API ---

  private async getClientId(force = false): Promise<string> {
    if (this.clientId && !force) return this.clientId;
    const home = await httpText(this.api, 'https://soundcloud.com/');
    const scripts = Array.from(home.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)).map((m) => m[1]);
    for (const src of scripts.reverse()) {
      const js = await httpText(this.api, src).catch(() => '');
      const m = js.match(/client_id\s*:\s*"([A-Za-z0-9]{32})"/);
      if (m) {
        this.clientId = m[1];
        storage.set('npx-sc', { clientId: this.clientId });
        return this.clientId;
      }
    }
    throw new Error('SoundCloud client_id not found');
  }

  private async get(path: string): Promise<any> {
    const sep = path.includes('?') ? '&' : '?';
    const url = (path.startsWith('http') ? path : API + path) + sep + 'client_id=';
    try {
      return await httpJson(this.api, url + (await this.getClientId()));
    } catch (e: any) {
      if (!/HTTP 40[13]/.test(String(e?.message))) throw e;
      return httpJson(this.api, url + (await this.getClientId(true))); // expired client_id
    }
  }

  private async findTrack(track: any): Promise<{ id: number; duration: number } | null> {
    const src = track.source || {};
    if (/soundcloud/i.test(src.provider || '')) {
      if (/^\d+$/.test(String(src.id))) return { id: +src.id, duration: track.durationMs || 0 };
      const url = src.url || (String(src.id).startsWith('http') ? src.id : '');
      if (url) {
        const r = await this.get(`/resolve?url=${encodeURIComponent(url)}`).catch(() => null);
        if (r?.kind === 'track') return { id: r.id, duration: r.duration };
      }
    }
    const title = track.title || '';
    const artists = (track.artists || []).map((a: any) => a.name);
    const res = await this.get(`/search/tracks?q=${encodeURIComponent(`${artists[0] || ''} ${title}`.trim())}&limit=15`);
    const wanted = norm(title.replace(/\s*[-(\[].*(instrumental|remix|vip|edit|mix).*$/i, '') || title);
    let best: any = null, bestScore = 0;
    for (const c of res.collection || []) {
      const ct = norm(c.title);
      const titleOk = wanted.length > 1 && (ct.includes(wanted) || wanted.includes(ct));
      if (!titleOk) continue;
      const who = norm(`${c.user?.username || ''} ${c.publisher_metadata?.artist || ''} ${c.title}`);
      const artistOk = artists.some((a: string) => norm(a).length > 1 && who.includes(norm(a)));
      const durOk = track.durationMs ? Math.abs((c.duration || 0) - track.durationMs) < 4000 : false;
      const score = (artistOk ? 2 : 0) + (durOk ? 2 : 0) + (ct === wanted ? 1 : 0) + Math.min(1, (c.comment_count || 0) / 100);
      if ((artistOk || durOk) && score > bestScore) { best = c; bestScore = score; }
    }
    return best ? { id: best.id, duration: best.duration } : null;
  }

  private async fetchComments(id: number): Promise<Comment[]> {
    const out: Comment[] = [];
    let path: string | null = `/tracks/${id}/comments?threaded=0&filter_replies=1&limit=200&offset=0`;
    for (let page = 0; path && page < 5; page++) {
      const data: any = await this.get(path);
      for (const c of data.collection || []) {
        if (typeof c.timestamp !== 'number' || !c.body) continue;
        out.push({ ts: c.timestamp, body: c.body, user: c.user?.username || '', avatar: c.user?.avatar_url || '' });
      }
      path = data.next_href ? String(data.next_href).replace(/([?&])client_id=[^&]*&?/, '$1') : null;
    }
    return out;
  }
}

// SoundCloud timed comments: they float on screen at the exact second they were written,
// with markers on the timeline. Works even when the song does not stream from SoundCloud:
// it is looked up there and only accepted when the title matches plus the artist or duration.
import { t } from './i18n';
import { esc, httpJson, httpText, norm, storage } from './util';

const API = 'https://api-v2.soundcloud.com';
const MAX_BUBBLES = 4;
const BUBBLE_MS = 7000;
// Exit fade length; must match the .sc-bubble.out transition in styles.ts
const FADE_MS = 900;
// Busy songs: at most one new bubble this often, the rest wait their turn
const SPAWN_GAP_MS = 900;
// A waiting comment is dropped once it is this far behind the music
const MAX_LATE_MS = 5000;
const MAX_WAITING = 6;
// Free space kept around each bubble, in pixels
const SPACING = 12;
const PLACEMENT_TRIES = 24;

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
  private timers = new Set<number>();

  constructor(private api: any, private layer: HTMLElement, private markers: HTMLElement, private onStatus: (text: string) => void) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    this.layer.style.display = on ? '' : 'none';
    this.markers.style.display = on ? '' : 'none';
    if (!on) this.clear();
    this.onStatus(this.statusText());
  }

  // Removes the bubbles currently on screen and the ones waiting to appear
  clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.waiting = [];
    this.layer.innerHTML = '';
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
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
      if (ms - c.ts < 1500) this.waiting.push(c);
    }
    // Keep only the newest few and forget the ones the music has left behind
    this.waiting = this.waiting.filter((c) => ms - c.ts < MAX_LATE_MS).slice(-MAX_WAITING);
    const now = performance.now();
    if (!this.waiting.length || now - this.lastSpawn < SPAWN_GAP_MS) return;
    if (this.layer.querySelectorAll('.sc-bubble:not(.out)').length >= MAX_BUBBLES) return;
    if (this.spawn(this.waiting[0])) { this.waiting.shift(); this.lastSpawn = now; }
  }

  // Shows a bubble in a free spot; returns false (and shows nothing) when there is no room yet
  private spawn(c: Comment) {
    const el = document.createElement('div');
    el.className = 'sc-bubble';
    el.style.visibility = 'hidden';
    el.innerHTML = `${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}<div><b>${esc(c.user)}</b><span>${esc(c.body)}</span></div>`;
    this.layer.appendChild(el);
    const spot = this.findSpot(el.offsetWidth, el.offsetHeight, el);
    if (!spot) { el.remove(); return false; }
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
    el.style.visibility = '';
    this.later(() => {
      el.classList.add('out');
      this.later(() => el.remove(), FADE_MS);
    }, BUBBLE_MS - FADE_MS);
    return true;
  }

  // Random position in the same area as before (upper-left two thirds) that touches no other bubble
  private findSpot(w: number, h: number, self: HTMLElement) {
    const W = this.layer.clientWidth, H = this.layer.clientHeight;
    const taken = Array.from(this.layer.querySelectorAll<HTMLElement>('.sc-bubble'))
      .filter((b) => b !== self)
      .map((b) => ({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }));
    const maxX = Math.max(0, Math.min(W * 0.56, W - w - 16)), minX = W * 0.04;
    const maxY = Math.max(0, Math.min(H * 0.63, H - h - 16)), minY = H * 0.08;
    for (let i = 0; i < PLACEMENT_TRIES; i++) {
      const x = minX + Math.random() * Math.max(0, maxX - minX), y = minY + Math.random() * Math.max(0, maxY - minY);
      const clear = taken.every((r) => x + w + SPACING <= r.x || r.x + r.w + SPACING <= x || y + h + SPACING <= r.y || r.y + r.h + SPACING <= y);
      if (clear) return { x, y };
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

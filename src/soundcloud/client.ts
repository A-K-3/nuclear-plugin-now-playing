// SoundCloud's public web API: finds the SoundCloud upload of a track and reads its timed comments.
// Works even when the song does not stream from SoundCloud: it is looked up there and only accepted
// when the title matches plus the artist or the duration.
import type { NuclearPluginAPI, Track } from '@nuclearplayer/plugin-sdk';

import { norm } from '../lib/format';
import { httpJson, httpText } from '../lib/http';
import { storage } from '../lib/storage';
import { VERSION_WORDS } from '../lib/track';

const API = 'https://api-v2.soundcloud.com';
const CLIENT_ID_KEY = 'npx-sc';
const COMMENT_PAGES = 5; // 200 comments each
// "Song (Remix)" or "Song - VIP" is searched as "Song"
const VERSION_SUFFIX = new RegExp(`\\s*[-([].*(${VERSION_WORDS.join('|')}).*$`, 'i');

export type TimedComment = { ts: number; body: string; user: string; avatar: string };
type SoundCloudTrack = { id: number; duration: number };

type ApiTrack = {
  kind?: string; id: number; title: string; duration?: number; comment_count?: number;
  user?: { username?: string }; publisher_metadata?: { artist?: string };
};
type ApiComment = { timestamp?: number; body?: string; user?: { username?: string; avatar_url?: string } };
type Page<T> = { collection?: T[]; next_href?: string | null };

export class SoundCloudClient {
  private clientId = storage.get(CLIENT_ID_KEY, { clientId: '' }).clientId;

  constructor(private api: NuclearPluginAPI) {}

  async findTrack(track: Track): Promise<SoundCloudTrack | null> {
    const src = track.source as Track['source'] & { url?: string };
    if (/soundcloud/i.test(src.provider || '')) {
      if (/^\d+$/.test(String(src.id))) return { id: +src.id, duration: track.durationMs || 0 };
      const url = src.url || (String(src.id).startsWith('http') ? String(src.id) : '');
      if (url) {
        const r = await this.get<ApiTrack>(`/resolve?url=${encodeURIComponent(url)}`).catch(() => null);
        if (r?.kind === 'track') return { id: r.id, duration: r.duration || 0 };
      }
    }
    const title = track.title || '';
    const artists = (track.artists || []).map((a) => a.name);
    const res = await this.get<Page<ApiTrack>>(`/search/tracks?q=${encodeURIComponent(`${artists[0] || ''} ${title}`.trim())}&limit=15`);
    const wanted = norm(title.replace(VERSION_SUFFIX, '') || title);
    let best: ApiTrack | null = null, bestScore = 0;
    for (const c of res.collection || []) {
      const ct = norm(c.title);
      const titleOk = wanted.length > 1 && (ct.includes(wanted) || wanted.includes(ct));
      if (!titleOk) continue;
      const who = norm(`${c.user?.username || ''} ${c.publisher_metadata?.artist || ''} ${c.title}`);
      const artistOk = artists.some((a) => norm(a).length > 1 && who.includes(norm(a)));
      const durOk = track.durationMs ? Math.abs((c.duration || 0) - track.durationMs) < 4000 : false;
      const score = (artistOk ? 2 : 0) + (durOk ? 2 : 0) + (ct === wanted ? 1 : 0) + Math.min(1, (c.comment_count || 0) / 100);
      if ((artistOk || durOk) && score > bestScore) { best = c; bestScore = score; }
    }
    return best ? { id: best.id, duration: best.duration || 0 } : null;
  }

  async fetchComments(id: number): Promise<TimedComment[]> {
    const out: TimedComment[] = [];
    let path: string | null = `/tracks/${id}/comments?threaded=0&filter_replies=1&limit=200&offset=0`;
    for (let page = 0; path && page < COMMENT_PAGES; page++) {
      const data: Page<ApiComment> = await this.get<Page<ApiComment>>(path);
      for (const c of data.collection || []) {
        if (typeof c.timestamp !== 'number' || !c.body) continue;
        out.push({ ts: c.timestamp, body: c.body, user: c.user?.username || '', avatar: c.user?.avatar_url || '' });
      }
      path = data.next_href ? String(data.next_href).replace(/([?&])client_id=[^&]*&?/, '$1') : null;
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  // The web app's client_id, read from its scripts and remembered between sessions
  private async getClientId(force = false): Promise<string> {
    if (this.clientId && !force) return this.clientId;
    const home = await httpText(this.api, 'https://soundcloud.com/');
    const scripts = Array.from(home.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)).map((m) => m[1]);
    for (const src of scripts.reverse()) {
      const js = await httpText(this.api, src).catch(() => '');
      const m = js.match(/client_id\s*:\s*"([A-Za-z0-9]{32})"/);
      if (m) {
        this.clientId = m[1];
        storage.set(CLIENT_ID_KEY, { clientId: this.clientId });
        return this.clientId;
      }
    }
    throw new Error('SoundCloud client_id not found');
  }

  private async get<T>(path: string): Promise<T> {
    const sep = path.includes('?') ? '&' : '?';
    const url = (path.startsWith('http') ? path : API + path) + sep + 'client_id=';
    try {
      return await httpJson<T>(this.api, url + (await this.getClientId()));
    } catch (e) {
      if (!/HTTP 40[13]/.test(String((e as Error)?.message))) throw e;
      return httpJson<T>(this.api, url + (await this.getClientId(true))); // expired client_id
    }
  }
}

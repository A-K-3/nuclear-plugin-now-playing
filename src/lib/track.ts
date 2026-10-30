// What to show for a track: title and artist as people read them, and its artwork
import type { Artwork, Track } from '@nuclearplayer/plugin-sdk';

import { esc } from './format';

// "beansclub - crossroad" uploaded by a label → title "crossroad", artist "beansclub"
const VERSION = /^(instrumental|remix|edit|mix|vip|extended|live|demo|radio edit|sped up|slowed)\b/i;

export function display(track: Track | undefined) {
  let title = track?.title || '';
  let artist = (track?.artists || []).map((a) => a.name).join(', ');
  const m = title.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (m && !VERSION.test(m[2])) { artist = m[1]; title = m[2]; }
  return { title, artist };
}

// Largest artwork for the big cover, smallest usable one (at least 64 px) for thumbnails
export function art(track: Track | undefined, big: boolean): string {
  const items = [...(track?.artwork?.items || []), ...(track?.album?.artwork?.items || [])]
    .filter((a) => a.purpose !== 'avatar');
  if (!items.length) return '';
  const w = (a: Artwork) => a.width || (a.purpose === 'thumbnail' ? 100 : 500);
  if (big) return items.reduce((a, b) => (w(b) > w(a) ? b : a)).url;
  const small = items.filter((a) => w(a) >= 64);
  return (small.length ? small : items).reduce((a, b) => (w(b) < w(a) ? b : a)).url;
}

// Fallback artwork: a gradient with a hue derived from the title, plus its initials
export function fallbackCover(title: string, artist: string): string {
  let h = 0;
  for (const ch of `${title}|${artist}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360, hue2 = (hue + 50) % 360;
  const initials = (title || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},65%,45%)"/><stop offset="1" stop-color="hsl(${hue2},70%,22%)"/></linearGradient></defs>
    <rect width="600" height="600" fill="url(#g)"/>
    <text x="50%" y="54%" font-family="Segoe UI,Arial,sans-serif" font-size="210" font-weight="700"
      fill="rgba(255,255,255,.85)" text-anchor="middle" dominant-baseline="middle">${esc(initials)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
}

// Artwork URL for a track, or the generated fallback; '' without a track
export function coverFor(track: Track | undefined, big: boolean) {
  if (!track) return '';
  const d = display(track);
  return art(track, big) || fallbackCover(d.title, d.artist);
}

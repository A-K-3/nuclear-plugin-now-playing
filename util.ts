// Helpers shared by the plugin modules

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtLong = (s: number) => {
  const m = Math.round(s / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
};

export const norm = (s: string) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, '');

// "beansclub - crossroad" uploaded by a label → title "crossroad", artist "beansclub"
const VERSION = /^(instrumental|remix|edit|mix|vip|extended|live|demo|radio edit|sped up|slowed)\b/i;
export function display(track: any) {
  let title = track?.title || '';
  let artist = (track?.artists || []).map((a: any) => a.name).join(', ');
  const m = title.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (m && !VERSION.test(m[2])) { artist = m[1]; title = m[2]; }
  return { title, artist };
}

export function art(track: any, big: boolean): string {
  const items = [...(track?.artwork?.items || []), ...(track?.album?.artwork?.items || [])]
    .filter((a: any) => a.purpose !== 'avatar');
  if (!items.length) return '';
  const w = (a: any) => a.width || (a.purpose === 'thumbnail' ? 100 : 500);
  if (big) return items.reduce((a: any, b: any) => (w(b) > w(a) ? b : a)).url;
  const small = items.filter((a: any) => w(a) >= 64);
  return (small.length ? small : items).reduce((a: any, b: any) => (w(b) < w(a) ? b : a)).url;
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

// Dominant color (ignores near-white, near-black and greys). null when the canvas is CORS-tainted
export function accentFrom(img: HTMLImageElement) {
  try {
    const c = document.createElement('canvas'), n = 24;
    c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    let best: number[] | null = null, bestScore = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      sum[0] += r; sum[1] += g; sum[2] += b;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
      const score = sat * (max / 255) * (max > 40 && max < 250 ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = [r, g, b]; }
    }
    const px = d.length / 4, avg = sum.map((v) => Math.round(v / px));
    if (!best || bestScore < 0.25) return { accent: '#ffffff', tint: avg };
    const k = 255 / Math.max(...best);
    const light = best.map((v) => Math.min(255, Math.round(v * k * 0.9 + 25)));
    return { accent: `rgb(${light})`, tint: best };
  } catch {
    return null;
  }
}

export const loadImage = (src: string, cors: boolean, timeoutMs = 5000) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    im.onload = () => { clearTimeout(timer); resolve(im); };
    im.onerror = () => { clearTimeout(timer); resolve(null); };
    im.src = src;
  });

// api.Http.fetch returns the body as text (fine for JSON/HTML, not for images)
// and has no timeout of its own: one is added here.
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Timeout for a promise; onTimeout returns a fallback value or throws. Clears its timer.
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer = 0;
  const expiry = new Promise<T>((resolve, reject) => {
    timer = window.setTimeout(() => { try { resolve(onTimeout()); } catch (e) { reject(e); } }, ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

// Button style for the settings widgets
export const BUTTON_STYLE = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer',
};

// User-Agent: Spotify only includes the og:* metadata in the HTML for a simple agent.
export const UA_SIMPLE = 'Mozilla/5.0';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36';

export async function httpText(api: any, url: string, timeoutMs = 12000, userAgent = UA_BROWSER): Promise<string> {
  const res: any = await withTimeout(api.Http.fetch(url, { headers: { 'User-Agent': userAgent } }), timeoutMs, () => {
    throw new Error(`Tiempo agotado: ${url}`);
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

export const httpJson = async (api: any, url: string, timeoutMs?: number) => JSON.parse(await httpText(api, url, timeoutMs));

// Runs tasks at most N at a time, keeping results in order
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

// Image loading and the accent colour taken from the artwork
import { withTimeout } from './http';

const LOAD_TIMEOUT_MS = 5000;

// The loaded image, or null on error or timeout
const loadImage = (src: string, cors: boolean) =>
  withTimeout(new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  }), LOAD_TIMEOUT_MS, () => null);

// accent as CSS and as numbers, the cover's own colour, and the artwork scaled down to grid × grid
// pixels (CSS colours, row by row)
export type Colors = { accent: string; accentRgb: number[]; tint: number[]; grid: number; pixels: string[] };
export const PIXEL_GRID = 24;

// Dominant colour (ignores near-white, near-black and greys). null when the canvas is CORS-tainted
function accentFrom(img: HTMLImageElement): Colors | null {
  try {
    const c = document.createElement('canvas'), n = PIXEL_GRID;
    c.width = c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    let best: number[] | null = null, bestScore = 0;
    const sum = [0, 0, 0], pixels: string[] = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      sum[0] += r; sum[1] += g; sum[2] += b;
      pixels.push(`rgb(${r}, ${g}, ${b})`);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0;
      const score = sat * (max / 255) * (max > 40 && max < 250 ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = [r, g, b]; }
    }
    const px = d.length / 4, avg = sum.map((v) => Math.round(v / px));
    if (!best || bestScore < 0.25) return { accent: '#ffffff', accentRgb: [255, 255, 255], tint: avg, grid: n, pixels };
    const k = 255 / Math.max(...best);
    const light = best.map((v) => Math.min(255, Math.round(v * k * 0.9 + 25)));
    return { accent: `rgb(${light})`, accentRgb: light, tint: best, grid: n, pixels };
  } catch {
    return null;
  }
}

// Accent colours for an artwork URL (data: URLs need no CORS)
export async function coverColors(url: string) {
  const im = await loadImage(url, !url.startsWith('data:'));
  return im && accentFrom(im);
}

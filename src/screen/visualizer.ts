// Draws the analysed spectrum in the player. Along the bottom: bars (bass on the left), a mirrored
// wave (bass at both edges, beside the controls, where it stays visible) or an LED meter. Around the
// artwork, over the whole player: a ring of bars, sparks (see sparks.ts), or a glow that lights the
// background with the music. It fades in with a real signal and out without one, and skips
// redrawing while nothing changes.
import { BANDS, type AudioAnalyser } from '../audio/analyser';
import type { Colors } from '../lib/image';
import { clamp, ease, frames } from '../lib/math';
import type { Prefs } from '../settings';
import { roundedSquare } from './outline';
import { SparkField, type Rect } from './sparks';

// What the visualizer reads from the artwork (see Artwork)
type ArtworkColors = { accent: string; colors: { version: number; data: Colors | null } };

type Mode = Prefs['visualizer'];

const FADE = 0.08;
const WAVE_POINTS = BANDS * 2 - 1;
// Modes drawn over the whole player, around the artwork, instead of along the bottom
const AROUND_COVER: Mode[] = ['ring', 'particles', 'glow'];
// The glow is soft anyway: drawn at a fraction of the resolution and scaled up by the browser
const GLOW_RESOLUTION = 0.2;

// peakMinRow: peak cells only from this row up (lower ones would only flicker)
const LED = { cols: 32, rows: 14, hot: 0.8, warm: 0.6, hotColor: '#ff6b8b', warmColor: '#ffd166', offAlpha: 0.1, peakAlpha: 0.85, peakMinRow: 2 };
// Lengths in CSS px: edge (space kept free at the canvas edge), peakGap (peak dot past its bar), dot (its radius)
const RING = { bars: 128, gap: 10, maxLength: 0.42, width: 0.45, edge: 10, peakGap: 6, dot: 1.6, peakMin: 0.04, peakAlpha: 0.8, glow: 0.22, glowKick: 0.35 };
// Peak marks hold at the highest level, then fall faster and faster (per 60 fps frame)
const PEAK_FALL = 0.0007;

// The highest recent level of each band, falling slowly
class Peaks {
  readonly at: Float32Array;
  private speed: Float32Array;
  constructor(n: number) { this.at = new Float32Array(n); this.speed = new Float32Array(n); }
  update(i: number, level: number, step: number) {
    if (level >= this.at[i]) { this.at[i] = level; this.speed[i] = 0; return; }
    this.speed[i] += PEAK_FALL * step;
    this.at[i] = Math.max(level, this.at[i] - this.speed[i] * step);
  }
}

export class SpectrumView {
  private mode: Mode = 'bars';
  private g: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;
  // Where the artwork sits on the canvas (CSS pixels): its centre, and half its size without the tilt
  // and beat transforms
  private coverAt = { cx: 0, cy: 0, half: 0 };
  // The canvas on the page, the parts sparks dim over (title, lyrics) and the cursor, in CSS pixels
  // relative to the canvas
  private area = { left: 0, top: 0 };
  private avoidAt: Rect[] = [];
  private pointerAt: { x: number; y: number } | null = null;
  private colorsVersion = -1;
  private sparkOptions: { style: Prefs['sparkStyle']; amount: Prefs['sparkAmount']; reducedMotion: boolean } =
    { style: 'burst', amount: 'normal', reducedMotion: false };
  private opacity = 0;
  private dirty = true;
  private lastColor = '';
  private gradient: CanvasGradient | null = null;
  private gradientFor = { mode: '', color: '', h: 0 };
  private waveLevels = new Float32Array(WAVE_POINTS);
  private resize: ResizeObserver;
  // Ring: points around a rounded square of half size 1 (x, y) and their outward direction (dx, dy)
  private outline = roundedSquare(RING.bars);
  // State of the modes that move on their own, reset when the mode changes: the sparks, and each
  // band's peak (LED and ring)
  private sparks = new SparkField();
  private peaks = new Peaks(BANDS);
  private glowTime = 0;

  // `avoid`: what sparks dim over (title, lyrics)
  constructor(private canvas: HTMLCanvasElement, private cover: HTMLElement, private audio: AudioAnalyser,
    private artwork: () => ArtworkColors, private avoid: HTMLElement[]) {
    this.g = canvas.getContext('2d')!;
    // Sizes and the artwork's place are read only here, when something in the player changes size:
    // the layout is already up to date then, so reading it costs nothing. Reading it every frame
    // would make the browser lay out all of Nuclear's page again each time.
    this.resize = new ResizeObserver(() => { this.measure(); this.dirty = true; });
    this.resize.observe(canvas);
    this.resize.observe(cover);
    // The artwork also moves when the panels beside it (lyrics) appear or change size
    const stage = cover.closest('.stage');
    if (stage) for (const part of Array.from(stage.children)) this.resize.observe(part);
    for (const el of avoid) this.resize.observe(el);
  }

  private measure() {
    const box = this.cover.getBoundingClientRect(), area = this.canvas.getBoundingClientRect();
    this.cssWidth = area.width;
    this.cssHeight = area.height;
    this.coverAt = { cx: box.left + box.width / 2 - area.left, cy: box.top + box.height / 2 - area.top, half: this.cover.offsetWidth / 2 };
    this.area = { left: area.left, top: area.top };
    this.avoidAt = this.avoid.map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ x: r.left - area.left, y: r.top - area.top, w: r.width, h: r.height }));
  }

  // Sparks: style and amount, and the system's reduce-motion setting
  setSparks(options: Partial<SpectrumView['sparkOptions']>) {
    this.sparkOptions = { ...this.sparkOptions, ...options };
    const o = this.sparkOptions;
    this.sparks.configure(o.style, o.amount, o.reducedMotion);
  }

  // The cursor over the screen (viewport coordinates), or null when it left or rests (screen idle)
  pointer(x: number | null, y = 0) { this.pointerAt = x === null ? null : { x: x - this.area.left, y: y - this.area.top }; }

  // A SoundCloud comment bubble went away (viewport coordinates): it bursts into sparks
  popAt(r: DOMRect) {
    if (this.mode === 'particles') this.sparks.pop({ x: r.left - this.area.left, y: r.top - this.area.top, w: r.width, h: r.height });
  }

  get visible() { return this.mode !== 'off'; }

  setMode(mode: Mode) {
    this.mode = mode;
    this.dirty = true;
    this.sparks.reset();
    this.peaks = new Peaks(BANDS);
    this.canvas.style.display = mode === 'off' ? 'none' : '';
    this.canvas.classList.toggle('around', AROUND_COVER.includes(mode));
    this.canvas.classList.toggle('glow', mode === 'glow');
  }

  destroy() { this.resize.disconnect(); }

  // Call every frame, after the analyser has updated. `remaining`: seconds left in the song
  draw(playing: boolean, dt: number, remaining = Infinity) {
    if (this.mode === 'off' || !this.cssWidth || !this.cssHeight) return;
    const dpr = window.devicePixelRatio || 1, scale = this.mode === 'glow' ? dpr * GLOW_RESOLUTION : dpr;
    const w = Math.round(this.cssWidth * scale), h = Math.round(this.cssHeight * scale), { g } = this;
    const target = this.audio.live ? 1 : 0;
    this.opacity += (target - this.opacity) * ease(FADE, dt);
    if (Math.abs(target - this.opacity) < 0.01) this.opacity = target;
    const art = this.artwork(), color = art.accent;
    // Nothing visible or nothing changing: skip the redraw (sparks in flight keep moving)
    const still = this.audio.settled && !this.dirty && (this.opacity === target) && !(playing && this.sparks.busy);
    if (still && (this.opacity === 0 || (!playing && color === this.lastColor))) return;
    if (art.colors.version !== this.colorsVersion) {
      this.colorsVersion = art.colors.version;
      const c = art.colors.data;
      this.sparks.setArtwork(c?.accentRgb ?? null, c?.tint ?? null, c);
    }
    this.lastColor = color;
    this.dirty = false;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    g.globalAlpha = this.opacity;
    // Time only moves the modes on while playing (paused: everything holds still)
    const step = playing ? dt : 0;
    if (this.mode === 'led' || this.mode === 'ring') {
      for (let i = 0; i < BANDS; i++) this.peaks.update(i, this.audio.spectrum[i], frames(step));
    }
    switch (this.mode) {
      case 'bars': this.drawBars(w, h, dpr, color); break;
      case 'wave': this.drawWave(w, h, dpr, color); break;
      case 'led': this.drawLed(w, h, dpr, color); break;
      case 'ring': this.drawRing(dpr, color); break;
      case 'particles': this.drawSparks(dpr, step, remaining); break;
      case 'glow': this.drawGlow(w, h, color, step); break;
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawBars(w: number, h: number, dpr: number, color: string) {
    const { g } = this, levels = this.audio.spectrum;
    const gap = 3 * dpr, bw = (w - gap * (BANDS - 1)) / BANDS;
    g.fillStyle = this.fillGradient(color, h);
    for (let i = 0; i < BANDS; i++) {
      const bh = Math.max(2 * dpr, levels[i] * h);
      g.beginPath();
      g.roundRect(i * (bw + gap), h - bh, bw, bh, [bw / 2, bw / 2, 0, 0]);
      g.fill();
    }
  }

  // A grid of lit cells, one colour at a time: unlit, the accent, and warmer near the top. The highest
  // cell of each column stays lit a moment (white) and drops back slowly.
  private drawLed(w: number, h: number, dpr: number, color: string) {
    const { g } = this, levels = this.audio.spectrum, { cols, rows } = LED;
    const gap = 3 * dpr, cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
    // Cells lit, and the peak cell, of each column
    const lit = new Uint8Array(cols), peak = new Uint8Array(cols);
    for (let col = 0; col < cols; col++) {
      const band = Math.floor((col / cols) * BANDS);
      lit[col] = Math.round(levels[band] * rows);
      peak[col] = Math.min(rows - 1, Math.round(this.peaks.at[band] * rows));
    }
    const cells = (fill: string, alpha: number, shows: (col: number, row: number) => boolean) => {
      g.beginPath();
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          if (shows(col, row)) g.rect(col * (cw + gap), h - (row + 1) * (ch + gap) + gap, cw, ch);
        }
      }
      g.fillStyle = fill;
      g.globalAlpha = this.opacity * alpha;
      g.fill();
    };
    const warm = Math.ceil(rows * LED.warm), hot = Math.ceil(rows * LED.hot);
    cells(color, LED.offAlpha, (col, row) => row >= lit[col]);
    cells(color, 1, (col, row) => row < warm && row < lit[col]);
    cells(LED.warmColor, 1, (col, row) => row >= warm && row < hot && row < lit[col]);
    cells(LED.hotColor, 1, (col, row) => row >= hot && row < lit[col]);
    cells('#fff', LED.peakAlpha, (col, row) => row >= LED.peakMinRow && row === peak[col] && row >= lit[col]);
  }

  private drawWave(w: number, h: number, dpr: number, color: string) {
    const { g } = this;
    this.waveShape(h * 0.46);
    const mid = h / 2;
    g.beginPath();
    this.traceWave(w, mid, -1, false);
    this.traceWave(w, mid, 1, true);
    g.closePath();
    g.fillStyle = this.fillGradient(color, h);
    g.fill();
    this.glowStroke(color, dpr);
  }

  // Glowing line (the current path): a wide faint stroke under a thin one (much cheaper than shadowBlur)
  private glowStroke(color: string, dpr: number, width = 2, glow = 0.25) {
    const { g } = this;
    g.strokeStyle = color;
    g.lineJoin = 'round';
    g.globalAlpha = this.opacity * glow;
    g.lineWidth = (width + 5) * dpr;
    g.stroke();
    g.globalAlpha = this.opacity;
    g.lineWidth = width * dpr;
    g.stroke();
  }

  // Bars standing out of the artwork's edges: bass at the top, treble at the bottom, mirrored left
  // and right. The outline grows with the artwork on the kicks, which also brighten its glow, and a
  // dot past each bar marks its recent peak.
  private drawRing(dpr: number, color: string) {
    const box = this.coverBox(dpr);
    if (!box) return;
    const { g } = this, levels = this.audio.spectrum, { x, y, dx, dy } = this.outline, n = RING.bars;
    const half = box.half * (1 + this.audio.pulse * 0.035) + RING.gap * dpr, longest = box.half * RING.maxLength;
    const peaks = new Path2D(), dot = RING.dot * dpr;
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const band = Math.min(BANDS - 1, Math.round((Math.min(k, n - k) / (n / 2)) * (BANDS - 1)));
      const bx = box.cx + x[k] * half, by = box.cy + y[k] * half;
      // Each bar (and its peak dot) stops short of the canvas edge it points at
      const room = clamp(Math.min(dx[k] > 0 ? (box.w - bx) / dx[k] : dx[k] < 0 ? -bx / dx[k] : Infinity,
        dy[k] > 0 ? (box.h - by) / dy[k] : dy[k] < 0 ? -by / dy[k] : Infinity) - RING.edge * dpr, 0, longest);
      const len = 2 * dpr + levels[band] * room;
      g.moveTo(bx, by);
      g.lineTo(bx + dx[k] * len, by + dy[k] * len);
      if (this.peaks.at[band] > RING.peakMin) {
        const at = RING.peakGap * dpr + this.peaks.at[band] * room, px = bx + dx[k] * at, py = by + dy[k] * at;
        peaks.moveTo(px + dot, py);
        peaks.arc(px, py, dot, 0, Math.PI * 2);
      }
    }
    g.lineCap = 'round';
    this.glowStroke(color, dpr, Math.max(1.5, ((8 * half) / n) * RING.width / dpr), RING.glow + this.audio.pulse * RING.glowKick);
    g.fillStyle = '#fff';
    g.globalAlpha = this.opacity * RING.peakAlpha;
    g.fill(peaks);
  }

  private drawSparks(dpr: number, dt: number, remaining: number) {
    const box = this.coverBox(dpr);
    if (!box) return;
    const p = this.pointerAt;
    this.sparks.draw(this.g, {
      box, dpr, opacity: this.opacity, dt, pulse: this.audio.pulse, level: this.audio.level, spectrum: this.audio.spectrum,
      remaining, avoid: this.avoidAt, pointer: p ? { x: p.x * dpr, y: p.y * dpr } : null,
    });
  }

  // Soft lights drifting over the background, brighter and larger with the bass and the kicks
  private drawGlow(w: number, h: number, color: string, dt: number) {
    const { g } = this, { level, pulse } = this.audio;
    this.glowTime += (0.004 + level * 0.01) * frames(dt);
    const t = this.glowTime, r = Math.max(w, h) * (0.32 + pulse * 0.12 + level * 0.1);
    g.globalCompositeOperation = 'lighter';
    const lights: Array<[string, number, number, number]> = [[color, 0.3, 0.4, 1], [color, 0.72, 0.62, 0.8], ['#ffffff', 0.5, 0.25, 0.35]];
    lights.forEach(([fill, bx, by, strength], i) => {
      const x = w * (bx + Math.sin(t * (1 + i * 0.4) + i) * 0.15), y = h * (by + Math.cos(t * (0.8 + i * 0.3) + i) * 0.2);
      const light = g.createRadialGradient(x, y, 0, x, y, r);
      light.addColorStop(0, fill);
      light.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = this.opacity * strength * clamp(0.18 + level * 0.4 + pulse * 0.2, 0, 1);
      g.fillStyle = light;
      g.fillRect(0, 0, w, h);
    });
  }

  // coverAt and the canvas size in canvas pixels
  private coverBox(dpr: number) {
    const { cx, cy, half } = this.coverAt;
    if (!half) return null;
    return { cx: cx * dpr, cy: cy * dpr, half: half * dpr, w: this.cssWidth * dpr, h: this.cssHeight * dpr };
  }

  // Wave heights: bass at both edges and treble in the middle, with a light blur across
  // neighbouring bands to soften the lobes
  private waveShape(amp: number) {
    const levels = this.audio.spectrum, n = WAVE_POINTS;
    const band = (k: number) => levels[BANDS - 1 - Math.abs(clamp(k, 0, n - 1) - (BANDS - 1))];
    for (let k = 0; k < n; k++) this.waveLevels[k] = Math.max(0.015, (band(k - 1) + 2 * band(k) + band(k + 1)) / 4) * amp;
  }

  // One edge of the wave, mirrored around `mid` (sign -1 is the top edge), as quadratic segments
  // through the midpoints. The first call starts the path; the second continues it backwards.
  private traceWave(w: number, mid: number, sign: number, reverse: boolean) {
    const { g, waveLevels: lv } = this, n = lv.length;
    const at = (s: number) => (reverse ? n - 1 - s : s);
    const x = (k: number) => (k / (n - 1)) * w, y = (k: number) => mid + sign * lv[k];
    g.lineTo(x(at(0)), y(at(0)));
    for (let s = 1; s < n - 1; s++) {
      const k = at(s), next = at(s + 1);
      g.quadraticCurveTo(x(k), y(k), (x(k) + x(next)) / 2, (y(k) + y(next)) / 2);
    }
    g.lineTo(x(at(n - 1)), y(at(n - 1)));
  }

  // Bars fade upwards from the accent; the wave fades from its centre line to both edges
  private fillGradient(color: string, h: number) {
    const f = this.gradientFor;
    if (!this.gradient || f.mode !== this.mode || f.color !== color || f.h !== h) {
      const clear = 'rgba(255,255,255,0)';
      if (this.mode === 'bars') {
        this.gradient = this.g.createLinearGradient(0, h, 0, 0);
        this.gradient.addColorStop(0, color);
        this.gradient.addColorStop(1, clear);
      } else {
        this.gradient = this.g.createLinearGradient(0, 0, 0, h);
        this.gradient.addColorStop(0, clear);
        this.gradient.addColorStop(0.5, color);
        this.gradient.addColorStop(1, clear);
      }
      this.gradientFor = { mode: this.mode, color, h };
    }
    return this.gradient;
  }
}

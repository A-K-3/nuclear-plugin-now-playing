// Draws the analysed spectrum in the player. Along the bottom: bars (bass on the left), a mirrored
// wave (bass at both edges, beside the controls, where it stays visible) or an LED meter. Around the
// artwork, over the whole player: a ring of bars, sparks thrown out on the kicks, or a glow that
// lights the background with the music. It fades in with a real signal and out without one, and
// skips redrawing while nothing changes.
import { BANDS, type AudioAnalyser } from '../audio/analyser';
import { clamp, decay, ease, frames } from '../lib/math';
import type { Prefs } from '../settings';

type Mode = Prefs['visualizer'];

const FADE = 0.08;
const WAVE_POINTS = BANDS * 2 - 1;
// Modes drawn over the whole player, around the artwork, instead of along the bottom
const AROUND_COVER: Mode[] = ['ring', 'particles', 'glow'];
// The glow is soft anyway: drawn at a fraction of the resolution and scaled up by the browser
const GLOW_RESOLUTION = 0.2;

const LED = { cols: 32, rows: 14, hot: 0.8, warm: 0.6, hotColor: '#ff6b8b', warmColor: '#ffd166', offAlpha: 0.1 };
const RING = { bars: 128, gap: 10, maxLength: 0.42, width: 0.45 };
// Corner radius of the outline the ring follows, as a share of the artwork's half size
const RING_CORNER = 0.14;
const SPARKS = { max: 400, perKick: 9, life: 0.012, drag: 0.985, speed: 1.6 };

export class SpectrumView {
  private mode: Mode = 'bars';
  private g: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;
  private opacity = 0;
  private dirty = true;
  private lastColor = '';
  private gradient: CanvasGradient | null = null;
  private gradientFor = { mode: '', color: '', h: 0 };
  private waveLevels = new Float32Array(WAVE_POINTS);
  private resize: ResizeObserver;
  // Ring: points around a rounded square of half size 1 (x, y) and their outward direction (dx, dy)
  private outline = roundedSquare(RING.bars, RING_CORNER);
  // Sparks: position, velocity, life and size, one slot each
  private sparks = { n: 0, x: new Float32Array(SPARKS.max), y: new Float32Array(SPARKS.max), vx: new Float32Array(SPARKS.max),
    vy: new Float32Array(SPARKS.max), life: new Float32Array(SPARKS.max), r: new Float32Array(SPARKS.max) };
  private spawnDebt = 0;
  private glowTime = 0;

  constructor(private canvas: HTMLCanvasElement, private cover: HTMLElement, private audio: AudioAnalyser, private accent: () => string) {
    this.g = canvas.getContext('2d')!;
    // Sizes and the artwork's place are read only here, when something in the player changes size:
    // the layout is already up to date then, so reading it costs nothing. Reading it every frame
    // would make the browser lay out all of Nuclear's page again each time.
    this.resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== canvas) continue;
        this.cssWidth = entry.contentRect.width;
        this.cssHeight = entry.contentRect.height;
      }
      this.measureCover();
      this.dirty = true;
    });
    this.resize.observe(canvas);
    this.resize.observe(cover);
    // The artwork also moves when the panels beside it (lyrics) appear or change size
    const stage = cover.closest('.stage');
    if (stage) for (const part of Array.from(stage.children)) this.resize.observe(part);
  }

  // The artwork's centre on the canvas and half its size (CSS pixels), without the tilt and beat transforms
  private coverAt = { cx: 0, cy: 0, half: 0 };
  private measureCover() {
    const box = this.cover.getBoundingClientRect(), area = this.canvas.getBoundingClientRect();
    this.coverAt = { cx: box.left + box.width / 2 - area.left, cy: box.top + box.height / 2 - area.top, half: this.cover.offsetWidth / 2 };
  }

  get visible() { return this.mode !== 'off'; }

  setMode(mode: Mode) {
    this.mode = mode;
    this.dirty = true;
    this.sparks.n = 0;
    this.canvas.style.display = mode === 'off' ? 'none' : '';
    this.canvas.classList.toggle('around', AROUND_COVER.includes(mode));
    this.canvas.classList.toggle('glow', mode === 'glow');
  }

  destroy() { this.resize.disconnect(); }

  // Call every frame, after the analyser has updated
  draw(playing: boolean, dt: number) {
    if (this.mode === 'off' || !this.cssWidth || !this.cssHeight) return;
    const dpr = window.devicePixelRatio || 1, scale = this.mode === 'glow' ? dpr * GLOW_RESOLUTION : dpr;
    const w = Math.round(this.cssWidth * scale), h = Math.round(this.cssHeight * scale), { g } = this;
    const target = this.audio.live ? 1 : 0;
    this.opacity += (target - this.opacity) * ease(FADE, dt);
    if (Math.abs(target - this.opacity) < 0.01) this.opacity = target;
    const color = this.accent();
    // Nothing visible or nothing changing: skip the redraw (sparks in flight keep moving)
    const still = this.audio.settled && !this.dirty && (this.opacity === target) && !(playing && this.sparks.n);
    if (still && (this.opacity === 0 || (!playing && color === this.lastColor))) return;
    this.lastColor = color;
    this.dirty = false;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    g.globalAlpha = this.opacity;
    switch (this.mode) {
      case 'bars': this.drawBars(w, h, dpr, color); break;
      case 'wave': this.drawWave(w, h, dpr, color); break;
      case 'led': this.drawLed(w, h, dpr, color); break;
      case 'ring': this.drawRing(dpr, color); break;
      case 'particles': this.drawSparks(dpr, color, playing ? dt : 0); break;
      case 'glow': this.drawGlow(w, h, color, playing ? dt : 0); break;
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

  // A grid of lit cells, one colour at a time: unlit, the accent, and warmer near the top
  private drawLed(w: number, h: number, dpr: number, color: string) {
    const { g } = this, levels = this.audio.spectrum, { cols, rows } = LED;
    const gap = 3 * dpr, cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
    const lit = new Array<number>(cols);
    for (let col = 0; col < cols; col++) lit[col] = Math.round(levels[Math.floor((col / cols) * BANDS)] * rows);
    const cells = (fill: string, alpha: number, from: number, to: number, on: boolean) => {
      g.beginPath();
      for (let col = 0; col < cols; col++) {
        for (let row = from; row < to; row++) {
          if ((row < lit[col]) === on) g.rect(col * (cw + gap), h - (row + 1) * (ch + gap) + gap, cw, ch);
        }
      }
      g.fillStyle = fill;
      g.globalAlpha = this.opacity * alpha;
      g.fill();
    };
    const warm = Math.ceil(rows * LED.warm), hot = Math.ceil(rows * LED.hot);
    cells(color, LED.offAlpha, 0, rows, false);
    cells(color, 1, 0, warm, true);
    cells(LED.warmColor, 1, warm, hot, true);
    cells(LED.hotColor, 1, hot, rows, true);
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

  // Glowing line: a wide faint stroke under a thin one (much cheaper than shadowBlur)
  private glowStroke(color: string, dpr: number, width = 2) {
    const { g } = this;
    g.strokeStyle = color;
    g.lineJoin = 'round';
    g.globalAlpha = this.opacity * 0.25;
    g.lineWidth = (width + 5) * dpr;
    g.stroke();
    g.globalAlpha = this.opacity;
    g.lineWidth = width * dpr;
    g.stroke();
  }

  // Bars standing out of the artwork's edges: bass at the top, treble at the bottom, mirrored left
  // and right. The outline grows with the artwork on the kicks.
  private drawRing(dpr: number, color: string) {
    const box = this.coverBox(dpr);
    if (!box) return;
    const { g } = this, levels = this.audio.spectrum, { x, y, dx, dy } = this.outline, n = RING.bars;
    const half = box.half * (1 + this.audio.pulse * 0.035) + RING.gap * dpr, longest = box.half * RING.maxLength;
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const band = Math.min(BANDS - 1, Math.round((Math.min(k, n - k) / (n / 2)) * (BANDS - 1)));
      const bx = box.cx + x[k] * half, by = box.cy + y[k] * half;
      // Each bar stops short of the canvas edge it points at
      const room = Math.min(dx[k] > 0 ? (box.w - bx) / dx[k] : dx[k] < 0 ? -bx / dx[k] : Infinity,
        dy[k] > 0 ? (box.h - by) / dy[k] : dy[k] < 0 ? -by / dy[k] : Infinity) - 4 * dpr;
      const len = 2 * dpr + levels[band] * clamp(room, 0, longest);
      g.moveTo(bx, by);
      g.lineTo(bx + dx[k] * len, by + dy[k] * len);
    }
    g.lineCap = 'round';
    this.glowStroke(color, dpr, Math.max(1.5, ((8 * half) / n) * RING.width / dpr));
  }

  // Sparks thrown out from the artwork's edges on each kick, slowing and fading as they go
  private drawSparks(dpr: number, color: string, dt: number) {
    const box = this.coverBox(dpr);
    if (!box) return;
    const s = this.sparks, { x, y, dx, dy } = this.outline, step = frames(dt);
    // Kicks throw a burst; a loud bass keeps a light trickle going
    this.spawnDebt += (this.audio.pulse * SPARKS.perKick + (this.audio.level > 0.3 ? 0.5 : 0)) * step;
    for (; this.spawnDebt >= 1 && s.n < SPARKS.max; this.spawnDebt--) {
      const k = Math.floor(Math.random() * x.length), i = s.n++;
      const speed = (1 + Math.random() * 4) * (0.5 + this.audio.pulse) * SPARKS.speed * dpr, turn = (Math.random() - 0.5) * 0.8;
      s.x[i] = box.cx + x[k] * box.half; s.y[i] = box.cy + y[k] * box.half;
      s.vx[i] = (dx[k] * Math.cos(turn) - dy[k] * Math.sin(turn)) * speed;
      s.vy[i] = (dx[k] * Math.sin(turn) + dy[k] * Math.cos(turn)) * speed;
      s.life[i] = 1; s.r[i] = (1 + Math.random() * 2.5) * dpr;
    }
    this.spawnDebt = Math.min(this.spawnDebt, 1);
    const { g } = this, drag = decay(SPARKS.drag, dt);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = color;
    for (let i = 0; i < s.n; i++) {
      s.x[i] += s.vx[i] * step; s.y[i] += s.vy[i] * step;
      s.vx[i] *= drag; s.vy[i] *= drag;
      s.life[i] -= SPARKS.life * step;
      if (s.life[i] <= 0) {
        // Move the last spark into this slot and look at the slot again
        const last = --s.n;
        s.x[i] = s.x[last]; s.y[i] = s.y[last]; s.vx[i] = s.vx[last]; s.vy[i] = s.vy[last]; s.life[i] = s.life[last]; s.r[i] = s.r[last];
        i--;
        continue;
      }
      g.globalAlpha = this.opacity * s.life[i];
      g.beginPath();
      g.arc(s.x[i], s.y[i], s.r[i], 0, Math.PI * 2);
      g.fill();
    }
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

  // Where the artwork sits on the canvas (canvas pixels): its centre, half its size without the
  // tilt and beat transforms, and the canvas size
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

// `n` points evenly spaced along a square of half size 1 with rounded corners (radius `corner`),
// clockwise from the middle of the top edge, each with the direction pointing straight out
function roundedSquare(n: number, corner: number) {
  const x = new Float32Array(n), y = new Float32Array(n), dx = new Float32Array(n), dy = new Float32Array(n);
  const side = 2 - 2 * corner, arc = (Math.PI / 2) * corner, perimeter = 4 * (side + arc);
  // Each quarter starts half way along a side, runs to the corner, round it, and on to the next middle
  for (let k = 0; k < n; k++) {
    let d = (k / n) * perimeter;
    const quarter = Math.floor(d / (side + arc));
    d -= quarter * (side + arc);
    let px: number, py: number, nx: number, ny: number;
    if (d < side / 2) { px = d; py = -1; nx = 0; ny = -1; }
    else if (d < side / 2 + arc) {
      const a = -Math.PI / 2 + (d - side / 2) / corner;
      nx = Math.cos(a); ny = Math.sin(a);
      px = 1 - corner + nx * corner; py = -(1 - corner) + ny * corner;
    } else { px = 1; py = -(1 - corner) + (d - side / 2 - arc); nx = 1; ny = 0; }
    // Rotate the first quarter's point into the right quarter (90° clockwise each)
    for (let r = 0; r < quarter; r++) { [px, py] = [-py, px]; [nx, ny] = [-ny, nx]; }
    x[k] = px; y[k] = py; dx[k] = nx; dy[k] = ny;
  }
  return { x, y, dx, dy };
}

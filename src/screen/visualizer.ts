// Draws the analysed spectrum behind the player: bars (bass on the left) or a mirrored wave (bass at
// both edges, beside the controls, where it stays visible). It fades in with a real signal and out
// without one, and skips redrawing while nothing changes.
import { BANDS, type AudioAnalyser } from '../audio/analyser';
import { clamp, ease } from '../lib/math';
import type { Prefs } from '../settings';

type Mode = Prefs['visualizer'];

const FADE = 0.08;
const WAVE_POINTS = BANDS * 2 - 1;

export class SpectrumView {
  private mode: Mode = 'bars';
  private g: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private opacity = 0;
  private dirty = true;
  private lastColor = '';
  private gradient: CanvasGradient | null = null;
  private gradientFor = { mode: '', color: '', h: 0 };
  private waveLevels = new Float32Array(WAVE_POINTS);
  private resize: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private audio: AudioAnalyser, private accent: () => string) {
    this.g = canvas.getContext('2d')!;
    this.resize = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio || 1;
      this.width = Math.round(entry.contentRect.width * dpr);
      this.height = Math.round(entry.contentRect.height * dpr);
      this.dirty = true;
    });
    this.resize.observe(canvas);
  }

  get visible() { return this.mode !== 'off'; }

  setMode(mode: Mode) {
    this.mode = mode;
    this.dirty = true;
    this.canvas.style.display = mode === 'off' ? 'none' : '';
  }

  destroy() { this.resize.disconnect(); }

  // Call every frame, after the analyser has updated
  draw(playing: boolean, dt: number) {
    const { width: w, height: h, g } = this;
    if (this.mode === 'off' || !w || !h) return;
    const target = this.audio.live ? 1 : 0;
    this.opacity += (target - this.opacity) * ease(FADE, dt);
    if (Math.abs(target - this.opacity) < 0.01) this.opacity = target;
    const color = this.accent();
    // Nothing visible or nothing changing: skip the redraw
    const still = this.audio.settled && !this.dirty && (this.opacity === target);
    if (still && (this.opacity === 0 || (!playing && color === this.lastColor))) return;
    this.lastColor = color;
    this.dirty = false;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    g.globalAlpha = this.opacity;
    const dpr = window.devicePixelRatio || 1;
    if (this.mode === 'bars') this.drawBars(w, h, dpr, color);
    else this.drawWave(w, h, dpr, color);
    g.globalAlpha = 1;
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
    // Glowing outline on both edges: a wide faint stroke under a thin one (much cheaper than shadowBlur)
    g.strokeStyle = color;
    g.lineJoin = 'round';
    g.globalAlpha = this.opacity * 0.25;
    g.lineWidth = 7 * dpr;
    g.stroke();
    g.globalAlpha = this.opacity;
    g.lineWidth = 2 * dpr;
    g.stroke();
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

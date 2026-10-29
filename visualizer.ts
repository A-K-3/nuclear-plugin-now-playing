// Audio visualizer. Nuclear does not expose its audio graph to plugins, so this captures the
// playing <audio> element with captureStream() into a separate AudioContext that is never
// connected to the speakers (no double audio, Nuclear's EQ/crossfade untouched).
// Nuclear alternates two <audio> elements for crossfading: if the captured one stays silent
// while music plays, the next candidate is tried. When no element yields a signal (for example
// a stream the browser will not let us read), the bars fade out instead of faking movement.
import type { Prefs } from './settings';

type VisualizerMode = Prefs['visualizer'];

const BARS = 64;
const SILENCE_MS = 1500; // silence while playing before trying another element
const RETRY_MS = 5000; // how often to retry once every element has been tried

export class Visualizer {
  private mode: VisualizerMode = 'bars';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(1024);
  private wave = new Uint8Array(2048);
  private silentSince = 0;
  private hasSignal = false;
  private tried = new Set<HTMLAudioElement>();
  private lastAttempt = 0;
  private lastLog = '';
  private opacity = 0;
  private smooth = new Float32Array(BARS);
  private g: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private edges: number[] = [];
  private edgesRate = 0;
  private gradient: CanvasGradient | null = null;
  private gradientKey = '';
  private settled = false;
  private lastColor = '';
  private resize: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, private accent: () => string) {
    this.g = canvas.getContext('2d')!;
    this.resize = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio || 1;
      this.width = Math.round(entry.contentRect.width * dpr);
      this.height = Math.round(entry.contentRect.height * dpr);
      this.settled = false;
    });
    this.resize.observe(canvas);
  }

  setMode(mode: VisualizerMode) {
    this.mode = mode;
    this.settled = false;
    this.canvas.style.display = mode === 'off' ? 'none' : '';
    if (mode === 'off') this.disconnect();
  }

  stop() {
    this.disconnect();
    this.tried.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  destroy() {
    this.stop();
    this.resize.disconnect();
  }

  // Call every frame
  draw(playing: boolean) {
    if (this.mode === 'off') return;
    const now = performance.now();
    this.updateSource(playing, now);

    const { width: w, height: h, g } = this;
    if (!w || !h) return;
    // Fade in with a real signal, fade out without one
    const target = this.hasSignal ? 1 : 0;
    this.opacity += (target - this.opacity) * 0.08;
    if (Math.abs(target - this.opacity) < 0.01) this.opacity = target;
    const color = this.accent();
    // Nothing visible and nothing changing: skip the redraw
    if (this.opacity === 0 && this.settled) return;
    if (!playing && this.settled && color === this.lastColor) return;
    this.lastColor = color;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    g.globalAlpha = this.opacity;
    const live = this.hasSignal && this.analyser;

    if (this.mode === 'bars') {
      if (live) this.analyser!.getByteFrequencyData(this.freq);
      const edges = this.barEdges();
      let moving = false;
      for (let i = 0; i < BARS; i++) {
        let v = 0;
        if (live) {
          const from = edges[i], to = Math.max(from + 1, edges[i + 1]);
          let sum = 0;
          for (let b = from; b < to && b < this.freq.length; b++) sum += this.freq[b];
          // higher bands carry less energy: compensate a little
          v = Math.min(1, (sum / (to - from) / 255) * (1 + (i / BARS) * 0.6));
        }
        const delta = (v - this.smooth[i]) * (v > this.smooth[i] ? 0.5 : 0.12);
        if (Math.abs(delta) > 0.0005) moving = true;
        this.smooth[i] += delta;
      }
      this.settled = !moving && (!playing || this.opacity === 0);
      const dpr = window.devicePixelRatio || 1, gap = 3 * dpr, bw = (w - gap * (BARS - 1)) / BARS;
      g.fillStyle = this.barGradient(color, h);
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(2 * dpr, this.smooth[i] * h);
        g.beginPath();
        g.roundRect(i * (bw + gap), h - bh, bw, bh, [bw / 2, bw / 2, 0, 0]);
        g.fill();
      }
    } else {
      if (live) this.analyser!.getByteTimeDomainData(this.wave);
      const dpr = window.devicePixelRatio || 1;
      g.lineWidth = 2.5 * dpr;
      g.strokeStyle = color;
      g.shadowColor = color; g.shadowBlur = 12 * dpr;
      g.beginPath();
      const n = 256, step = this.wave.length / n;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const v = live ? (this.wave[Math.floor(i * step)] - 128) / 128 : 0;
        const y = h / 2 + v * h * 0.45;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;
      this.settled = !playing || this.opacity === 0;
    }
    g.globalAlpha = 1;
  }

  // Keeps the analyser attached to an <audio> element that actually produces sound
  private updateSource(playing: boolean, now: number) {
    if (this.analyser && playing) {
      this.analyser.getByteTimeDomainData(this.wave);
      const silent = this.wave.every((v) => Math.abs(v - 128) < 2);
      if (!silent) { this.silentSince = 0; this.hasSignal = true; return; }
      this.silentSince ||= now;
      if (now - this.silentSince < SILENCE_MS) return;
      this.hasSignal = false;
    } else if (this.analyser) {
      return; // paused: keep the current source
    }
    if (!playing) return;
    const candidates = Array.from(document.querySelectorAll('audio')).filter((a) => !a.paused && a.currentTime > 0);
    let next = candidates.find((a) => !this.tried.has(a));
    if (!next) {
      if (candidates.length) this.log('no <audio> element produced a signal; hiding the bars');
      if (now - this.lastAttempt < RETRY_MS || !candidates.length) return;
      this.tried.clear(); // every element tried: start over after a pause
      next = candidates[0];
    }
    this.lastAttempt = now;
    this.attach(next);
  }

  private attach(element: HTMLAudioElement) {
    this.disconnect();
    this.tried.add(element);
    this.element = element;
    this.silentSince = 0;
    try {
      const capture = (element as any).captureStream || (element as any).mozCaptureStream;
      if (!capture) return this.log('captureStream() is not available');
      const stream: MediaStream = capture.call(element);
      if (!stream.getAudioTracks().length) return this.log('the captured stream has no audio track');
      this.ctx ||= new AudioContext();
      this.ctx.resume().catch(() => {});
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;
      this.source = this.ctx.createMediaStreamSource(stream);
      this.source.connect(this.analyser); // analyser only, never the speakers
    } catch (e) {
      this.log(`capture failed: ${(e as Error)?.message || e}`);
      this.analyser = null;
    }
  }

  // Diagnostics in the developer console (once per distinct message)
  private log(message: string) {
    if (message === this.lastLog) return;
    this.lastLog = message;
    console.info(`[Now Playing] visualizer: ${message} (src: ${this.element?.currentSrc?.slice(0, 80) || '?'})`);
  }

  // Log-spaced bars from 40 Hz to 16 kHz: start bin of each band (BARS + 1 edges)
  private barEdges() {
    const rate = this.ctx?.sampleRate || 48000;
    if (rate !== this.edgesRate) {
      const hzPerBin = rate / 2 / this.freq.length;
      const edge = (k: number) => Math.max(1, Math.round((40 * Math.pow(400, k / BARS)) / hzPerBin));
      this.edges = [];
      for (let k = 0; k <= BARS; k++) this.edges.push(edge(k));
      this.edgesRate = rate;
    }
    return this.edges;
  }

  private barGradient(color: string, h: number) {
    const key = `${color}|${h}`;
    if (key !== this.gradientKey || !this.gradient) {
      this.gradient = this.g.createLinearGradient(0, h, 0, 0);
      this.gradient.addColorStop(0, color);
      this.gradient.addColorStop(1, 'rgba(255,255,255,0)');
      this.gradientKey = key;
    }
    return this.gradient;
  }

  private disconnect() {
    try { this.source?.disconnect(); } catch { /* already disconnected */ }
    this.source = null; this.analyser = null; this.element = null; this.hasSignal = false;
  }
}

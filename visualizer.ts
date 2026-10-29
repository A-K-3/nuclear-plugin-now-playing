// Visualizador: analiza el audio que suena capturando el <audio> de Nuclear con captureStream()
// en un AudioContext propio que no se conecta a los altavoces (no duplica el sonido ni toca el
// ecualizador/crossfade de Nuclear). Si la captura no está disponible o no llega señal
// (p. ej. streams sin CORS), dibuja una animación decorativa que sigue a play/pausa.
import type { Prefs } from './settings';

type VisualizerMode = Prefs['visualizer'];

const BARS = 64;

export class Visualizer {
  private mode: VisualizerMode = 'bars';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(1024);
  private wave = new Uint8Array(2048);
  private silentSince = 0;
  private real = false;
  private lastCheck = 0;
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
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  destroy() {
    this.stop();
    this.resize.disconnect();
  }

  // Llamar en cada fotograma
  draw(playing: boolean) {
    if (this.mode === 'off') return;
    const now = performance.now();
    if (now - this.lastCheck > 1000) { this.lastCheck = now; this.attach(); }

    const { width: w, height: h, g } = this;
    if (!w || !h) return;
    // En pausa, cuando las barras ya han bajado del todo (y con el mismo color), no hace falta redibujar
    const color = this.accent();
    if (!playing && this.settled && color === this.lastColor) return;
    this.lastColor = color;
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }

    if (this.analyser) {
      if (this.mode === 'bars') this.analyser.getByteFrequencyData(this.freq);
      else this.analyser.getByteTimeDomainData(this.wave);
      const data = this.mode === 'bars' ? this.freq : this.wave;
      const silent = this.mode === 'bars' ? data.every((v) => v === 0) : data.every((v) => Math.abs(v - 128) < 2);
      if (!silent) { this.silentSince = 0; this.real = true; }
      else if (playing) {
        this.silentSince ||= now;
        if (now - this.silentSince > 2500) this.real = false;
      }
    }
    const useReal = this.analyser && this.real;
    g.clearRect(0, 0, w, h);

    if (this.mode === 'bars') {
      const edges = this.barEdges();
      let moving = false;
      for (let i = 0; i < BARS; i++) {
        let v: number;
        if (useReal) {
          let sum = 0;
          const from = edges[i], to = Math.max(from + 1, edges[i + 1]);
          for (let b = from; b < to && b < this.freq.length; b++) sum += this.freq[b];
          // los agudos tienen menos energía: se compensan un poco
          v = Math.min(1, (sum / (to - from) / 255) * (1 + (i / BARS) * 0.6));
        } else {
          const t = now / 1000;
          v = playing ? 0.25 + 0.2 * Math.sin(t * 2.1 + i * 0.35) * Math.sin(t * 1.3 + i * 0.11) + 0.15 * Math.sin(t * 5 + i) : 0.04;
          v = Math.max(0.03, v);
        }
        const delta = (v - this.smooth[i]) * (v > this.smooth[i] ? 0.5 : 0.12);
        if (Math.abs(delta) > 0.0005) moving = true;
        this.smooth[i] += delta;
      }
      this.settled = !playing && !moving;
      const dpr = window.devicePixelRatio || 1, gap = 3 * dpr, bw = (w - gap * (BARS - 1)) / BARS;
      g.fillStyle = this.barGradient(color, h);
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(2 * dpr, this.smooth[i] * h);
        g.beginPath();
        g.roundRect(i * (bw + gap), h - bh, bw, bh, [bw / 2, bw / 2, 0, 0]);
        g.fill();
      }
    } else {
      const dpr = window.devicePixelRatio || 1;
      g.lineWidth = 2.5 * dpr;
      g.strokeStyle = color;
      g.shadowColor = color; g.shadowBlur = 12 * dpr;
      g.beginPath();
      const n = 256, t = now / 1000, step = this.wave.length / n;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        let v: number;
        if (useReal) v = (this.wave[Math.floor(i * step)] - 128) / 128;
        else v = playing ? 0.35 * Math.sin(i * 0.08 + t * 4) * Math.sin(i * 0.013 + t * 1.7) : 0;
        const y = h / 2 + v * h * 0.45;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;
      this.settled = !playing;
    }
  }

  // Barras en escala logarítmica de 40 Hz a 16 kHz: índices de inicio de cada tramo (BARS + 1 bordes)
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

  // Engancha el <audio> que esté sonando (Nuclear alterna dos para el crossfade)
  private attach() {
    const audios = Array.from(document.querySelectorAll('audio'));
    const active = audios.find((a) => !a.paused && a.currentTime > 0) || null;
    if (!active || active === this.element) return;
    this.disconnect();
    this.element = active;
    try {
      const capture = (active as any).captureStream || (active as any).mozCaptureStream;
      if (!capture) return;
      const stream: MediaStream = capture.call(active);
      if (!stream.getAudioTracks().length) return;
      this.ctx ||= new AudioContext();
      this.ctx.resume().catch(() => {});
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;
      this.source = this.ctx.createMediaStreamSource(stream);
      this.source.connect(this.analyser); // solo al analizador, nunca a los altavoces
      this.real = true; this.silentSince = 0;
    } catch (e) {
      console.warn('[Now Playing] visualizador sin captura de audio:', e);
      this.analyser = null;
    }
  }

  private disconnect() {
    try { this.source?.disconnect(); } catch { /* noop */ }
    this.source = null; this.analyser = null; this.element = null;
  }
}

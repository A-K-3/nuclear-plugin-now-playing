// Audio visualizer and beat detection. Nuclear does not expose its audio graph to plugins, so this
// captures the playing <audio> element with captureStream() into a separate AudioContext that is
// never connected to the speakers (no double audio, Nuclear's EQ/crossfade untouched).
// Nuclear alternates two <audio> elements for crossfading: if the captured one stays silent
// while music plays, the next candidate is tried. When no element yields a signal (for example
// a stream the browser will not let us read), the bars fade out instead of faking movement.
import type { Prefs } from './settings';
import { clamp } from './util';

type VisualizerMode = Prefs['visualizer'];

const BARS = 64;
const SILENCE_MS = 1500; // silence while playing before trying another element
const RETRY_MS = 5000; // how often to retry once every element has been tried
const MIN_HZ = 40; // bars span MIN_HZ … MIN_HZ * SPAN on a log scale (40 Hz – 16 kHz)
const SPAN = 400;
// Automatic gain: bars are scaled against the recent peak so a loud master does not pin every bar at
// the top and a quiet song still moves; the curve keeps sustained energy low and lets hits stand out.
const PEAK_DECAY = 0.996;
const MIN_PEAK = 0.2;
const GAIN_CURVE = 2.2;
const HEADROOM = 0.92;
const TREBLE_BOOST = 0.3; // higher bands carry less energy
// Beat detection on the bass band
const BASS_LO_HZ = 40;
const BASS_HI_HZ = 160;
const KICK_THRESHOLD = 1.05; // a kick is bass above 105 % of its running average
const KICK_GAIN = 4;
const SETTLE_EPSILON = 1e-3;

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
  private raw = new Float32Array(BARS);
  private peak = 0;
  private g: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private bins = { rate: 0, edges: [] as number[], bassFrom: 1, bassTo: 2 };
  private gradient: CanvasGradient | null = null;
  private gradientKey = '';
  private settled = false;
  private lastColor = '';
  private resize: ResizeObserver;
  private analyze = false; // keep analysing for the beat effects even when the bars are off
  private slowBass = 0;
  private bassLevel = 0;
  private kick = 0;

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

  // Bass level (0–1, smoothed) and beat pulse (0–1, spikes on kicks); 0 without a real signal
  get level() { return this.bassLevel; }
  get pulse() { return this.kick; }

  setMode(mode: VisualizerMode) {
    this.mode = mode;
    this.settled = false;
    this.canvas.style.display = mode === 'off' ? 'none' : '';
    if (!this.capturing()) this.disconnect();
  }

  // Beat-reactive effects need the analysis even when no bars are drawn
  setAnalyze(on: boolean) {
    this.analyze = on;
    if (!this.capturing()) this.disconnect();
  }

  private capturing() {
    return this.mode !== 'off' || this.analyze;
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

  // Call every frame, before anything that reads `level`/`pulse`
  draw(playing: boolean) {
    if (!this.capturing()) return;
    const now = performance.now();
    this.updateSource(playing, now);
    const live = this.hasSignal && !!this.analyser;
    // Skip the FFT while paused unless the bars are still settling
    if (live && (playing || (this.mode === 'bars' && !this.settled))) this.analyser!.getByteFrequencyData(this.freq);
    this.updateLevels(live && playing);
    if (this.mode === 'off') return;

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
    const dpr = window.devicePixelRatio || 1;

    if (this.mode === 'bars') {
      const { edges } = this.bands();
      // Pass 1: raw band levels and the frame peak; pass 2: normalise against the decaying peak
      let frameMax = 0;
      if (live) {
        for (let i = 0; i < BARS; i++) {
          this.raw[i] = this.bandAvg(edges[i], Math.max(edges[i] + 1, edges[i + 1])) * (1 + (i / BARS) * TREBLE_BOOST);
          frameMax = Math.max(frameMax, this.raw[i]);
        }
      }
      this.peak = Math.max(frameMax, this.peak * PEAK_DECAY);
      let moving = false;
      for (let i = 0; i < BARS; i++) {
        const v = live ? Math.pow(Math.min(1, this.raw[i] / Math.max(this.peak, MIN_PEAK)), GAIN_CURVE) * HEADROOM : 0;
        const delta = (v - this.smooth[i]) * (v > this.smooth[i] ? 0.5 : 0.12);
        if (Math.abs(delta) > 0.0005) moving = true;
        this.smooth[i] += delta;
      }
      this.settled = !moving && (!playing || this.opacity === 0);
      const gap = 3 * dpr, bw = (w - gap * (BARS - 1)) / BARS;
      g.fillStyle = this.barGradient(color, h);
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(2 * dpr, this.smooth[i] * h);
        g.beginPath();
        g.roundRect(i * (bw + gap), h - bh, bw, bh, [bw / 2, bw / 2, 0, 0]);
        g.fill();
      }
    } else {
      // updateSource already read the waveform this frame while playing
      if (live && !playing) this.analyser!.getByteTimeDomainData(this.wave);
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

  // Bass energy drives `level`; jumps above its running average drive `pulse`
  private updateLevels(live: boolean) {
    if (!live) {
      this.bassLevel = this.bassLevel * 0.92 < SETTLE_EPSILON ? 0 : this.bassLevel * 0.92;
      this.kick = this.kick * 0.85 < SETTLE_EPSILON ? 0 : this.kick * 0.85;
      return;
    }
    const { bassFrom, bassTo } = this.bands();
    const bass = this.bandAvg(bassFrom, bassTo);
    this.bassLevel += (bass - this.bassLevel) * (bass > this.bassLevel ? 0.5 : 0.08);
    this.slowBass += (bass - this.slowBass) * 0.02;
    this.kick = Math.max(clamp((bass - this.slowBass * KICK_THRESHOLD) * KICK_GAIN, 0, 1), this.kick * 0.88);
  }

  // Keeps the analyser attached to an <audio> element that actually produces sound
  private updateSource(playing: boolean, now: number) {
    if (this.analyser && playing) {
      this.analyser.getByteTimeDomainData(this.wave);
      let silent = true;
      for (let i = 0; i < this.wave.length; i++) if (Math.abs(this.wave[i] - 128) >= 2) { silent = false; break; }
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
      // Wider range than the default (-100 to -30 dB), which saturates on loud masters
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;
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

  // FFT bin ranges for the bars and the bass band, computed once per sample rate
  private bands() {
    const rate = this.ctx?.sampleRate || 48000;
    if (rate !== this.bins.rate) {
      const bin = (hz: number) => Math.max(1, Math.round(hz / (rate / 2 / this.freq.length)));
      const bassFrom = bin(BASS_LO_HZ);
      this.bins = {
        rate,
        edges: Array.from({ length: BARS + 1 }, (_, k) => bin(MIN_HZ * Math.pow(SPAN, k / BARS))),
        bassFrom,
        bassTo: Math.max(bassFrom + 1, bin(BASS_HI_HZ)),
      };
    }
    return this.bins;
  }

  // Average magnitude (0–1) of the FFT bins [from, to)
  private bandAvg(from: number, to: number) {
    let sum = 0;
    const end = Math.min(to, this.freq.length);
    for (let b = from; b < end; b++) sum += this.freq[b];
    return sum / (to - from) / 255;
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
    this.bassLevel = 0; this.kick = 0; this.slowBass = 0; this.peak = 0;
  }
}

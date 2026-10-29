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
// A kick is how far the bass jumps above the valley between hits, relative to recent hits. The valley
// falls fast and rises slowly, so kicks stand out even in music whose bass never lets up (hardcore).
const VALLEY_FALL = 0.3;
const VALLEY_RISE = 0.015;
const KICK_RANGE_DECAY = 0.995; // per frame: how quickly the reference for a strong hit is forgotten
const KICK_MIN_RANGE = 0.04;
const KICK_FLOOR = 0.3; // fraction of a strong hit ignored, so small bumps do not count
const KICK_DECAY = 0.86;
const SETTLE_EPSILON = 1e-3;
const MOVE_EPSILON = 5e-4; // per-frame change below which a bar counts as still

export class Visualizer {
  private mode: VisualizerMode = 'bars';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(1024);
  private timeData = new Uint8Array(2048);
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
  private gradientFor = { mode: '', color: '', h: 0 };
  // Wave mode: per-point heights, reused every frame
  private waveLevels = new Float32Array(BARS * 2 - 1);
  private settled = false;
  private lastColor = '';
  private resize: ResizeObserver;
  private analyze = false; // keep analysing for the beat effects even when the bars are off
  private valley = 0;
  private kickRange = 0;
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
    if (live && (playing || !this.settled)) this.analyser!.getByteFrequencyData(this.freq);
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

    // Both modes draw the same smoothed, auto-gained spectrum: as bars, or as a smooth curve
    const moving = this.updateSpectrum(live);
    this.settled = !moving && (!playing || this.opacity === 0);
    if (this.mode === 'bars') {
      const gap = 3 * dpr, bw = (w - gap * (BARS - 1)) / BARS;
      g.fillStyle = this.fillGradient(color, h);
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(2 * dpr, this.smooth[i] * h);
        g.beginPath();
        g.roundRect(i * (bw + gap), h - bh, bw, bh, [bw / 2, bw / 2, 0, 0]);
        g.fill();
      }
    } else {
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
    g.globalAlpha = 1;
  }

  // Spectrum into BARS smoothed levels (0–1), scaled against the recent peak, for both modes.
  // Returns whether the levels are still moving.
  private updateSpectrum(live: boolean) {
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
      if (Math.abs(delta) > MOVE_EPSILON) moving = true;
      this.smooth[i] += delta;
    }
    return moving;
  }

  // Wave heights: bass at both edges (beside the controls, where it stays visible) and treble in the
  // middle, with a light blur across neighbouring bands to soften the lobes
  private waveShape(amp: number) {
    const n = this.waveLevels.length;
    const band = (k: number) => this.smooth[BARS - 1 - Math.abs(clamp(k, 0, n - 1) - (BARS - 1))];
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
    this.valley += (bass - this.valley) * (bass < this.valley ? VALLEY_FALL : VALLEY_RISE);
    const rise = Math.max(0, bass - this.valley);
    this.kickRange = Math.max(rise, this.kickRange * KICK_RANGE_DECAY, KICK_MIN_RANGE);
    const hit = clamp((rise / this.kickRange - KICK_FLOOR) / (1 - KICK_FLOOR), 0, 1);
    this.kick = Math.max(hit, this.kick * KICK_DECAY);
  }

  // Keeps the analyser attached to an <audio> element that actually produces sound
  private updateSource(playing: boolean, now: number) {
    if (this.analyser && playing) {
      this.analyser.getByteTimeDomainData(this.timeData);
      let silent = true;
      for (let i = 0; i < this.timeData.length; i++) if (Math.abs(this.timeData[i] - 128) >= 2) { silent = false; break; }
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
      this.analyser.smoothingTimeConstant = 0.55; // low enough to keep kick transients sharp
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

  private disconnect() {
    try { this.source?.disconnect(); } catch { /* already disconnected */ }
    this.source = null; this.analyser = null; this.element = null; this.hasSignal = false;
    this.bassLevel = 0; this.kick = 0; this.valley = 0; this.kickRange = 0; this.peak = 0;
  }
}

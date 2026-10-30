// Audio analysis for the visualizer and the beat effects. Nuclear does not expose its audio graph to
// plugins, so this captures the playing <audio> element with captureStream() into a separate
// AudioContext that is never connected to the speakers (no double audio, Nuclear's EQ/crossfade untouched).
// Nuclear alternates two <audio> elements for crossfading: if the captured one stays silent while
// music plays, the next candidate is tried. When no element yields a signal (for example a stream the
// browser will not let us read), `live` stays false and the levels fall to zero instead of faking movement.
// All rates are "per frame at 60 fps" and converted to the real time step (see lib/math).
import { clamp, decay, ease } from '../lib/math';

export const BANDS = 64;
const SILENCE_MS = 1500; // silence while playing before trying another element
const RETRY_MS = 5000; // how often to retry once every element has been tried
const MIN_HZ = 40; // bands span MIN_HZ … MIN_HZ * SPAN on a log scale (40 Hz – 16 kHz)
const SPAN = 400;
// Automatic gain: bands are scaled against the recent peak so a loud master does not pin every band at
// the top and a quiet song still moves; the curve keeps sustained energy low and lets hits stand out.
const PEAK_DECAY = 0.996;
const MIN_PEAK = 0.2;
const GAIN_CURVE = 2.2;
const HEADROOM = 0.92;
const TREBLE_BOOST = 0.3; // higher bands carry less energy
const ATTACK = 0.5;
const RELEASE = 0.12;
// Beat detection on the bass band
const BASS_LO_HZ = 40;
const BASS_HI_HZ = 160;
// A kick is how far the bass jumps above the valley between hits, relative to recent hits. The valley
// falls fast and rises slowly, so kicks stand out even in music whose bass never lets up (hardcore).
const VALLEY_FALL = 0.3;
const VALLEY_RISE = 0.015;
const KICK_RANGE_DECAY = 0.995; // how quickly the reference for a strong hit is forgotten
const KICK_MIN_RANGE = 0.04;
const KICK_FLOOR = 0.3; // fraction of a strong hit ignored, so small bumps do not count
const KICK_DECAY = 0.86;
const SETTLE_EPSILON = 1e-3;
const MOVE_EPSILON = 5e-4; // change per frame below which a band counts as still

type CaptureElement = HTMLAudioElement & { captureStream?(): MediaStream; mozCaptureStream?(): MediaStream };

export class AudioAnalyser {
  // Smoothed, auto-gained level of each band (0–1), bass first
  readonly spectrum = new Float32Array(BANDS);
  private raw = new Float32Array(BANDS);
  private peak = 0;
  private moving = false;
  private active = false;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private element: HTMLAudioElement | null = null;
  private freq = new Uint8Array(1024);
  private timeData = new Uint8Array(2048);
  private silentSince = 0;
  private hasSignal = false;
  private tried = new Set<HTMLAudioElement>();
  private lastAttempt = 0;
  private lastLog = '';
  private bins = { rate: 0, edges: [] as number[], bassFrom: 1, bassTo: 2 };
  private valley = 0;
  private kickRange = 0;
  private bassLevel = 0;
  private kick = 0;

  // A real signal is being analysed
  get live() { return this.hasSignal && !!this.analyser; }
  // The spectrum has reached its targets (nothing to redraw while paused)
  get settled() { return !this.moving; }
  // Bass level (0–1, smoothed) and beat pulse (0–1, spikes on kicks); 0 without a real signal
  get level() { return this.bassLevel; }
  get pulse() { return this.kick; }

  // Capture only while something uses the analysis (visualizer shown or beat effects on)
  setActive(on: boolean) {
    this.active = on;
    if (!on) this.disconnect();
  }

  stop() {
    this.disconnect();
    this.tried.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  // Call once per frame with the time step in seconds
  update(playing: boolean, dt: number) {
    if (!this.active) return;
    this.updateSource(playing, performance.now());
    const live = this.live;
    // Skip the FFT while paused once the spectrum has settled
    if (live && (playing || this.moving)) this.analyser!.getByteFrequencyData(this.freq);
    this.updateBeat(live && playing, dt);
    this.updateSpectrum(live, dt);
  }

  private updateSpectrum(live: boolean, dt: number) {
    const { edges } = this.bands();
    // Pass 1: raw band levels and the frame peak; pass 2: normalise against the decaying peak
    let frameMax = 0;
    if (live) {
      for (let i = 0; i < BANDS; i++) {
        this.raw[i] = this.bandAvg(edges[i], Math.max(edges[i] + 1, edges[i + 1])) * (1 + (i / BANDS) * TREBLE_BOOST);
        frameMax = Math.max(frameMax, this.raw[i]);
      }
    }
    this.peak = Math.max(frameMax, this.peak * decay(PEAK_DECAY, dt));
    const attack = ease(ATTACK, dt), release = ease(RELEASE, dt), still = MOVE_EPSILON * dt * 60;
    let moving = false;
    for (let i = 0; i < BANDS; i++) {
      const v = live ? Math.pow(Math.min(1, this.raw[i] / Math.max(this.peak, MIN_PEAK)), GAIN_CURVE) * HEADROOM : 0;
      const delta = (v - this.spectrum[i]) * (v > this.spectrum[i] ? attack : release);
      if (Math.abs(delta) > still) moving = true;
      this.spectrum[i] += delta;
    }
    this.moving = moving;
  }

  private updateBeat(live: boolean, dt: number) {
    if (!live) {
      const fade = (v: number, d: number) => (v * decay(d, dt) < SETTLE_EPSILON ? 0 : v * decay(d, dt));
      this.bassLevel = fade(this.bassLevel, 0.92);
      this.kick = fade(this.kick, 0.85);
      return;
    }
    const { bassFrom, bassTo } = this.bands();
    const bass = this.bandAvg(bassFrom, bassTo);
    this.bassLevel += (bass - this.bassLevel) * ease(bass > this.bassLevel ? 0.5 : 0.08, dt);
    this.valley += (bass - this.valley) * ease(bass < this.valley ? VALLEY_FALL : VALLEY_RISE, dt);
    const rise = Math.max(0, bass - this.valley);
    this.kickRange = Math.max(rise, this.kickRange * decay(KICK_RANGE_DECAY, dt), KICK_MIN_RANGE);
    const hit = clamp((rise / this.kickRange - KICK_FLOOR) / (1 - KICK_FLOOR), 0, 1);
    this.kick = Math.max(hit, this.kick * decay(KICK_DECAY, dt));
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
      if (candidates.length) this.log('no <audio> element produced a signal; hiding the visualizer');
      if (now - this.lastAttempt < RETRY_MS || !candidates.length) return;
      this.tried.clear(); // every element tried: start over after a pause
      next = candidates[0];
    }
    this.lastAttempt = now;
    this.attach(next);
  }

  private attach(element: CaptureElement) {
    this.disconnect();
    this.tried.add(element);
    this.element = element;
    this.silentSince = 0;
    try {
      const capture = element.captureStream || element.mozCaptureStream;
      if (!capture) return this.log('captureStream() is not available');
      const stream = capture.call(element);
      if (!stream.getAudioTracks().length) return this.log('the captured stream has no audio track');
      this.stream = stream;
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
      this.disconnect();
    }
  }

  // Diagnostics in the developer console (once per distinct message)
  private log(message: string) {
    if (message === this.lastLog) return;
    this.lastLog = message;
    console.info(`[Now Playing] visualizer: ${message} (src: ${this.element?.currentSrc?.slice(0, 80) || '?'})`);
  }

  // FFT bin ranges for the bands and the bass, computed once per sample rate
  private bands() {
    const rate = this.ctx?.sampleRate || 48000;
    if (rate !== this.bins.rate) {
      const bin = (hz: number) => Math.max(1, Math.round(hz / (rate / 2 / this.freq.length)));
      const bassFrom = bin(BASS_LO_HZ);
      this.bins = {
        rate,
        edges: Array.from({ length: BANDS + 1 }, (_, k) => bin(MIN_HZ * Math.pow(SPAN, k / BANDS))),
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

  // Releases the captured stream too: its tracks keep capturing until stopped
  private disconnect() {
    try { this.source?.disconnect(); } catch { /* already disconnected */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null; this.source = null; this.analyser = null; this.element = null; this.hasSignal = false;
    this.bassLevel = 0; this.kick = 0; this.valley = 0; this.kickRange = 0; this.peak = 0;
  }
}

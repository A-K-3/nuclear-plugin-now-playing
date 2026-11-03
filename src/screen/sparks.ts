// The Sparks visualizer. Three styles:
// - burst: sparks thrown out from the artwork's edges on the kicks (the bass sends big slow ones from
//   the bottom and sides, the treble fine fast ones from the top). Born white hot, they take the
//   artwork's colours as they cool, leave a streak, curl, fall a little and fade; the ones that curl
//   back onto the artwork die in a flash. Strong kicks add a shockwave in the artwork's shape.
// - fire: embers rising from the bottom of the screen, as high as the music is loud.
// - swarm: a cloud that circles the artwork, or follows the cursor, and scatters on the kicks.
// In every style: nothing in silence, the cursor leaves a trail, SoundCloud comments burst into
// sparks as they go, the drop of a song (the music jumping well above its recent level) brings the
// artwork together out of sparks before blowing it apart, and the last kicks of a song set off
// fireworks. Sparks dim over the title and the lyrics. With the system's "reduce motion" there are
// far fewer, and no shockwaves, drops or fireworks.
// Rates are per 60 fps frame; lengths are in CSS px (multiplied by the device pixel ratio).
import { clamp, decay, ease, frames } from '../lib/math';
import type { Prefs } from '../settings';
import { OUTLINE_CORNER, roundedSquare } from './outline';

export type Rect = { x: number; y: number; w: number; h: number };
export type Rgb = number[];
// Everything a frame needs: positions in canvas pixels, except `avoid` (CSS px, relative to the canvas)
export type SparkFrame = {
  box: { cx: number; cy: number; half: number; w: number; h: number };
  avoid: Rect[];
  dpr: number;
  opacity: number;
  // Seconds since the last frame (0 while paused)
  dt: number;
  pulse: number;
  level: number;
  spectrum: Float32Array;
  // Seconds left in the song (Infinity when unknown)
  remaining: number;
  // The cursor while it leads the sparks, or null
  pointer: { x: number; y: number } | null;
};

const AMOUNT: Record<Prefs['sparkAmount'], number> = { low: 0.5, normal: 1, high: 2 };
const REDUCED_MOTION_AMOUNT = 0.3;
const MAX = 1000;
// Below this bass level (and pulse) nothing is thrown: silence and calm passages stay calm
const QUIET = 0.06;
const WHITE = '#ffffff';
const GREYS = [WHITE, '#d8d8e4', '#a9a9bd'];

// perRise: sparks per unit the beat pulse rises (the moment of a kick, not its fading tail); burst on
// a strong kick; a tiny trickle while the bass is above trickleLevel; perTrebleRise for the top bands
const BURST = { perRise: 16, burst: 12, trickle: 0.04, trickleLevel: 0.6, perTrebleRise: 30, trebleFrom: 40, speed: 1.6,
  drag: 0.985, spin: 0.012, hot: 0.72, gravity: 0.02 };
// How sparks leave the artwork's edge: speed and radius ranges, and how fast they fade
type Throw = { speed: [number, number]; r: [number, number]; fade: number };
const BASS: Throw = { speed: [0.6, 2.4], r: [1, 2], fade: 0.018 };
const TREBLE: Throw = { speed: [2, 5], r: [0.4, 0.8], fade: 0.028 };
const DROP_THROW: Throw = { speed: [2, 6], r: [0.75, 1.75], fade: 0.0145 };
// A strong kick: the pulse reaching `strong` after dropping below `calm`
const KICK = { strong: 0.75, calm: 0.45 };
const SHOCK = { max: 6, speed: 0.022, life: 0.03, alpha: 0.7, width: 5 };
const FIRE = { rate: 4, kick: 30, rise: 2.2, sway: 0.12, buoyancy: 0.012 };
const SWARM = { population: 260, perFrame: 8, accel: 0.22, maxSpeed: 7, damping: 0.97, fade: 0.0035, scatter: 9, follow: 34 };
// fast/slow: how quickly two loudness averages follow the music; a drop is the fast one at `ratio`
// times the slow one and above `min`, on a strong kick, after warmUp frames, at most every cooldown
const DROP = { fast: 0.12, slow: 0.004, ratio: 1.5, min: 0.35, warmUp: 360, cooldown: 900, burst: 90 };
// The artwork made of sparks: one per pixel, `scale` times the artwork (its middle is behind the
// artwork itself), flying in, holding `hold` frames, then blowing apart
const FORM = { scale: 1.6, pull: 0.1, hold: 70, cell: 0.8, speed: 4, shard: 0.9 };
const FIREWORKS = { within: 4, after: 10, rockets: 3, each: 50, fade: 0.016 };
const TRAIL = { spacing: 14, perFrame: 6, fade: 0.035 };
const POP = { max: 8, count: 24, fade: 0.03 };
const FLASH = { max: 20, life: 0.08, radius: 7 };
const AVOID_ALPHA = 0.12;
// Drawing is batched: alpha and line width are rounded to this many levels
const LEVELS = 6;

// What each spark is: thrown from the artwork's edge, thrown elsewhere (cursor trail, comments), part
// of the artwork forming, a swarm member, an ember, a firework, a piece of the artwork blown apart
const EDGE = 0, LOOSE = 1, FORMING = 2, BEE = 3, EMBER = 4, ROCKET = 5, SHARD = 6;
// By kind: the streak behind a spark (in frames of its motion) and its gravity (negative: it rises)
const TRAIL_OF = [3.5, 3.5, 0, 2, 4, 3.5, 3.5];
const GRAVITY_OF = [BURST.gravity, BURST.gravity, 0, 0, -FIRE.buoyancy, BURST.gravity * 1.5, BURST.gravity];
// Edge sparks and embers are white while young; the others keep their colour
const STARTS_WHITE = [true, false, false, false, true, false, false];

// One value per spark in each of these arrays. color: index into the palette, or into the
// artwork's pixels for FORMING and SHARD
const FIELDS = ['x', 'y', 'vx', 'vy', 'life', 'fade', 'r', 'spin', 'color', 'kind', 'tx', 'ty', 'hold'] as const;
type Field = (typeof FIELDS)[number];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

export class SparkField {
  private s = Object.fromEntries(FIELDS.map((f) => [f, new Float32Array(MAX)])) as Record<Field, Float32Array>;
  private n = 0;
  private style: Prefs['sparkStyle'] = 'burst';
  private amount = 1;
  private reducedMotion = false;
  private outline = roundedSquare(96);
  // Outline points facing down or sideways (bass), up (treble), and all of them
  private lower: number[] = [];
  private upper: number[] = [];
  private all: number[] = [];
  // Accent, the cover's own colour lightened, the accent shifted in hue
  private palette = GREYS;
  // The artwork's pixels (grid × grid colours, row by row) for the drop, or null
  private artwork: { grid: number; pixels: string[] } | null = null;
  private debt = 0;
  private trebleDebt = 0;
  private lastPulse = 0;
  private lastTreble = 0;
  private kickArmed = true;
  private shocks: Array<{ size: number; life: number }> = [];
  private flashes: Array<{ x: number; y: number; life: number }> = [];
  private pops: Rect[] = [];
  private fastLoud = 0;
  private slowLoud = 0;
  private clock = 0;
  private lastDrop = -Infinity;
  private fireworksDone = false;
  private lastPointer = { x: 0, y: 0, set: false };

  constructor() {
    const { y } = this.outline;
    for (let k = 0; k < y.length; k++) { (y[k] > -0.2 ? this.lower : this.upper).push(k); this.all.push(k); }
  }

  get busy() { return this.n > 0 || this.shocks.length > 0 || this.flashes.length > 0; }

  configure(style: Prefs['sparkStyle'], amount: Prefs['sparkAmount'], reducedMotion: boolean) {
    if (style !== this.style) this.reset();
    this.style = style;
    this.amount = AMOUNT[amount];
    this.reducedMotion = reducedMotion;
  }

  // From the artwork: its accent and own colour (null until known) and its pixels
  setArtwork(accent: Rgb | null, tint: Rgb | null, artwork: { grid: number; pixels: string[] } | null) {
    this.artwork = artwork;
    this.palette = !accent || accent.every((v) => v > 245) ? GREYS
      : [rgb(accent), rgb(mix(tint ?? accent, [255, 255, 255], 0.45)), rgb(hueShift(accent, 35))];
  }

  // A SoundCloud comment bubble went away here (canvas pixels)
  pop(rect: Rect) { if (this.pops.length < POP.max) this.pops.push(rect); }

  reset() {
    this.n = 0;
    this.debt = this.trebleDebt = 0;
    this.lastPulse = this.lastTreble = 0;
    this.kickArmed = true;
    this.shocks = [];
    this.flashes = [];
    this.pops = [];
    this.lastPointer.set = false;
  }

  draw(g: CanvasRenderingContext2D, f: SparkFrame) {
    if (f.dt) this.listen(f);
    this.move(f);
    g.globalCompositeOperation = 'lighter';
    this.drawShocks(g, f);
    this.drawSparks(g, f);
    this.drawFlashes(g, f);
  }

  // Reacts to the music and the cursor: decides which sparks are born this frame
  private listen(f: SparkFrame) {
    const { pulse, level, dt } = f, step = frames(dt);
    const amount = this.amount * (this.reducedMotion ? REDUCED_MOTION_AMOUNT : 1);
    this.clock += step;
    // Loudness now and over the last half minute or so
    this.fastLoud += (level - this.fastLoud) * ease(DROP.fast, dt);
    this.slowLoud += (level - this.slowLoud) * ease(DROP.slow, dt);
    let strong = false;
    if (pulse < KICK.calm) this.kickArmed = true;
    else if (pulse >= KICK.strong && this.kickArmed) { this.kickArmed = false; strong = true; }
    const rise = Math.max(0, pulse - this.lastPulse);
    this.lastPulse = pulse;

    if (strong && !this.reducedMotion) this.onStrongKick(f);
    if (level >= QUIET || pulse >= 0.2) {
      if (this.style === 'burst') this.spawnBurst(f, rise, strong, amount);
      else if (this.style === 'fire') this.spawnFire(f, rise, amount);
      else this.spawnSwarm(f, rise, amount);
    }
    // The last kicks of the song: fireworks, once
    if (f.remaining > FIREWORKS.after) this.fireworksDone = false;
    else if (!this.reducedMotion && strong && !this.fireworksDone && f.remaining < FIREWORKS.within && f.remaining > 0.3) {
      this.fireworksDone = true;
      for (let r = 0; r < FIREWORKS.rockets; r++) this.firework(f, r);
    }
    this.cursorTrail(f, amount);
    for (const rect of this.pops.splice(0)) this.burstFrom(rect, f);
  }

  private spawnBurst(f: SparkFrame, rise: number, strong: boolean, amount: number) {
    const { level, spectrum, dt } = f;
    let treble = 0;
    for (let i = BURST.trebleFrom; i < spectrum.length; i++) treble += spectrum[i];
    treble /= Math.max(1, spectrum.length - BURST.trebleFrom);
    const trebleRise = Math.max(0, treble - this.lastTreble);
    this.lastTreble = treble;
    this.debt += (rise * BURST.perRise + (strong ? BURST.burst : 0) + (level > BURST.trickleLevel ? BURST.trickle * frames(dt) : 0)) * amount;
    this.trebleDebt += trebleRise * BURST.perTrebleRise * amount;
    for (; this.debt >= 1; this.debt--) this.throwFromEdge(f, this.lower, BASS);
    for (; this.trebleDebt >= 1; this.trebleDebt--) this.throwFromEdge(f, this.upper, TREBLE);
  }

  private spawnFire(f: SparkFrame, rise: number, amount: number) {
    this.debt += (f.level * FIRE.rate * frames(f.dt) + rise * FIRE.kick) * amount;
    for (; this.debt >= 1; this.debt--) this.ember(f);
  }

  private spawnSwarm(f: SparkFrame, rise: number, amount: number) {
    const target = (0.15 + f.level) * SWARM.population * amount;
    let alive = 0;
    for (let i = 0; i < this.n; i++) if (this.s.kind[i] === BEE) alive++;
    for (let k = alive; k < target && k < alive + SWARM.perFrame; k++) this.bee(f);
    if (rise > 0.15) this.scatter(f, rise * SWARM.scatter);
  }

  private onStrongKick(f: SparkFrame) {
    if (this.shocks.length < SHOCK.max && this.style === 'burst') this.shocks.push({ size: 1, life: 1 });
    // The drop: the music jumping well above its recent level
    const drop = this.clock > DROP.warmUp && this.clock - this.lastDrop > DROP.cooldown
      && this.fastLoud > DROP.min && this.fastLoud > this.slowLoud * DROP.ratio;
    if (!drop) return;
    this.lastDrop = this.clock;
    if (this.artwork) this.formArtwork(f, this.artwork);
    else {
      for (let i = 0; i < DROP.burst; i++) this.throwFromEdge(f, this.all, DROP_THROW);
      this.shocks.push({ size: 1, life: 1 }, { size: 0.8, life: 1.2 });
    }
  }

  // Spawns one spark (dropped when full). Radius in CSS px.
  private add(kind: number, x: number, y: number, vx: number, vy: number, r: number, fade: number, f: SparkFrame,
    o: Partial<Record<Field, number>> = {}) {
    if (this.n >= MAX) return;
    const i = this.n++, s = this.s;
    s.kind[i] = kind; s.x[i] = x; s.y[i] = y; s.vx[i] = vx; s.vy[i] = vy; s.r[i] = r * f.dpr; s.fade[i] = fade; s.life[i] = 1;
    s.spin[i] = 0; s.color[i] = Math.floor(Math.random() * 3); s.tx[i] = 0; s.ty[i] = 0; s.hold[i] = 0;
    for (const k in o) s[k as Field][i] = o[k as Field]!;
  }

  private throwFromEdge(f: SparkFrame, from: number[], t: Throw) {
    const { box, dpr, pulse } = f, { x, y, dx, dy } = this.outline;
    const k = from[Math.floor(Math.random() * from.length)];
    const speed = rand(...t.speed) * (0.5 + pulse) * BURST.speed * dpr, turn = rand(-0.4, 0.4), cos = Math.cos(turn), sin = Math.sin(turn);
    this.add(EDGE, box.cx + x[k] * box.half, box.cy + y[k] * box.half, (dx[k] * cos - dy[k] * sin) * speed, (dx[k] * sin + dy[k] * cos) * speed,
      rand(...t.r), t.fade, f, { spin: sign() * BURST.spin * rand(0.5, 1.5) });
  }

  // An ember from the bottom of the screen, dying about as high as the music is loud
  private ember(f: SparkFrame) {
    const { box, dpr, level } = f, vy = -rand(1, 2) * FIRE.rise * (0.5 + level) * dpr;
    const height = box.h * (0.25 + 0.6 * level) * rand(0.6, 1.2);
    this.add(EMBER, Math.random() * box.w, box.h + 4 * dpr, rand(-0.5, 0.5) * dpr, vy, rand(0.8, 2.4), Math.abs(vy) / height, f);
  }

  // A swarm member: born at the artwork's edge (or around the cursor it follows), with its own place
  // in the orbit (tx: angle, ty: radius)
  private bee(f: SparkFrame) {
    const { box, dpr, pointer } = f, { x, y } = this.outline, k = Math.floor(Math.random() * x.length);
    const a = Math.random() * Math.PI * 2, r = SWARM.follow * dpr * rand(1, 2);
    const [bx, by] = pointer ? [pointer.x + Math.cos(a) * r, pointer.y + Math.sin(a) * r] : [box.cx + x[k] * box.half, box.cy + y[k] * box.half];
    this.add(BEE, bx, by, 0, 0, rand(0.7, 1.7), SWARM.fade, f,
      { tx: Math.random() * Math.PI * 2, ty: rand(1.15, 1.65), spin: sign() * rand(0.006, 0.016) });
  }

  // Pushes the swarm away from where it is heading
  private scatter(f: SparkFrame, strength: number) {
    const s = this.s, c = f.pointer ?? { x: f.box.cx, y: f.box.cy };
    for (let i = 0; i < this.n; i++) {
      const dx = s.x[i] - c.x, dy = s.y[i] - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1, push = strength * f.dpr * Math.random();
      s.vx[i] += (dx / d) * push;
      s.vy[i] += (dy / d) * push;
    }
  }

  // `count` sparks flying outwards from the edge of an ellipse (a point when rx = ry = 0)
  private radial(kind: number, f: SparkFrame, cx: number, cy: number, rx: number, ry: number, count: number,
    speed: [number, number], r: [number, number], fade: number, color?: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(0, 0.2), v = rand(...speed) * f.dpr;
      this.add(kind, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.cos(a) * v, Math.sin(a) * v, rand(...r), fade, f,
        color === undefined ? {} : { color });
    }
  }

  private firework(f: SparkFrame, index: number) {
    const { box } = f;
    this.radial(ROCKET, f, box.w * rand(0.2, 0.8), box.h * rand(0.15, 0.45), 0, 0, FIREWORKS.each, [2, 5], [1, 2], FIREWORKS.fade, index % 3);
  }

  // A burst from the edges of a box (a comment going away)
  private burstFrom(r: Rect, f: SparkFrame) {
    this.radial(LOOSE, f, r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, POP.count, [1, 3], [0.7, 1.7], POP.fade);
  }

  // The artwork drawn with sparks, gathering from its edges into a larger copy around it
  private formArtwork(f: SparkFrame, art: { grid: number; pixels: string[] }) {
    const { box } = f, { x, y } = this.outline, n = art.grid;
    const half = box.half * FORM.scale, cell = (2 * half) / n;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const k = Math.floor(Math.random() * x.length);
        this.add(FORMING, box.cx + x[k] * box.half, box.cy + y[k] * box.half, 0, 0, (cell * FORM.cell * 0.5) / f.dpr, 0, f,
          { color: gy * n + gx, tx: box.cx - half + (gx + 0.5) * cell, ty: box.cy - half + (gy + 0.5) * cell, hold: FORM.hold + rand(0, 10) });
      }
    }
  }

  // Sparks along the cursor's path
  private cursorTrail(f: SparkFrame, amount: number) {
    const p = f.pointer, last = this.lastPointer;
    if (p && last.set) {
      const dist = Math.hypot(p.x - last.x, p.y - last.y), count = Math.min(TRAIL.perFrame, (dist / (TRAIL.spacing * f.dpr)) * amount);
      for (let i = 0; i < count; i++) {
        const t = Math.random();
        this.add(LOOSE, last.x + (p.x - last.x) * t, last.y + (p.y - last.y) * t, rand(-1, 1) * f.dpr, rand(-1, 1) * f.dpr,
          rand(0.6, 1.6) * (0.7 + f.level), TRAIL.fade, f);
      }
    }
    last.set = !!p;
    if (p) { last.x = p.x; last.y = p.y; }
  }

  // Moves every spark one step, and removes the dead ones
  private move(f: SparkFrame) {
    const s = this.s, { box, dt, dpr } = f, step = frames(dt);
    const drag = decay(BURST.drag, dt), damping = decay(SWARM.damping, dt), pull = ease(FORM.pull, dt);
    const centre = f.pointer ?? { x: box.cx, y: box.cy };
    for (let i = 0; i < this.n; i++) {
      const kind = s.kind[i];
      if (kind === FORMING) { this.form(i, f, pull); continue; }
      if (kind === BEE) this.steer(i, f, centre, damping);
      else {
        // Curl: turn the velocity a little each frame
        if (s.spin[i]) {
          const a = s.spin[i] * step, cos = Math.cos(a), sin = Math.sin(a), vx = s.vx[i];
          s.vx[i] = vx * cos - s.vy[i] * sin; s.vy[i] = vx * sin + s.vy[i] * cos;
        }
        s.vx[i] *= drag; s.vy[i] *= drag;
        s.vy[i] += GRAVITY_OF[kind] * dpr * step;
        if (kind === EMBER) s.vx[i] += rand(-0.5, 0.5) * FIRE.sway * dpr * step;
      }
      s.x[i] += s.vx[i] * step; s.y[i] += s.vy[i] * step;
      s.life[i] -= s.fade[i] * step;
      // Edge sparks that curl back onto the artwork die there in a flash
      if (kind === EDGE && s.life[i] < 0.85 && Math.abs(s.x[i] - box.cx) < box.half && Math.abs(s.y[i] - box.cy) < box.half) {
        if (this.flashes.length < FLASH.max) this.flashes.push({ x: s.x[i], y: s.y[i], life: 1 });
        s.life[i] = 0;
      }
      if (s.life[i] > 0) continue;
      // Move the last spark into this slot and look at the slot again
      const last = --this.n;
      for (const field of FIELDS) s[field][i] = s[field][last];
      i--;
    }
  }

  // Part of the artwork forming: flies to its place, holds, then blows apart from the middle
  private form(i: number, f: SparkFrame, pull: number) {
    const s = this.s, { box, dpr, dt } = f;
    s.x[i] += (s.tx[i] - s.x[i]) * pull; s.y[i] += (s.ty[i] - s.y[i]) * pull;
    s.hold[i] -= frames(dt);
    if (s.hold[i] > 0) return;
    const dx = s.x[i] - box.cx, dy = s.y[i] - box.cy, d = Math.sqrt(dx * dx + dy * dy) || 1, speed = rand(1, 2) * FORM.speed * dpr;
    s.kind[i] = SHARD; s.vx[i] = (dx / d) * speed; s.vy[i] = (dy / d) * speed; s.fade[i] = BASS.fade; s.r[i] = FORM.shard * dpr;
  }

  // A swarm member heads for its place in the orbit around the artwork, or near the cursor
  private steer(i: number, f: SparkFrame, centre: { x: number; y: number }, damping: number) {
    const s = this.s, { dt, dpr, box, level } = f, step = frames(dt);
    s.tx[i] += s.spin[i] * step * (1 + level * 2);
    const radius = f.pointer ? SWARM.follow * dpr * s.ty[i] : box.half * s.ty[i];
    const dx = centre.x + Math.cos(s.tx[i]) * radius - s.x[i], dy = centre.y + Math.sin(s.tx[i]) * radius - s.y[i];
    const d = Math.sqrt(dx * dx + dy * dy) || 1, a = SWARM.accel * dpr * (1 + level) * step;
    s.vx[i] += (dx / d) * a; s.vy[i] += (dy / d) * a;
    const v = Math.sqrt(s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i]), max = SWARM.maxSpeed * dpr * (0.6 + level);
    const k = (v > max ? max / v : 1) * damping;
    s.vx[i] *= k; s.vy[i] *= k;
  }

  // Streaks, batched: one path per colour, alpha level and width level (rather than one per spark)
  private drawSparks(g: CanvasRenderingContext2D, f: SparkFrame) {
    const s = this.s, paths = new Map<number, Path2D>(), art = this.artwork?.pixels;
    for (let i = 0; i < this.n; i++) {
      const kind = s.kind[i];
      if (kind === FORMING) continue;
      const life = clamp(s.life[i], 0, 1);
      // Colour slot: 0 white, 1–3 the palette, 4 and up the artwork's pixels (shards)
      const slot = kind === SHARD ? 4 + s.color[i] : STARTS_WHITE[kind] && life > BURST.hot ? 0 : 1 + s.color[i];
      const alpha = Math.round(life * this.dim(s.x[i], s.y[i], f) * (LEVELS - 1));
      if (!alpha) continue;
      const width = kind === SHARD ? 0 : Math.min(LEVELS - 1, Math.round(s.r[i] * (0.8 + 1.2 * life) / f.dpr));
      const key = (slot * LEVELS + alpha) * LEVELS + width;
      let path = paths.get(key);
      if (!path) paths.set(key, (path = new Path2D()));
      const trail = TRAIL_OF[kind];
      path.moveTo(s.x[i] - s.vx[i] * trail, s.y[i] - s.vy[i] * trail);
      path.lineTo(s.x[i], s.y[i]);
    }
    g.lineCap = 'round';
    for (const [key, path] of paths) {
      const width = key % LEVELS, alpha = Math.floor(key / LEVELS) % LEVELS, slot = Math.floor(key / LEVELS / LEVELS);
      g.strokeStyle = slot === 0 ? WHITE : slot < 4 ? this.palette[slot - 1] : art?.[slot - 4] ?? WHITE;
      g.globalAlpha = f.opacity * (alpha / (LEVELS - 1));
      g.lineWidth = (slot >= 4 ? FORM.shard * 2 : Math.max(1, width)) * f.dpr;
      g.stroke(path);
    }
    // The artwork forming: one small square per pixel, in its own colour
    g.globalAlpha = f.opacity * 0.9;
    for (let i = 0; i < this.n; i++) {
      if (s.kind[i] !== FORMING) continue;
      const size = s.r[i] * 2;
      g.fillStyle = art?.[s.color[i]] ?? WHITE;
      g.fillRect(s.x[i] - size / 2, s.y[i] - size / 2, size, size);
    }
  }

  // Sparks over the title or the lyrics are dimmed
  private dim(x: number, y: number, f: SparkFrame) {
    const cx = x / f.dpr, cy = y / f.dpr;
    for (const r of f.avoid) if (cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h) return AVOID_ALPHA;
    return 1;
  }

  // Outlines of the artwork running outwards, thinning and fading
  private drawShocks(g: CanvasRenderingContext2D, f: SparkFrame) {
    const { box, dpr } = f, step = frames(f.dt);
    g.strokeStyle = this.palette[0];
    let kept = 0;
    for (const shock of this.shocks) {
      shock.size += SHOCK.speed * step * (1 + shock.life);
      shock.life -= SHOCK.life * step;
      if (shock.life <= 0) continue;
      this.shocks[kept++] = shock;
      const h = box.half * shock.size;
      g.globalAlpha = f.opacity * Math.min(1, shock.life) * SHOCK.alpha;
      g.lineWidth = (1 + SHOCK.width * Math.min(1, shock.life)) * dpr;
      g.beginPath();
      g.roundRect(box.cx - h, box.cy - h, 2 * h, 2 * h, h * OUTLINE_CORNER);
      g.stroke();
    }
    this.shocks.length = kept;
  }

  // Small bursts of light where sparks fell back onto the artwork
  private drawFlashes(g: CanvasRenderingContext2D, f: SparkFrame) {
    let kept = 0;
    g.fillStyle = WHITE;
    for (const flash of this.flashes) {
      flash.life -= FLASH.life * frames(f.dt);
      if (flash.life <= 0) continue;
      this.flashes[kept++] = flash;
      g.globalAlpha = f.opacity * flash.life * 0.8;
      g.beginPath();
      g.arc(flash.x, flash.y, FLASH.radius * f.dpr * (1.5 - flash.life), 0, Math.PI * 2);
      g.fill();
    }
    this.flashes.length = kept;
  }
}

const rgb = (c: Rgb) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(', ')})`;
const mix = (a: Rgb, b: Rgb, t: number) => a.map((v, i) => v + (b[i] - v) * t);

// The same colour with its hue turned by `degrees` (a rotation around the grey axis)
function hueShift([r, g, b]: Rgb, degrees: number): Rgb {
  const a = (degrees * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), k = 1 / 3, sq = Math.sqrt(k), c = k * (1 - cos);
  return [
    r * (cos + c) + g * (c - sq * sin) + b * (c + sq * sin),
    r * (c + sq * sin) + g * (cos + c) + b * (c - sq * sin),
    r * (c - sq * sin) + g * (c + sq * sin) + b * (cos + c),
  ];
}

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
// Rates are per 60 fps frame (`step` is the time step in such frames); lengths are in CSS px.
import { clamp } from '../lib/math';
import { OUTLINE_CORNER, roundedSquare } from './outline';

export type SparkStyle = 'burst' | 'fire' | 'swarm';
export type SparkAmount = 'low' | 'normal' | 'high';
export type Rect = { x: number; y: number; w: number; h: number };
// Everything drawing needs, in canvas pixels
export type SparkFrame = {
  box: { cx: number; cy: number; half: number; w: number; h: number };
  avoid: Rect[];
  dpr: number;
  opacity: number;
  step: number;
  pulse: number;
  level: number;
  spectrum: Float32Array;
  // Seconds left in the song (Infinity when unknown)
  remaining: number;
  pointer: { x: number; y: number } | null;
};

const AMOUNT: Record<SparkAmount, number> = { low: 0.5, normal: 1, high: 2 };
const REDUCED_MOTION_AMOUNT = 0.3;
const MAX = 900;
// Below this bass level (and pulse) nothing is thrown: silence and calm passages stay calm
const QUIET = 0.06;
const WHITE = '#ffffff';

// quiet → burst: perRise per unit the beat pulse rises (the moment of a kick, not its fading tail),
// burst on a strong kick, a tiny trickle while the bass is above trickleLevel; perTrebleRise for the
// top bands (trebleFrom up)
const BURST = { perRise: 16, burst: 12, trickle: 0.04, trickleLevel: 0.6, perTrebleRise: 30, trebleFrom: 40, speed: 1.6,
  fade: 0.018, trebleFade: 0.028, drag: 0.985, spin: 0.012, trail: 3.5, hot: 0.72, gravity: 0.02 };
// A strong kick (the pulse reaching `strong` after dropping below `calm`)
const KICK = { strong: 0.75, calm: 0.45 };
const SHOCK = { max: 6, speed: 0.022, life: 0.03, alpha: 0.7, width: 5 };
const FIRE = { rate: 4, kick: 30, rise: 2.2, sway: 0.12, buoyancy: 0.012, trail: 4 };
const SWARM = { population: 260, accel: 0.22, maxSpeed: 7, fade: 0.0035, scatter: 9, follow: 34, trail: 2 };
// fast/slow: how quickly the two loudness averages follow the music; a drop is the fast one at
// `ratio` times the slow one and above `min`, on a strong kick, after warmUp frames, at most every cooldown
const DROP = { fast: 0.12, slow: 0.004, ratio: 1.5, min: 0.35, warmUp: 360, cooldown: 900, burst: 90 };
// The artwork made of sparks: grid × grid sparks, `scale` times the artwork (its middle is behind
// the artwork itself), flying in, holding `hold` frames, then blowing apart
const FORM = { grid: 20, scale: 1.6, pull: 0.1, hold: 70, cell: 0.8, speed: 4, shard: 0.9 };
const FIREWORKS = { within: 4, after: 10, rockets: 3, each: 50, fade: 0.016 };
const TRAIL = { spacing: 14, perFrame: 6, fade: 0.035 };
const POP = { count: 24, fade: 0.03 };
const FLASH = { life: 0.08, radius: 7 };
const AVOID_ALPHA = 0.12;

// What each spark is: thrown (burst, trail, comment), part of the artwork forming, a swarm member,
// an ember, a firework, a piece of the artwork blown apart (keeps its pixel's colour)
const THROWN = 0, FORMING = 1, BEE = 2, EMBER = 3, ROCKET = 4, SHARD = 5;
// Share of the way covered in `step` frames, given the share covered per frame
const toward = (perFrame: number, step: number) => 1 - Math.pow(1 - perFrame, step);
// One value per spark in each of these arrays. color: index into `colors` (-1: white while hot)
const FIELDS = ['x', 'y', 'vx', 'vy', 'life', 'fade', 'r', 'spin', 'trail', 'gravity', 'color', 'kind', 'tx', 'ty', 'hold'] as const;
type Field = (typeof FIELDS)[number];

export class SparkField {
  private s = Object.fromEntries(FIELDS.map((f) => [f, new Float32Array(MAX)])) as Record<Field, Float32Array>;
  private n = 0;
  private style: SparkStyle = 'burst';
  private amount = 1;
  private reducedMotion = false;
  private outline = roundedSquare(96);
  // Outline points facing down or sideways (bass) and up (treble)
  private lower: number[] = [];
  private upper: number[] = [];
  // The palette (accent, the cover's own colour lightened, the accent shifted in hue), then the
  // artwork's pixels for the drop
  private palette = [WHITE, WHITE, WHITE];
  private artwork: string[] | null = null;
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
  private lastPointer: { x: number; y: number } | null = null;

  constructor() {
    const { y } = this.outline;
    for (let k = 0; k < y.length; k++) (y[k] > -0.2 ? this.lower : this.upper).push(k);
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!query?.matches;
    query?.addEventListener?.('change', () => { this.reducedMotion = query.matches; });
  }

  get busy() { return this.n > 0 || this.shocks.length > 0 || this.flashes.length > 0; }

  configure(style: SparkStyle, amount: SparkAmount) {
    if (style !== this.style) this.reset();
    this.style = style;
    this.amount = AMOUNT[amount] ?? 1;
  }

  setColors(accent: string, tint: string) {
    const a = parseRgb(accent), t = parseRgb(`rgb(${tint})`);
    if (!a || (a[0] > 245 && a[1] > 245 && a[2] > 245)) { this.palette = [WHITE, '#d8d8e4', '#a9a9bd']; return; }
    this.palette = [accent, rgb(mix(t ?? a, [255, 255, 255], 0.45)), rgb(hueShift(a, 35))];
  }

  // The artwork's pixels (FORM.grid × FORM.grid colours, row by row), or null
  setArtwork(pixels: string[] | null) { this.artwork = pixels; }
  static readonly ARTWORK_GRID = FORM.grid;

  // A SoundCloud comment bubble went away here (canvas pixels)
  pop(rect: Rect) { if (this.pops.length < 8) this.pops.push(rect); }

  reset() {
    this.n = 0;
    this.debt = this.trebleDebt = 0;
    this.lastPulse = this.lastTreble = 0;
    this.kickArmed = true;
    this.shocks = [];
    this.flashes = [];
    this.pops = [];
    this.lastPointer = null;
  }

  draw(g: CanvasRenderingContext2D, f: SparkFrame) {
    const amount = this.amount * (this.reducedMotion ? REDUCED_MOTION_AMOUNT : 1), { step } = f;
    if (step) this.listen(f, amount);
    this.move(f);
    g.globalCompositeOperation = 'lighter';
    this.drawShocks(g, f);
    this.drawSparks(g, f);
    this.drawFlashes(g, f);
  }

  // Reacts to the music and the cursor: decides which sparks are born this frame
  private listen(f: SparkFrame, amount: number) {
    const { pulse, level, step } = f, calm = level < QUIET && pulse < 0.2;
    this.clock += step;
    // Loudness now and over the last half minute or so
    this.fastLoud += (level - this.fastLoud) * toward(DROP.fast, step);
    this.slowLoud += (level - this.slowLoud) * toward(DROP.slow, step);
    let strong = false;
    if (pulse < KICK.calm) this.kickArmed = true;
    else if (pulse >= KICK.strong && this.kickArmed) { this.kickArmed = false; strong = true; }
    const rise = Math.max(0, pulse - this.lastPulse);
    this.lastPulse = pulse;
    let treble = 0;
    for (let i = BURST.trebleFrom; i < f.spectrum.length; i++) treble += f.spectrum[i];
    treble /= Math.max(1, f.spectrum.length - BURST.trebleFrom);
    const trebleRise = Math.max(0, treble - this.lastTreble);
    this.lastTreble = treble;

    const fancy = !this.reducedMotion;
    if (strong && fancy) this.onStrongKick(f);

    if (!calm) {
      if (this.style === 'burst') {
        this.debt += (rise * BURST.perRise + (strong ? BURST.burst : 0) + (level > BURST.trickleLevel ? BURST.trickle * step : 0)) * amount;
        this.trebleDebt += trebleRise * BURST.perTrebleRise * amount;
        for (; this.debt >= 1; this.debt--) this.throwFromEdge(f, this.lower, 0.6, 2.4, 2, 4, BURST.fade);
        for (; this.trebleDebt >= 1; this.trebleDebt--) this.throwFromEdge(f, this.upper, 2, 5, 0.8, 1.6, BURST.trebleFade);
      } else if (this.style === 'fire') {
        this.debt += (level * FIRE.rate * step + rise * FIRE.kick) * amount;
        for (; this.debt >= 1; this.debt--) this.ember(f);
      } else {
        const target = (0.15 + level) * SWARM.population * amount;
        let alive = 0;
        for (let i = 0; i < this.n; i++) if (this.s.kind[i] === BEE) alive++;
        for (let k = alive; k < target && k < alive + 8; k++) this.bee(f);
        if (rise > 0.15) this.scatter(f, rise * SWARM.scatter);
      }
    }
    this.debt = Math.min(this.debt, 1);
    this.trebleDebt = Math.min(this.trebleDebt, 1);

    // The last kicks of the song: fireworks, once
    if (f.remaining > FIREWORKS.after) this.fireworksDone = false;
    else if (fancy && strong && !this.fireworksDone && f.remaining < FIREWORKS.within && f.remaining > 0.3) {
      this.fireworksDone = true;
      for (let r = 0; r < FIREWORKS.rockets; r++) this.firework(f, r);
    }
    this.cursorTrail(f, amount);
    for (const rect of this.pops.splice(0)) this.burstFrom(rect, f);
  }

  private onStrongKick(f: SparkFrame) {
    if (this.shocks.length < SHOCK.max && this.style === 'burst') this.shocks.push({ size: 1, life: 1 });
    // The drop: the music jumping well above its recent level
    const drop = this.clock > DROP.warmUp && this.clock - this.lastDrop > DROP.cooldown
      && this.fastLoud > DROP.min && this.fastLoud > this.slowLoud * DROP.ratio;
    if (!drop) return;
    this.lastDrop = this.clock;
    if (this.artwork) this.formArtwork(f);
    else {
      for (let i = 0; i < DROP.burst; i++) this.throwFromEdge(f, this.lower.concat(this.upper), 2, 6, 1.5, 3.5, BURST.fade * 0.8);
      this.shocks.push({ size: 1, life: 1 }, { size: 0.8, life: 1.2 });
    }
  }

  // Spawns one spark; returns its slot or -1 when full
  private add(x: number, y: number, vx: number, vy: number, r: number, fade: number, o: Partial<Record<Field, number>> = {}) {
    if (this.n >= MAX) return -1;
    const i = this.n++, s = this.s;
    s.x[i] = x; s.y[i] = y; s.vx[i] = vx; s.vy[i] = vy; s.r[i] = r; s.fade[i] = fade; s.life[i] = 1;
    s.spin[i] = 0; s.trail[i] = BURST.trail; s.gravity[i] = 0; s.color[i] = Math.floor(Math.random() * this.palette.length);
    s.kind[i] = THROWN; s.tx[i] = 0; s.ty[i] = 0; s.hold[i] = 0;
    for (const k in o) s[k as Field][i] = o[k as Field]!;
    return i;
  }

  private throwFromEdge(f: SparkFrame, from: number[], minSpeed: number, maxSpeed: number, minR: number, maxR: number, fade: number) {
    const { box, dpr, pulse } = f, { x, y, dx, dy } = this.outline;
    const k = from[Math.floor(Math.random() * from.length)];
    const speed = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * (0.5 + pulse) * BURST.speed * dpr, turn = (Math.random() - 0.5) * 0.8;
    this.add(box.cx + x[k] * box.half, box.cy + y[k] * box.half,
      (dx[k] * Math.cos(turn) - dy[k] * Math.sin(turn)) * speed, (dx[k] * Math.sin(turn) + dy[k] * Math.cos(turn)) * speed,
      (minR + Math.random() * (maxR - minR)) * dpr * 0.5, fade,
      { spin: (Math.random() < 0.5 ? -1 : 1) * BURST.spin * (0.5 + Math.random()), gravity: BURST.gravity * dpr });
  }

  // An ember from the bottom of the screen, dying about as high as the music is loud
  private ember(f: SparkFrame) {
    const { box, dpr, level } = f, vy = -(1 + Math.random()) * FIRE.rise * (0.5 + level) * dpr;
    const height = box.h * (0.25 + 0.6 * level) * (0.6 + Math.random() * 0.6);
    this.add(Math.random() * box.w, box.h + 4 * dpr, (Math.random() - 0.5) * dpr, vy, (0.8 + Math.random() * 1.6) * dpr,
      Math.abs(vy) / height, { kind: EMBER, trail: FIRE.trail, gravity: -FIRE.buoyancy * dpr });
  }

  // A swarm member: born at the artwork's edge (or around the cursor it follows), with its own place
  // in the orbit (tx: angle, ty: radius)
  private bee(f: SparkFrame) {
    const { box, dpr, pointer } = f, { x, y } = this.outline, k = Math.floor(Math.random() * x.length);
    const a = Math.random() * Math.PI * 2, r = SWARM.follow * dpr * (1 + Math.random());
    const [bx, by] = pointer ? [pointer.x + Math.cos(a) * r, pointer.y + Math.sin(a) * r] : [box.cx + x[k] * box.half, box.cy + y[k] * box.half];
    this.add(bx, by, 0, 0, (0.7 + Math.random()) * dpr, SWARM.fade,
      { kind: BEE, trail: SWARM.trail, tx: Math.random() * Math.PI * 2, ty: 1.15 + Math.random() * 0.5, spin: (Math.random() < 0.5 ? -1 : 1) * (0.006 + Math.random() * 0.01) });
  }

  // Pushes the swarm away from where it is heading
  private scatter(f: SparkFrame, strength: number) {
    const s = this.s, c = this.swarmCentre(f);
    for (let i = 0; i < this.n; i++) {
      const dx = s.x[i] - c.x, dy = s.y[i] - c.y, d = Math.hypot(dx, dy) || 1;
      s.vx[i] += (dx / d) * strength * f.dpr * Math.random();
      s.vy[i] += (dy / d) * strength * f.dpr * Math.random();
    }
  }

  private swarmCentre(f: SparkFrame) {
    return f.pointer ?? { x: f.box.cx, y: f.box.cy };
  }

  private firework(f: SparkFrame, index: number) {
    const { box, dpr } = f, cx = box.w * (0.2 + Math.random() * 0.6), cy = box.h * (0.15 + Math.random() * 0.3);
    const color = index % this.palette.length;
    for (let i = 0; i < FIREWORKS.each; i++) {
      const a = (i / FIREWORKS.each) * Math.PI * 2 + Math.random() * 0.2, speed = (2 + Math.random() * 3) * dpr;
      this.add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, (1 + Math.random()) * dpr, FIREWORKS.fade,
        { kind: ROCKET, color, gravity: BURST.gravity * dpr * 1.5 });
    }
  }

  // The artwork drawn with sparks, gathering from its edges into a larger copy around it
  private formArtwork(f: SparkFrame) {
    const { box } = f, { x, y } = this.outline, pixels = this.artwork!, n = FORM.grid;
    const half = box.half * FORM.scale, cell = (2 * half) / n, base = this.palette.length;
    const colors = this.palette.slice(0, base).concat(pixels);
    this.palette = colors;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const k = Math.floor(Math.random() * x.length);
        this.add(box.cx + x[k] * box.half, box.cy + y[k] * box.half, 0, 0, cell * FORM.cell * 0.5, 0,
          { kind: FORMING, color: base + gy * n + gx, tx: box.cx - half + (gx + 0.5) * cell, ty: box.cy - half + (gy + 0.5) * cell,
            hold: FORM.hold + Math.random() * 10 });
      }
    }
  }

  // Sparks along the cursor's path
  private cursorTrail(f: SparkFrame, amount: number) {
    const p = f.pointer, last = this.lastPointer;
    this.lastPointer = p ? { ...p } : null;
    if (!p || !last) return;
    const dist = Math.hypot(p.x - last.x, p.y - last.y), count = Math.min(TRAIL.perFrame, (dist / (TRAIL.spacing * f.dpr)) * amount);
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      this.add(last.x + (p.x - last.x) * t, last.y + (p.y - last.y) * t, (Math.random() - 0.5) * 2 * f.dpr, (Math.random() - 0.5) * 2 * f.dpr,
        (0.6 + Math.random()) * f.dpr * (0.7 + f.level), TRAIL.fade, { gravity: BURST.gravity * f.dpr });
    }
  }

  // A burst from the edges of a box (a comment going away)
  private burstFrom(r: Rect, f: SparkFrame) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let i = 0; i < POP.count; i++) {
      const a = Math.random() * Math.PI * 2, ex = cx + Math.cos(a) * r.w / 2, ey = cy + Math.sin(a) * r.h / 2, speed = (1 + Math.random() * 2) * f.dpr;
      this.add(ex, ey, Math.cos(a) * speed, Math.sin(a) * speed, (0.7 + Math.random()) * f.dpr, POP.fade, { gravity: BURST.gravity * f.dpr });
    }
  }

  // Moves every spark one step, and removes the dead ones
  private move(f: SparkFrame) {
    const s = this.s, { step, box } = f, drag = Math.pow(BURST.drag, step);
    const centre = this.swarmCentre(f), following = !!f.pointer;
    for (let i = 0; i < this.n; i++) {
      if (s.kind[i] === FORMING) {
        const k = toward(FORM.pull, step);
        s.x[i] += (s.tx[i] - s.x[i]) * k; s.y[i] += (s.ty[i] - s.y[i]) * k;
        s.hold[i] -= step;
        if (s.hold[i] <= 0) {
          // Blow apart from the middle
          const dx = s.x[i] - box.cx, dy = s.y[i] - box.cy, d = Math.hypot(dx, dy) || 1, speed = (1 + Math.random()) * FORM.speed * f.dpr;
          s.kind[i] = SHARD; s.vx[i] = (dx / d) * speed; s.vy[i] = (dy / d) * speed; s.fade[i] = BURST.fade; s.gravity[i] = BURST.gravity * f.dpr;
          s.r[i] = FORM.shard * f.dpr;
        }
        continue;
      }
      const kind = s.kind[i];
      if (kind === BEE) this.steer(i, f, centre, following);
      else {
        // Curl: turn the velocity a little each frame
        if (s.spin[i]) {
          const a = s.spin[i] * step, cos = Math.cos(a), sin = Math.sin(a), vx = s.vx[i];
          s.vx[i] = vx * cos - s.vy[i] * sin; s.vy[i] = vx * sin + s.vy[i] * cos;
        }
        s.vx[i] *= drag; s.vy[i] *= drag;
      }
      s.vy[i] += s.gravity[i] * step;
      if (kind === EMBER) s.vx[i] += (Math.random() - 0.5) * FIRE.sway * f.dpr * step;
      s.x[i] += s.vx[i] * step; s.y[i] += s.vy[i] * step;
      s.life[i] -= s.fade[i] * step;
      // Burst sparks that curl back onto the artwork die there in a flash
      if (kind === THROWN && s.spin[i] && s.life[i] < 0.85 && Math.abs(s.x[i] - box.cx) < box.half && Math.abs(s.y[i] - box.cy) < box.half) {
        if (this.flashes.length < 20) this.flashes.push({ x: s.x[i], y: s.y[i], life: 1 });
        s.life[i] = 0;
      }
      if (s.life[i] > 0) continue;
      // Move the last spark into this slot and look at the slot again
      const last = --this.n;
      for (const field of FIELDS) s[field][i] = s[field][last];
      i--;
    }
    if (!this.n && this.palette.length > 3) this.palette.length = 3;
  }

  // A swarm member heads for its place in the orbit around the artwork, or near the cursor
  private steer(i: number, f: SparkFrame, centre: { x: number; y: number }, following: boolean) {
    const s = this.s, { step, dpr, box, level } = f;
    s.tx[i] += s.spin[i] * step * (1 + level * 2);
    const radius = following ? SWARM.follow * dpr * s.ty[i] : box.half * s.ty[i];
    const tx = centre.x + Math.cos(s.tx[i]) * radius, ty = centre.y + Math.sin(s.tx[i]) * radius;
    const dx = tx - s.x[i], dy = ty - s.y[i], d = Math.hypot(dx, dy) || 1, a = SWARM.accel * dpr * (1 + level) * step;
    s.vx[i] += (dx / d) * a; s.vy[i] += (dy / d) * a;
    const v = Math.hypot(s.vx[i], s.vy[i]), max = SWARM.maxSpeed * dpr * (0.6 + level);
    if (v > max) { s.vx[i] *= max / v; s.vy[i] *= max / v; }
    s.vx[i] *= 0.97; s.vy[i] *= 0.97;
  }

  private drawSparks(g: CanvasRenderingContext2D, f: SparkFrame) {
    const s = this.s, base = 3;
    g.lineCap = 'round';
    // One pass per colour: white (the young ones), then each colour of the palette
    for (let c = -1; c < base; c++) {
      g.strokeStyle = c < 0 ? WHITE : this.palette[c];
      for (let i = 0; i < this.n; i++) {
        const kind = s.kind[i];
        if (kind === FORMING || kind === SHARD) continue;
        // Thrown sparks and embers are white while young; swarm members and fireworks keep their colour
        const isHot = s.life[i] > BURST.hot && (kind === THROWN || kind === EMBER);
        const color = isHot ? -1 : s.color[i] >= base ? s.color[i] % base : s.color[i];
        if (color !== c) continue;
        g.globalAlpha = f.opacity * clamp(s.life[i], 0, 1) * this.dim(s.x[i], s.y[i], f.avoid);
        g.lineWidth = s.r[i] * 2 * (0.4 + 0.6 * clamp(s.life[i], 0, 1));
        g.beginPath();
        g.moveTo(s.x[i] - s.vx[i] * s.trail[i], s.y[i] - s.vy[i] * s.trail[i]);
        g.lineTo(s.x[i], s.y[i]);
        g.stroke();
      }
    }
    // Pieces of the artwork blown apart: streaks in their own pixel's colour
    for (let i = 0; i < this.n; i++) {
      if (s.kind[i] !== SHARD) continue;
      g.strokeStyle = this.palette[s.color[i]] ?? WHITE;
      g.globalAlpha = f.opacity * clamp(s.life[i], 0, 1) * this.dim(s.x[i], s.y[i], f.avoid);
      g.lineWidth = s.r[i] * 2;
      g.beginPath();
      g.moveTo(s.x[i] - s.vx[i] * s.trail[i], s.y[i] - s.vy[i] * s.trail[i]);
      g.lineTo(s.x[i], s.y[i]);
      g.stroke();
    }
    // The artwork forming: one small square per pixel, in its own colour
    for (let i = 0; i < this.n; i++) {
      if (s.kind[i] !== FORMING) continue;
      const size = s.r[i] * 2;
      g.fillStyle = this.palette[s.color[i]] ?? WHITE;
      g.globalAlpha = f.opacity * 0.9;
      g.fillRect(s.x[i] - size / 2, s.y[i] - size / 2, size, size);
    }
  }

  // Sparks over the title or the lyrics are dimmed
  private dim(x: number, y: number, avoid: Rect[]) {
    for (const r of avoid) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return AVOID_ALPHA;
    return 1;
  }

  // Outlines of the artwork running outwards, thinning and fading
  private drawShocks(g: CanvasRenderingContext2D, f: SparkFrame) {
    const { box, dpr, step } = f;
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
      flash.life -= FLASH.life * f.step;
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

// "rgb(r, g, b)" or "#rgb" / "#rrggbb" → [r, g, b]
function parseRgb(color: string): number[] | null {
  const m = color.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(', ')})`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

// The same colour with its hue turned by `degrees`
function hueShift([r, g, b]: number[], degrees: number): number[] {
  const a = (degrees * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a), k = 1 / 3, sq = Math.sqrt(k);
  // Rotation around the grey axis
  const m = (x: number, y: number, z: number) => [
    x * (cos + (1 - cos) * k) + y * (k * (1 - cos) - sq * sin) + z * (k * (1 - cos) + sq * sin),
    x * (k * (1 - cos) + sq * sin) + y * (cos + k * (1 - cos)) + z * (k * (1 - cos) - sq * sin),
    x * (k * (1 - cos) - sq * sin) + y * (k * (1 - cos) + sq * sin) + z * (cos + k * (1 - cos)),
  ];
  return m(r, g, b);
}

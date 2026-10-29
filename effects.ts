// Motion effects for the Now Playing screen:
// - the artwork tilts in 3D towards the cursor, with a glass shine sliding across it;
//   while the screen is idle it floats gently on its own (useful on a second display)
// - depth: background, artwork and title move by different amounts
// - beat: the artwork breathes with the bass, its glow and a light flash follow the kicks
// - the artwork flips in when the track changes
// Everything is driven through transform/opacity so it stays on the compositor,
// and a style is only written when its value actually changes.

const PERSPECTIVE = 1200; // px, keep in sync with .cover-wrap in styles.ts
const TILT_X = 6; // degrees for full vertical travel
const TILT_Y = 8; // degrees for full horizontal travel
const EASE = 0.06; // fraction of the remaining distance covered per frame
const IDLE_DRIFT = { x: 0.35, y: 0.25, speedX: 0.35, speedY: 0.27 };
const SHINE_SHIFT = 22; // % the shine travels opposite to the tilt
const BACKDROP_SHIFT = 1.2; // % the background drifts
const BACKDROP_KICK = { shake: 0.9, zoom: 0.03 }; // % shake and extra scale of the background on a full kick
const INFO_SHIFT = { x: 6, y: 4 }; // px the title block drifts

type Elements = {
  wrap: HTMLElement;
  cover: HTMLElement;
  glow: HTMLElement;
  shine: HTMLElement;
  flash: HTMLElement;
  backdrop: HTMLElement;
  info: HTMLElement;
};

type Levels = { readonly level: number; readonly pulse: number };
type StyleKey = 'transform' | 'opacity' | 'translate' | 'scale';

export class Effects {
  private enabled = false;
  private target = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private written = new Map<HTMLElement, Partial<Record<StyleKey, string>>>();

  constructor(private el: Elements, private levels: Levels) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.reset();
  }

  // Cursor position over the screen, from -1 to 1 on each axis
  point(x: number, y: number) {
    this.target.x = x;
    this.target.y = y;
  }

  // Call every frame, after the visualizer has updated the levels
  update(now: number, idle: boolean) {
    if (!this.enabled) return;
    let tx = this.target.x, ty = this.target.y;
    if (idle) {
      const t = now / 1000;
      tx = Math.sin(t * IDLE_DRIFT.speedX) * IDLE_DRIFT.x;
      ty = Math.sin(t * IDLE_DRIFT.speedY + 1) * IDLE_DRIFT.y;
    }
    const c = this.current;
    c.x += (tx - c.x) * EASE;
    c.y += (ty - c.y) * EASE;
    const { level, pulse } = this.levels;
    const { wrap, glow, shine, flash, backdrop, info } = this.el;

    const scale = 1 + pulse * 0.035 + level * 0.012;
    this.set(wrap, 'transform', `perspective(${PERSPECTIVE}px) rotateX(${(-c.y * TILT_X).toFixed(2)}deg) rotateY(${(c.x * TILT_Y).toFixed(2)}deg) scale(${scale.toFixed(4)})`);
    this.set(glow, 'opacity', (0.22 + level * 0.55 + pulse * 0.2).toFixed(3));
    this.set(glow, 'transform', `scale(${(1 + level * 0.12 + pulse * 0.08).toFixed(3)})`);
    this.set(shine, 'transform', `translate(${(-c.x * SHINE_SHIFT).toFixed(1)}%, ${(-c.y * SHINE_SHIFT).toFixed(1)}%)`);
    this.set(flash, 'opacity', (pulse * 0.28).toFixed(3));
    // The background jolts on each kick: a short random shake plus a slight zoom
    const shake = pulse * pulse * BACKDROP_KICK.shake;
    const jolt = () => (Math.random() * 2 - 1) * shake;
    const sx = -c.x * BACKDROP_SHIFT + jolt(), sy = -c.y * BACKDROP_SHIFT + jolt();
    this.set(backdrop, 'translate', `${sx.toFixed(2)}% ${sy.toFixed(2)}%`);
    this.set(backdrop, 'scale', (1 + pulse * BACKDROP_KICK.zoom).toFixed(4));
    this.set(info, 'translate', `${(-c.x * INFO_SHIFT.x).toFixed(1)}px ${(-c.y * INFO_SHIFT.y).toFixed(1)}px`);
  }

  // 3D flip-in of the artwork on track change
  flip() {
    if (!this.enabled) return;
    const { cover } = this.el;
    cover.classList.remove('flip');
    void cover.offsetWidth; // restart the animation
    cover.classList.add('flip');
  }

  private set(target: HTMLElement, key: StyleKey, value: string) {
    let styles = this.written.get(target);
    if (!styles) this.written.set(target, (styles = {}));
    if (styles[key] === value) return;
    styles[key] = value;
    target.style[key] = value;
  }

  // Clears exactly the styles update() wrote
  private reset() {
    for (const [target, styles] of this.written) {
      for (const key of Object.keys(styles) as StyleKey[]) target.style[key] = '';
    }
    this.written.clear();
    this.current = { x: 0, y: 0 };
  }
}

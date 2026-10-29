// Motion effects for the Now Playing screen:
// - the artwork tilts in 3D towards the cursor, with a glass shine sliding across it;
//   without mouse movement it floats gently on its own (useful on a second display)
// - depth: background, artwork and title move by different amounts
// - beat: the artwork breathes with the bass, its glow and a light pulse follow the kicks
// - the artwork flips in when the track changes
// Everything is driven through transform/opacity so it stays on the compositor.

const IDLE_MS = 3000;
const TILT_X = 9; // degrees for full vertical travel
const TILT_Y = 12; // degrees for full horizontal travel

type Elements = {
  wrap: HTMLElement;
  cover: HTMLElement;
  glow: HTMLElement;
  shine: HTMLElement;
  pulse: HTMLElement;
  backdrop: HTMLElement;
  info: HTMLElement;
};

type Levels = { level: number; pulse: number };

export class Effects {
  private enabled = false;
  private target = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private lastMove = 0;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  constructor(private root: HTMLElement, private el: Elements, private levels: () => Levels) {
    root.addEventListener('pointermove', this.onMove);
  }

  // Effects run only when enabled in the settings and the OS does not ask for reduced motion
  setEnabled(on: boolean) {
    this.enabled = on && !this.reducedMotion?.matches;
    this.root.classList.toggle('fx', this.enabled);
    if (!this.enabled) this.reset();
    return this.enabled;
  }

  // Call every frame
  update(now: number) {
    if (!this.enabled) return;
    let tx = this.target.x, ty = this.target.y;
    if (now - this.lastMove > IDLE_MS) {
      const t = now / 1000;
      tx = Math.sin(t * 0.35) * 0.35;
      ty = Math.sin(t * 0.27 + 1) * 0.25;
    }
    const c = this.current;
    c.x += (tx - c.x) * 0.06;
    c.y += (ty - c.y) * 0.06;
    const { level, pulse } = this.levels();
    const { wrap, glow, shine, backdrop, info } = this.el;

    const scale = 1 + pulse * 0.035 + level * 0.012;
    wrap.style.transform = `perspective(1200px) rotateX(${(-c.y * TILT_X).toFixed(2)}deg) rotateY(${(c.x * TILT_Y).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    glow.style.opacity = (0.22 + level * 0.55 + pulse * 0.2).toFixed(3);
    glow.style.transform = `scale(${(1 + level * 0.12 + pulse * 0.08).toFixed(4)})`;
    (shine.firstElementChild as HTMLElement).style.transform = `translate(${(-c.x * 22).toFixed(2)}%, ${(-c.y * 22).toFixed(2)}%)`;
    this.el.pulse.style.opacity = (pulse * 0.28).toFixed(3);
    backdrop.style.translate = `${(-c.x * 1.2).toFixed(2)}% ${(-c.y * 1.2).toFixed(2)}%`;
    info.style.translate = `${(-c.x * 6).toFixed(1)}px ${(-c.y * 4).toFixed(1)}px`;
  }

  // 3D flip-in of the artwork on track change
  flip() {
    if (!this.enabled) return;
    const { cover } = this.el;
    cover.classList.remove('flip');
    void cover.offsetWidth; // restart the animation
    cover.classList.add('flip');
  }

  destroy() {
    this.root.removeEventListener('pointermove', this.onMove);
    this.reset();
  }

  private onMove = (e: PointerEvent) => {
    const r = this.root.getBoundingClientRect();
    this.target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    this.lastMove = performance.now();
  };

  private reset() {
    const { wrap, glow, shine, pulse, backdrop, info, cover } = this.el;
    wrap.style.transform = '';
    glow.style.opacity = '';
    glow.style.transform = '';
    (shine.firstElementChild as HTMLElement).style.transform = '';
    pulse.style.opacity = '';
    backdrop.style.translate = '';
    info.style.translate = '';
    cover.classList.remove('flip');
    this.current = { x: 0, y: 0 };
  }
}

// Artwork and background: crossfades between two layers when the cover changes, and sets the accent
// colours taken from it (white until they are known, or when the image cannot be read).
import type { Track } from '@nuclearplayer/plugin-sdk';

import { coverColors } from '../lib/image';
import { coverFor } from '../lib/track';
import type { Query } from './template';

const NEUTRAL_TINT = '40, 40, 48';

export class Artwork {
  accent = '#fff';
  private front: 'A' | 'B' = 'A';
  private token = 0;
  private lastUrl: string | null = null;

  // Two layers of artwork and background, crossfaded
  private layers;

  constructor(private root: HTMLElement, q: Query, private onFlip: () => void) {
    const layer = (id: 'A' | 'B') => ({ img: q<HTMLImageElement>(`[data-img="${id}"]`), bg: q(`[data-bg="${id}"]`) });
    this.layers = { A: layer('A'), B: layer('B') };
  }

  show(track: Track | undefined) {
    const url = coverFor(track, true);
    if (url === this.lastUrl) return;
    this.lastUrl = url;
    if (url) this.load(url);
  }

  private load(url: string) {
    const token = ++this.token;
    const back = this.front === 'A' ? 'B' : 'A';
    const { img, bg } = this.layers[back], front = this.layers[this.front];
    this.setAccent('#fff', NEUTRAL_TINT);
    img.onload = () => {
      if (token !== this.token) return;
      bg.style.backgroundImage = `url("${url}")`;
      img.style.opacity = '1'; bg.style.opacity = '1';
      front.img.style.opacity = '0'; front.bg.style.opacity = '0';
      this.front = back;
      this.onFlip();
    };
    img.src = url;
    coverColors(url).then((colors) => {
      if (token === this.token && colors) this.setAccent(colors.accent, colors.tint.join(', '));
    });
  }

  private setAccent(accent: string, tint: string) {
    this.accent = accent;
    this.root.style.setProperty('--accent', accent);
    this.root.style.setProperty('--tint', tint);
  }
}

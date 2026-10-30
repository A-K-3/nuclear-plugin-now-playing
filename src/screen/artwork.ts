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

  constructor(private root: HTMLElement, private q: Query, private onFlip: () => void) {}

  show(track: Track | undefined) {
    const url = coverFor(track, true);
    if (url === this.lastUrl) return;
    this.lastUrl = url;
    if (url) this.load(url);
  }

  private load(url: string) {
    const token = ++this.token;
    const back = this.front === 'A' ? 'B' : 'A';
    const img = this.q<HTMLImageElement>(`[data-img="${back}"]`), bg = this.q(`[data-bg="${back}"]`);
    this.setAccent('#fff', NEUTRAL_TINT);
    img.onload = () => {
      if (token !== this.token) return;
      bg.style.backgroundImage = `url("${url}")`;
      img.style.opacity = '1'; bg.style.opacity = '1';
      this.q(`[data-img="${this.front}"]`).style.opacity = '0'; this.q(`[data-bg="${this.front}"]`).style.opacity = '0';
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

// "Up next" card: shows the next song during the last seconds of the current one
import type { ItemInfoCache } from './item-info';
import type { PlayerState } from './state';
import type { Query } from './template';

const SHOW_BEFORE_END_S = 10;
const MIN_SONG_S = 25; // not worth announcing after very short tracks

export class UpNext {
  private shown = false;
  private el;

  constructor(q: Query, private state: PlayerState, private infos: ItemInfoCache) {
    this.el = { card: q('.upnext'), img: q<HTMLImageElement>('.upnext img'), title: q('.upnext b'), artist: q('.upnext span') };
  }

  // Call every frame with the current position
  update(pos: number) {
    const { state } = this, next = state.next;
    const remaining = (state.duration || 0) - pos;
    const show = !!(next && state.playing && state.duration > MIN_SONG_S
      && remaining <= SHOW_BEFORE_END_S && remaining > 0.3 && state.repeat !== 'one' && !state.shuffle);
    if (next && show && this.el.card.dataset.id !== next.id) {
      const info = this.infos.get(next);
      this.el.card.dataset.id = next.id;
      this.el.img.src = info.thumb;
      this.el.title.textContent = info.title;
      this.el.artist.textContent = info.artist;
    }
    if (show !== this.shown) { this.el.card.classList.toggle('show', show); this.shown = show; }
  }
}

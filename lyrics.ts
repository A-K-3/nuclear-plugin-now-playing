// Lyrics panel backed by the lyrics providers installed in Nuclear.
// Synced lyrics (line or word level) highlight in time with the song; click a line to seek to it.
import { locale, t } from './i18n';
import { esc, withTimeout } from './util';

const PRIORITY: Record<string, number> = { wordSynced: 0, lineSynced: 1, plain: 2, instrumental: 3 };

// Last index whose start is <= ms (starts are sorted)
const lastStarted = (starts: number[], ms: number) => {
  let lo = 0, hi = starts.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= ms) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx;
};

export class LyricsPanel {
  private token = 0;
  private lines: HTMLElement[] = [];
  private lineStarts: number[] = [];
  private words: HTMLElement[] = [];
  private wordStarts: number[] = [];
  private synced = false;
  private current = -1;
  private sung = -1; // index of the last word marked as sung

  constructor(private api: any, private el: HTMLElement, onSeek: (seconds: number) => void) {
    el.lang = locale();
    el.addEventListener('click', (e) => {
      const line = (e.target as HTMLElement).closest('[data-start]') as HTMLElement | null;
      if (line && this.synced) onSeek(+line.dataset.start! / 1000);
    });
  }

  async load(track: any) {
    const token = ++this.token;
    this.lines = []; this.lineStarts = []; this.words = []; this.wordStarts = [];
    this.synced = false; this.current = -1; this.sung = -1;
    if (!track) { this.message(t('nothingPlaying')); return; }
    this.message(t('searchingLyrics'));
    let results: any[] = [];
    try {
      results = await withTimeout<any[]>(this.api.Lyrics.getLyricsForTrack(track), 15000, () => []);
    } catch { /* no provider or provider error: treated as "no lyrics" */ }
    if (token !== this.token) return;
    const best = (results || [])
      .filter((r) => r?.lyrics)
      .sort((a, b) => (PRIORITY[a.lyrics.type] ?? 9) - (PRIORITY[b.lyrics.type] ?? 9))[0];
    if (!best) {
      this.message(t('noLyrics'), t('noLyricsHint'));
      return;
    }
    const lyrics = best.lyrics;
    if (lyrics.type === 'instrumental') { this.message(t('instrumental')); return; }
    this.synced = lyrics.type === 'lineSynced' || lyrics.type === 'wordSynced';
    const html = (lyrics.sections || []).map((section: any) => {
      const label = section.label ? `<div class="lyr-label">${esc(section.label)}</div>` : '';
      const lines = (section.lines || []).map((line: any) => {
        const segs = (line.segments || []).map((s: any) =>
          lyrics.type === 'wordSynced' ? `<span class="w" data-ws="${s.startMs}">${esc(s.text)}</span>` : esc(s.text)).join('');
        const timing = this.synced ? ` data-start="${line.startMs}" data-end="${line.endMs}"` : '';
        return `<div class="lyr-line"${timing}>${segs || '&nbsp;'}</div>`;
      }).join('');
      return label + lines;
    }).join('');
    this.el.innerHTML = `<div class="lyr-pad"></div>${html}<div class="lyr-pad"></div>
      <div class="lyr-src">${esc(t('lyricsSource', { provider: best.providerName || best.providerId }))}</div>`;
    this.el.classList.toggle('synced', this.synced);
    this.lines = Array.from(this.el.querySelectorAll<HTMLElement>('.lyr-line'));
    this.lineStarts = this.lines.map((l) => +(l.dataset.start ?? Infinity));
    this.words = Array.from(this.el.querySelectorAll<HTMLElement>('.w'));
    this.wordStarts = this.words.map((w) => +w.dataset.ws!);
    this.el.scrollTop = 0;
  }

  // Call every frame: only touches the lines and words whose state changes
  update(positionSeconds: number) {
    if (!this.synced || !this.lines.length) return;
    const ms = positionSeconds * 1000;
    const idx = lastStarted(this.lineStarts, ms);
    if (idx !== this.current) {
      const [from, to] = [Math.min(idx, this.current), Math.max(idx, this.current)];
      for (let i = Math.max(0, from); i <= to; i++) {
        this.lines[i].classList.toggle('active', i === idx);
        this.lines[i].classList.toggle('past', i < idx);
      }
      this.current = idx;
      const line = this.lines[Math.max(0, idx)];
      this.el.scrollTo({ top: line.offsetTop - this.el.clientHeight * 0.4, behavior: 'smooth' });
    }
    const sung = lastStarted(this.wordStarts, ms);
    if (sung !== this.sung) {
      const [from, to] = [Math.min(sung, this.sung), Math.max(sung, this.sung)];
      for (let i = Math.max(0, from + 1); i <= to; i++) this.words[i].classList.toggle('sung', i <= sung);
      this.sung = sung;
    }
  }

  private message(text: string, hint = '') {
    this.el.classList.remove('synced');
    this.el.innerHTML = `<div class="lyr-msg">${esc(text)}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  }
}

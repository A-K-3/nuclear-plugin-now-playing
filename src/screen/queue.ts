// Queue panel: the list (rebuilt only when something it shows changes), search, "save as playlist",
// drag to reorder, and a width and collapsed state that are remembered between sessions.
import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

import { locale, t } from '../i18n';
import { esc, fmt, fmtLong, norm } from '../lib/format';
import { clamp } from '../lib/math';
import { storage } from '../lib/storage';
import { ICON, svg } from './icons';
import type { ItemInfoCache } from './item-info';
import type { PlayerState } from './state';
import { setOn, type Query } from './template';

const PREFS_KEY = 'npx-queue';
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 240;
const MAX_WIDTH = 720;

export class QueuePanel {
  private prefs = storage.get(PREFS_KEY, { width: DEFAULT_WIDTH, collapsed: false });
  private filter = '';
  private lastKey = '';
  private lastCur = -1;
  private upcomingSecs = 0; // total duration of the songs after the current one
  private dragFrom = -1;
  private el;

  constructor(
    private api: NuclearPluginAPI, private root: HTMLElement, q: Query,
    private state: PlayerState, private infos: ItemInfoCache, private toast: (text: string) => void,
  ) {
    this.el = {
      list: q('.list'), count: q('.count'), toggle: q('.qtoggle'), goto: q('.goto'), app: q('.app'), resizer: q('.resizer'),
      search: q('.qsearch'), searchInput: q<HTMLInputElement>('.qsearch input'), searchBtn: q('[data-act="search"]'),
      save: q('.qsave'), saveInput: q<HTMLInputElement>('.qsave input'), saveBtn: q('[data-act="saveq"]'),
    };
    this.applyLayout();
    this.el.list.addEventListener('scroll', () => this.updateGoto(), { passive: true });
    this.el.list.addEventListener('click', (e) => this.onListClick(e));
    this.el.searchInput.addEventListener('input', () => { this.filter = norm(this.el.searchInput.value); this.render(); });
    this.el.saveInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.save(); });
    this.setupReorder();
    this.setupResize();
  }

  get searchOpen() { return this.el.search.classList.contains('show'); }
  get saveOpen() { return this.el.save.classList.contains('show'); }

  // Forces the next render to rebuild the list (the screen was closed meanwhile)
  reset() { this.lastKey = ''; this.lastCur = -1; }

  // "X / N · time left" counter: cheap, also refreshed on every playback event
  renderCount() {
    const { items, currentIndex } = this.state.queue;
    const left = this.upcomingSecs + Math.max(0, (this.state.duration || 0) - this.state.position());
    this.el.count.textContent = items.length
      ? `${currentIndex + 1} / ${items.length}${left > 60 ? ' · ' + t('timeLeft', { time: fmtLong(left) }) : ''}`
      : '';
  }

  render(forceScroll = false) {
    const { items, currentIndex: cur } = this.state.queue;
    this.upcomingSecs = items.slice(cur + 1).reduce((s, it) => s + (it.track?.durationMs || 0) / 1000, 0);
    this.renderCount();
    const key = JSON.stringify([cur, this.filter, items.map((i) => [i.id, i.status])]);
    if (key === this.lastKey && !forceScroll) return;
    const curChanged = cur !== this.lastCur;
    this.lastKey = key; this.lastCur = cur;
    this.infos.prune(items);
    let shown = 0;
    const rows = items.map((it, i) => {
      const info = this.infos.get(it), ok = !this.filter || info.search.includes(this.filter);
      if (ok) shown++;
      const failed = it.status === 'error';
      const cls = [i === cur ? 'current' : '', i < cur ? 'played' : '', failed ? 'err' : '', ok ? '' : 'hidden'].join(' ');
      const eq = i === cur ? '<span class="eq"><i></i><i></i><i></i></span>' : '';
      const dur = it.track?.durationMs ? fmt(it.track.durationMs / 1000) : '';
      return `<li class="${cls}" data-i="${i}" data-id="${esc(it.id)}" draggable="true">
        <img src="${esc(info.thumb)}" loading="lazy" alt="">
        <div class="t"><b>${eq}${this.highlight(info.title)}</b><span>${failed ? esc(t('loadFailed')) : this.highlight(info.artist)}</span></div>
        <div class="end"><span class="dur">${dur}</span><button class="x" title="${t('removeFromQueue')}">${svg(ICON.close)}</button></div></li>`;
    }).join('');
    this.el.list.innerHTML = rows + (this.filter && !shown ? `<li class="empty-search">${esc(t('noMatches'))}</li>` : '');
    if (curChanged || forceScroll) this.scrollToCurrent();
    this.updateGoto();
  }

  // Scrolls only the list (scrollIntoView also scrolled the screen and Nuclear's window)
  scrollToCurrent() {
    const li = this.currentRow();
    const list = this.el.list;
    if (li) list.scrollTo({ top: li.offsetTop - list.clientHeight / 2 + li.offsetHeight / 2, behavior: 'smooth' });
  }

  toggleCollapsed() {
    this.prefs.collapsed = !this.prefs.collapsed;
    this.applyLayout();
    this.savePrefs();
  }

  setSearch(show: boolean) {
    this.el.search.classList.toggle('show', show);
    this.el.searchBtn.classList.toggle('on', show);
    if (show) {
      if (this.prefs.collapsed) this.toggleCollapsed();
      this.el.searchInput.focus();
      this.el.searchInput.select();
    } else {
      this.el.searchInput.value = '';
      this.filter = '';
      this.render(true);
    }
  }

  setSave(show: boolean) {
    this.el.save.classList.toggle('show', show);
    this.el.saveBtn.classList.toggle('on', show);
    if (!show) return;
    const date = new Date().toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    this.el.saveInput.value = t('queueName', { date });
    this.el.saveInput.focus();
    this.el.saveInput.select();
  }

  async save() {
    const name = this.el.saveInput.value.trim();
    if (!name) return;
    try {
      await this.api.Playlists.saveQueueAsPlaylist(name);
      this.toast(t('queueSaved', { name }));
      this.setSave(false);
    } catch (e) {
      this.toast(t('queueSaveFailed', { error: (e as Error)?.message || String(e) }));
    }
  }

  // Highlights the search text as typed (matching itself ignores accents and symbols)
  private highlight(text: string) {
    const raw = String(text ?? ''), needle = this.el.searchInput.value.trim().toLowerCase();
    const i = needle ? raw.toLowerCase().indexOf(needle) : -1;
    if (i < 0) return esc(raw);
    return esc(raw.slice(0, i)) + `<mark>${esc(raw.slice(i, i + needle.length))}</mark>` + esc(raw.slice(i + needle.length));
  }

  private currentRow() { return this.el.list.querySelector<HTMLElement>('.current:not(.hidden)'); }

  private updateGoto() {
    const li = this.currentRow(), list = this.el.list;
    const visible = !li || (li.offsetTop + li.offsetHeight > list.scrollTop && li.offsetTop < list.scrollTop + list.clientHeight);
    this.el.goto.classList.toggle('show', !visible);
  }

  // Click a row to play it, or its × to remove it
  private onListClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLElement>('li[data-i]');
    if (!li) return;
    if (target.closest('.x')) this.api.Queue.removeByIds([li.dataset.id!]);
    else this.api.Queue.goToIndex(+li.dataset.i!);
  }

  private setupReorder() {
    const list = this.el.list;
    const rowAt = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
    const clearDrop = () => list.querySelectorAll('.drop-before,.drop-after').forEach((li) => li.classList.remove('drop-before', 'drop-after'));
    list.addEventListener('dragstart', (e) => {
      const li = rowAt(e);
      if (!li || !e.dataTransfer) return;
      this.dragFrom = +li.dataset.i!;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(this.dragFrom));
    });
    list.addEventListener('dragover', (e) => {
      const li = rowAt(e);
      if (!li || this.dragFrom < 0) return;
      e.preventDefault();
      clearDrop();
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    list.addEventListener('dragleave', (e) => { if (e.target === list) clearDrop(); });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const li = rowAt(e);
      const after = li?.classList.contains('drop-after');
      clearDrop();
      if (!li || this.dragFrom < 0) return;
      let to = +li.dataset.i! + (after ? 1 : 0);
      if (this.dragFrom < to) to -= 1;
      if (to !== this.dragFrom) this.api.Queue.reorder(this.dragFrom, to);
      this.dragFrom = -1;
    });
    list.addEventListener('dragend', () => {
      clearDrop();
      this.dragFrom = -1;
      list.querySelector('.dragging')?.classList.remove('dragging');
    });
  }

  private setupResize() {
    const { resizer, app } = this.el;
    resizer.addEventListener('pointerdown', (e) => { e.preventDefault(); resizer.setPointerCapture(e.pointerId); app.classList.add('resizing'); });
    resizer.addEventListener('pointermove', (e) => {
      if (!app.classList.contains('resizing')) return;
      const max = Math.min(MAX_WIDTH, Math.round(this.root.clientWidth * 0.6));
      this.prefs.width = Math.round(clamp(this.root.getBoundingClientRect().right - e.clientX, MIN_WIDTH, max));
      this.applyLayout();
    });
    resizer.addEventListener('pointerup', () => { app.classList.remove('resizing'); this.savePrefs(); });
    resizer.addEventListener('dblclick', () => { this.prefs.width = DEFAULT_WIDTH; this.applyLayout(); this.savePrefs(); });
  }

  private applyLayout() {
    this.root.style.setProperty('--qw', this.prefs.collapsed ? '0px' : `${this.prefs.width}px`);
    this.root.classList.toggle('qcollapsed', this.prefs.collapsed);
    setOn(this.el.toggle, !this.prefs.collapsed);
  }

  private savePrefs() { storage.set(PREFS_KEY, this.prefs); }
}

// Now Playing screen: artwork, track info, timeline, controls, favorite, lyrics, SoundCloud comments,
// visualizer and a queue that can be searched, reordered, resized and collapsed.
// This module builds the screen from its parts, routes buttons and keys to actions, and owns the
// open/close lifecycle and the per-frame loop.
import type { NuclearPluginAPI, PlaybackState } from '@nuclearplayer/plugin-sdk';

import { AudioAnalyser } from '../audio/analyser';
import { locale, t } from '../i18n';
import { frameStep } from '../lib/math';
import { Scope } from '../lib/scope';
import { display } from '../lib/track';
import { appWindow, onDragRegionMouseDown } from '../nuclear/window';
import type { Prefs } from '../settings';
import { isAction, type Action } from './actions';
import { Artwork } from './artwork';
import { CommentBubbles } from './comments';
import { Controls } from './controls';
import { Effects } from './effects';
import { ICON } from './icons';
import { ItemInfoCache } from './item-info';
import { keyAction } from './keyboard';
import { LyricsPanel } from './lyrics';
import { createQuickSettings } from './quick-settings';
import { QueuePanel } from './queue';
import { PlayerState } from './state';
import { CSS, ROOT_ID } from './styles/index';
import { queryIn, restartAnimation, setOn, template } from './template';
import { UpNext } from './up-next';
import { SpectrumView } from './visualizer';

const HOTKEY = 'F9';
const IDLE_MS = 3000; // without mouse movement: hide the cursor and controls, let the artwork float
const MODES_POLL_MS = 1000;
const CLOCK_MS = 5000;
const TOAST_MS = 3500;

export function createScreen(api: NuclearPluginAPI) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.lang = locale();
  root.innerHTML = template();
  document.body.appendChild(root);
  const q = queryIn(root);
  const el = {
    title: q('.title'), artist: q('.artist'), album: q('.album'), clock: q('.clock'), toast: q('.toast'),
    fav: q('.fav'), favIcon: q('.favicon path'), lyricsBtn: q('[data-act="lyrics"]'), settingsBtn: q('.stoggle'), status: q('.sc-status'),
  };

  // --- Parts ---
  const state = new PlayerState();
  const infos = new ItemInfoCache();
  const audio = new AudioAnalyser();
  const artwork = new Artwork(root, q, () => effects.flip());
  const view = new SpectrumView(q<HTMLCanvasElement>('.viz'), audio, () => artwork.accent);
  const effects = new Effects({
    wrap: q('.cover-wrap'), cover: q('.cover'), glow: q('.cover-glow'), shine: q('.shine i'),
    flash: q('.pulse'), backdrop: q('.backdrop'), info: q('.info'),
  }, audio);
  const controls = new Controls(api, root, q, state);
  const queue = new QueuePanel(api, root, q, state, infos, toast);
  const upNext = new UpNext(q, state, infos);
  const lyrics = new LyricsPanel(api, q('.lyrics'), (s) => api.Playback.seekTo(s));
  const comments = new CommentBubbles(api, q('.sc-layer'), q('.sc-markers'), {
    never: ['.timeline', '.dock', '.back', '.clock', '.corner', '.upnext', '.settings-panel'].map((s) => q(s)),
    ifRoom: ['.cover-wrap', '.info'].map((s) => q(s)),
  }, (text) => (el.status.textContent = text ? `💬 ${text}` : ''));
  const quickSettings = createQuickSettings(q('.settings-panel'), api, (px) => root.style.setProperty('--blur', `${px}px`));
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  let prefs: Prefs | null = null;
  // The current opening of the screen (null while closed): owns its subscriptions, timers and frame loop
  let session: Scope | null = null;
  let showLyrics = false, settingsOpen = false, isFav = false, idle = false, pointerInside = false;
  let lastCurrentId: string | null = null;
  let idleTimer = 0, toastTimer = 0;

  function toast(text: string) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), TOAST_MS);
  }

  // --- Current track ---
  function renderTrack() {
    const item = state.current, track = item?.track, d = display(track);
    artwork.show(track);
    el.title.textContent = track ? d.title : t('nothingPlaying');
    el.artist.textContent = d.artist;
    el.album.textContent = track?.album?.title || '';
    const id = item?.id ?? null;
    if (id === lastCurrentId) return;
    lastCurrentId = id;
    refreshFav();
    if (showLyrics) lyrics.load(track);
    if (prefs?.comments) comments.load(track);
  }

  function onPlayback(s: PlaybackState) {
    if (!controls.seeking) state.setPlayback(s);
    controls.renderPlayback(s);
  }

  async function refreshFav() {
    const track = state.current?.track;
    try { isFav = !!(track?.source && await api.Favorites.isTrackFavorite(track.source)); } catch { isFav = false; }
    el.fav.classList.toggle('on', isFav);
    el.favIcon.setAttribute('d', isFav ? ICON.heart : ICON.heartOutline);
  }

  async function toggleFav() {
    const track = state.current?.track;
    if (!track?.source) return;
    try {
      if (isFav) await api.Favorites.removeTrack(track.source);
      else await api.Favorites.addTrack(track);
      restartAnimation(el.fav, 'pop');
      await refreshFav();
      toast(t(isFav ? 'favAdded' : 'favRemoved'));
    } catch (e) { toast(`✗ ${(e as Error)?.message || e}`); }
  }

  function setLyrics(on: boolean) {
    showLyrics = on;
    root.classList.toggle('show-lyrics', on);
    setOn(el.lyricsBtn, on);
    if (on) lyrics.load(state.current?.track);
  }

  // Inside Nuclear the window cannot go fullscreen (no set_fullscreen capability) and HTML fullscreen only
  // fills the webview, which the screen already covers. The closest real action is maximizing the window.
  // Outside Nuclear (a plain browser) it is regular fullscreen.
  function fullscreen() {
    if (appWindow.available) { appWindow.toggleMaximize(); return; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen?.().catch(() => {});
  }

  function setSettingsOpen(on: boolean) {
    settingsOpen = on;
    root.classList.toggle('show-settings', on);
    setOn(el.settingsBtn, on);
  }

  // --- Actions: buttons (data-act) and keyboard shortcuts ---
  const actions: Record<Action, () => unknown> = {
    prev: () => api.Queue.goToPrevious(),
    next: () => api.Queue.goToNext(),
    toggle: () => api.Playback.toggle(),
    shuffle: () => controls.toggleShuffle(),
    repeat: () => controls.cycleRepeat(),
    mute: () => controls.toggleMute(),
    volUp: () => controls.volumeUp(),
    volDown: () => controls.volumeDown(),
    fav: toggleFav,
    lyrics: () => setLyrics(!showLyrics),
    comments: () => api.Settings.set('comments', !prefs?.comments),
    queue: () => queue.toggleCollapsed(),
    search: () => queue.setSearch(!queue.searchOpen),
    openSearch: () => queue.setSearch(true),
    saveq: () => queue.setSave(!queue.saveOpen),
    dosave: () => queue.save(),
    goto: () => queue.scrollToCurrent(),
    full: fullscreen,
    close: () => hide(),
    escape: () => {
      if (settingsOpen) setSettingsOpen(false);
      else if (!document.fullscreenElement) hide();
    },
    settings: () => setSettingsOpen(!settingsOpen),
    winMin: appWindow.minimize,
    winMax: appWindow.toggleMaximize,
    winClose: appWindow.close,
  };

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // A click outside the open settings panel (and its gear) closes it
    if (settingsOpen && !target.closest('.settings-panel, [data-act="settings"]')) {
      setSettingsOpen(false);
    }
    const btn = target.closest<HTMLElement>('[data-act]');
    if (!btn || !isAction(btn.dataset.act)) return;
    // Mouse clicks should not leave a focus ring that later shows up when using the keyboard
    if (e.detail > 0 && btn.tagName === 'BUTTON') btn.blur();
    actions[btn.dataset.act]();
  });

  // The screen covers Nuclear's title bar: its top strip and the queue header move the window instead
  root.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.dragbar, .queue header')) onDragRegionMouseDown(e);
  });

  // While open, the screen owns the keyboard (keys do not reach Nuclear's shortcuts)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === HOTKEY) { e.preventDefault(); e.stopPropagation(); return session ? hide() : show(); }
    if (!session) return;
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT') {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (target.closest('.settings-panel')) setSettingsOpen(false);
        else if (queue.saveOpen) queue.setSave(false);
        else queue.setSearch(false);
        target.blur();
      }
      return;
    }
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    actions[action]();
  };
  window.addEventListener('keydown', onKey, true);

  // --- Idle: hides the cursor and controls, and lets the artwork float ---
  const setIdle = (value: boolean) => { idle = value; root.classList.toggle('idle', value); };
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => setIdle(true), IDLE_MS);
  };
  root.addEventListener('mousemove', (e) => {
    // The screen is fixed to the viewport, so the viewport size maps the cursor to -1…1
    pointerInside = true;
    effects.point((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    wake();
  });
  // Cursor gone to another monitor or window: ease the artwork back to straight
  root.addEventListener('mouseleave', () => {
    pointerInside = false;
    effects.point(0, 0);
  });

  const tickClock = () => { el.clock.textContent = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };

  // --- Settings ---
  // Motion effects need the setting on and no OS request for reduced motion; re-evaluated when either changes
  function applyMotion() {
    const motion = !!prefs?.effects && !reducedMotion?.matches;
    root.classList.toggle('fx', motion);
    effects.setEnabled(motion);
    // The analysis feeds both the visualizer and the beat effects
    audio.setActive(motion, view.visible);
  }
  reducedMotion?.addEventListener('change', applyMotion);

  function applyPrefs(p: Prefs) {
    const prev = prefs;
    prefs = p;
    quickSettings.update(p);
    root.style.setProperty('--blur', `${p.blur}px`);
    root.classList.toggle('animated', p.animatedBg);
    root.classList.toggle('show-clock', p.clock);
    view.setMode(p.visualizer);
    applyMotion();
    comments.setEnabled(p.comments);
    if (session && p.comments && !prev?.comments) comments.load(state.current?.track);
  }

  // --- Frame loop ---
  // Each part runs in its own try, so a failing part (logged once) does not stop the others
  let pos = 0, dt = 0, now = 0;
  const parts: Array<[string, () => void]> = [
    ['controls', () => controls.update(pos)],
    ['lyrics', () => { if (showLyrics) lyrics.update(pos); }],
    ['comments', () => comments.update(pos, state.playing)],
    ['audio', () => audio.update(state.playing, dt)], // levels read by the visualizer and the effects
    ['visualizer', () => view.draw(state.playing, dt)],
    // Float only while the cursor rests over the screen; with the cursor elsewhere the artwork stays straight
    ['effects', () => effects.update(now, dt, idle && pointerInside)],
    ['up next', () => upNext.update(pos)],
  ];
  const failed = new Set<string>();

  function startFrames(scope: Scope) {
    let raf = 0, last = 0;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      dt = frameStep(time, last);
      now = last = time;
      pos = state.position();
      for (const [name, run] of parts) {
        try { run(); } catch (e) {
          if (!failed.has(name)) console.error(`[Now Playing] ${name} update failed`, e);
          failed.add(name);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    scope.add(() => cancelAnimationFrame(raf));
  }

  // --- Open and close ---
  async function show() {
    if (session) return;
    const scope = session = new Scope();
    root.classList.add('open');
    root.scrollTop = 0;
    queue.reset(); controls.reset(); lastCurrentId = null;
    controls.refreshModes();
    setLyrics(false);
    try {
      const [qu, playback] = await Promise.all([api.Queue.getQueue(), api.Playback.getState()]);
      if (!scope.active) return;
      state.queue = qu;
      onPlayback(playback);
    } catch { /* Nuclear not ready */ }
    if (!scope.active) return; // closed (or reopened) while waiting
    // Window buttons only when Nuclear draws its own title bar (the one the screen covers)
    api.Settings.getGlobal('core.appearance.customTitleBar')
      .then((custom) => { if (scope.active) root.classList.toggle('custom-titlebar', !!custom && appWindow.available); })
      .catch(() => {});
    renderTrack(); queue.render(true);
    scope.add(api.Queue.subscribe((qu) => { state.queue = qu; renderTrack(); queue.render(); }));
    scope.add(api.Playback.subscribe((s) => { onPlayback(s); queue.renderCount(); }));
    try { scope.add(api.Favorites.subscribe(() => refreshFav())); } catch { /* favorites unavailable */ }
    scope.interval(() => controls.refreshModes(), MODES_POLL_MS);
    tickClock();
    scope.interval(tickClock, CLOCK_MS);
    failed.clear();
    startFrames(scope);
    wake();
  }

  function hide() {
    if (!session) return;
    session.close();
    session = null;
    root.classList.remove('open');
    setSettingsOpen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    clearTimeout(idleTimer); clearTimeout(toastTimer);
    audio.stop();
    comments.clear();
  }

  return {
    root,
    show,
    toast,
    isOpen: () => !!session,
    setPrefs: applyPrefs,
    destroy() {
      hide();
      view.destroy();
      effects.setEnabled(false);
      reducedMotion?.removeEventListener('change', applyMotion);
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      style.remove();
    },
  };
}

export type Screen = ReturnType<typeof createScreen>;

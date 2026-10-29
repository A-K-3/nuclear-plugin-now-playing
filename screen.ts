// Pantalla de reproducción: portada, info, línea de tiempo, controles, favorito, letras,
// comentarios de SoundCloud, visualizador y cola (buscable, reordenable, redimensionable y plegable).
import { SoundCloudComments } from './comments';
import { ICON, svg } from './icons';
import { LyricsPanel } from './lyrics';
import type { Prefs } from './settings';
import { BTN_ID, CSS, ROOT_ID } from './styles';
import { accentFrom, art, clamp, display, esc, fallbackCover, fmt, fmtLong, loadImage, norm, storage } from './util';
import { Visualizer } from './visualizer';

export const HOTKEY = 'F9';
const QUEUE_KEY = 'npx-queue';
const NEUTRAL_TINT = '40, 40, 48';

const HTML = `
<div class="bg" data-bg="A"></div><div class="bg" data-bg="B" style="opacity:0"></div>
<div class="blobs"><i></i><i></i><i></i></div>
<div class="tint"></div>
<div class="app">
  <section class="player">
    <canvas class="viz"></canvas>
    <button data-act="close" class="back" title="Volver a Nuclear (Esc)">${svg(ICON.back)}<span>Volver</span></button>
    <div class="clock"></div>
    <div class="corner">
      <button data-act="comments" class="ctoggle" title="Comentarios de SoundCloud (C)">${svg(ICON.comment)}</button>
      <button data-act="queue" class="qtoggle" title="Mostrar u ocultar la cola (Q)">${svg(ICON.list)}</button>
      <button data-act="full" title="Pantalla completa (F)">${svg(ICON.full)}</button>
    </div>
    <div class="stage">
      <div class="main">
        <div class="cover"><div class="empty"></div><img data-img="A" alt=""><img data-img="B" alt="" style="opacity:0"></div>
        <div class="info"><div class="title">—</div><div class="artist"></div><div class="album"></div></div>
        <div class="timeline">
          <div class="slider seek"><div class="sc-markers"></div><div class="fill"></div><div class="knob"></div></div>
          <div class="times"><span class="cur">0:00</span><span class="sc-status"></span><span class="dur">0:00</span></div>
        </div>
        <div class="controls">
          <button data-act="fav" class="fav" title="Favorito (H)">${svg(ICON.heartOutline, 'class="favicon"')}</button>
          <button data-act="shuffle" class="mode off" title="Aleatorio (S)">${svg(ICON.shuffle)}</button>
          <button data-act="prev" title="Anterior (←)">${svg(ICON.prev)}</button>
          <button data-act="toggle" class="toggle" title="Reproducir / pausa (espacio)">${svg(ICON.play, 'class="playicon"')}</button>
          <button data-act="next" title="Siguiente (→)">${svg(ICON.next)}</button>
          <button data-act="repeat" class="mode off" title="Repetir (R)">${svg(ICON.repeat)}<span class="one"></span></button>
          <button data-act="lyrics" class="mode off" title="Letra (L)">${svg(ICON.mic)}</button>
        </div>
        <div class="volume">
          <button data-act="mute" title="Silenciar (M)">${svg(ICON.volHi, 'class="volicon"')}</button>
          <div class="slider vol"><div class="fill"></div><div class="knob"></div></div>
        </div>
      </div>
      <div class="lyrics"></div>
    </div>
    <div class="sc-layer"></div>
    <div class="upnext"><img alt=""><div><small>A continuación</small><b></b><span></span></div></div>
    <div class="toast"></div>
  </section>
  <aside class="queue">
    <div class="resizer" title="Arrastra para cambiar el ancho · doble clic para restablecerlo"></div>
    <header>
      <h2>Cola</h2><span class="count"></span>
      <button data-act="search" title="Buscar en la cola (/)">${svg(ICON.search)}</button>
      <button data-act="saveq" title="Guardar la cola como lista">${svg(ICON.save)}</button>
      <button data-act="queue" title="Plegar la cola (Q)">${svg(ICON.chevron)}</button>
    </header>
    <div class="qbar qsearch"><input type="search" placeholder="Buscar canción o artista…"></div>
    <div class="qbar qsave"><input type="text"><button data-act="dosave">Guardar</button></div>
    <ul class="list"></ul>
    <button data-act="goto" class="goto">${svg(ICON.target)}Ir a la actual</button>
  </aside>
</div>`;

// Marca un botón como activo/inactivo sin tocar el resto de sus clases
const setOn = (el: Element, on: boolean) => { el.classList.toggle('on', on); el.classList.toggle('off', !on); };

// Datos derivados de cada canción de la cola, calculados una vez por canción
type ItemInfo = { track: any; title: string; artist: string; search: string; thumb: string };

export function createScreen(api: any) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = HTML;
  document.body.appendChild(root);
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

  // Elementos que se actualizan a menudo: se buscan una sola vez
  const el = {
    list: q('.list'), count: q('.count'), cur: q('.cur'), dur: q('.dur'),
    seek: q('.seek'), seekFill: q('.seek .fill'), seekKnob: q('.seek .knob'),
    vol: q('.vol'), volFill: q('.vol .fill'), volKnob: q('.vol .knob'), volIcon: q('.volicon path'),
    playIcon: q('.playicon path'), fav: q('.fav'), favIcon: q('.favicon path'),
    shuffle: q('[data-act="shuffle"]'), repeat: q('[data-act="repeat"]'), one: q('.one'), lyricsBtn: q('[data-act="lyrics"]'),
    qtoggle: q('.qtoggle'), ctoggle: q('.ctoggle'),
    upnext: q('.upnext'), upImg: q<HTMLImageElement>('.upnext img'), upTitle: q('.upnext b'), upArtist: q('.upnext span'),
    title: q('.title'), artist: q('.artist'), album: q('.album'), clock: q('.clock'), toast: q('.toast'),
    search: q('.qsearch'), searchInput: q<HTMLInputElement>('.qsearch input'), searchBtn: q('[data-act="search"]'),
    save: q('.qsave'), saveInput: q<HTMLInputElement>('.qsave input'), saveBtn: q('[data-act="saveq"]'), goto: q('.goto'),
  };

  let prefs: Prefs | null = null;
  let open = false;
  let state = { status: 'paused', seek: 0, duration: 0, at: performance.now() };
  let queue: any = { items: [], currentIndex: 0 };
  let accentColor = '#fff';
  let lastCover: string | null = null, lastQueueKey = '', lastCur = -1, lastCurrentId: string | null = null, front = 'A', coverToken = 0;
  let upcomingSecs = 0; // duración de las canciones posteriores a la actual
  let seekDrag = false, volDrag = false, volume = 1, lastVolume = 1, repeat = 'off', shuffle = false;
  let showLyrics = false, isFav = false, filter = '', upNextShown = false;
  let lastTime = { cur: '', dur: '', pct: -1 }, lastModes = '';
  const infoCache = new Map<string, ItemInfo>();
  const unsubs: Array<() => void> = [];
  let raf = 0, poll = 0, idleTimer = 0, clockTimer = 0, toastTimer = 0;

  const currentItem = () => queue.items?.[queue.currentIndex];
  const position = () => {
    const { status, seek, duration, at } = state;
    return Math.min(duration || Infinity, (seek || 0) + (status === 'playing' ? (performance.now() - at) / 1000 : 0));
  };

  const lyrics = new LyricsPanel(api, q('.lyrics'), (s) => api.Playback.seekTo(s));
  const comments = new SoundCloudComments(api, q('.sc-layer'), q('.sc-markers'), (t) => (q('.sc-status').textContent = t ? `💬 ${t}` : ''));
  const viz = new Visualizer(q<HTMLCanvasElement>('.viz'), () => accentColor);

  function toast(text: string) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('show'), 3500);
  }

  // --- Portada (siempre directa; el color se calcula aparte) ---
  const setAccent = (accent: string, tint: string) => {
    accentColor = accent;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--tint', tint);
  };

  async function coverColors(url: string) {
    const im = await loadImage(url, !url.startsWith('data:'));
    return im && accentFrom(im);
  }

  function setCover(url: string) {
    const token = ++coverToken;
    const back = front === 'A' ? 'B' : 'A';
    const img = q<HTMLImageElement>(`[data-img="${back}"]`), bg = q(`[data-bg="${back}"]`);
    setAccent('#fff', NEUTRAL_TINT);
    img.onload = () => {
      if (token !== coverToken) return;
      bg.style.backgroundImage = `url("${url}")`;
      img.style.opacity = '1'; bg.style.opacity = '1';
      q(`[data-img="${front}"]`).style.opacity = '0'; q(`[data-bg="${front}"]`).style.opacity = '0';
      front = back;
    };
    img.src = url;
    coverColors(url).then((colors) => {
      if (token === coverToken && colors) setAccent(colors.accent, colors.tint.join(', '));
    });
  }

  const coverFor = (track: any, big: boolean) => {
    if (!track) return '';
    const d = display(track);
    return art(track, big) || fallbackCover(d.title, d.artist);
  };

  const infoFor = (it: any): ItemInfo => {
    const cached = infoCache.get(it.id);
    if (cached && cached.track === it.track) return cached;
    const d = display(it.track);
    const info = {
      track: it.track, title: d.title, artist: d.artist,
      search: norm(`${d.title} ${d.artist} ${it.track?.album?.title || ''}`), thumb: coverFor(it.track, false),
    };
    infoCache.set(it.id, info);
    return info;
  };

  // --- Canción actual ---
  async function refreshFav() {
    const track = currentItem()?.track;
    try { isFav = !!(track?.source && await api.Favorites.isTrackFavorite(track.source)); } catch { isFav = false; }
    el.fav.classList.toggle('on', isFav);
    el.favIcon.setAttribute('d', isFav ? ICON.heart : ICON.heartOutline);
  }

  function renderTrack() {
    const item = currentItem();
    const track = item?.track, d = display(track);
    const cover = coverFor(track, true);
    if (cover !== lastCover) { lastCover = cover; if (cover) setCover(cover); }
    el.title.textContent = track ? d.title : 'Nada sonando';
    el.artist.textContent = d.artist;
    el.album.textContent = track?.album?.title || '';
    const id = item?.id ?? null;
    if (id !== lastCurrentId) {
      lastCurrentId = id;
      refreshFav();
      if (showLyrics) lyrics.load(track);
      if (prefs?.comments) comments.load(track);
    }
  }

  // --- Cola ---
  // Resalta el texto buscado tal como se escribió (la coincidencia en sí ignora tildes y símbolos)
  const highlight = (text: string) => {
    const raw = String(text ?? ''), needle = el.searchInput.value.trim().toLowerCase();
    const i = needle ? raw.toLowerCase().indexOf(needle) : -1;
    return i < 0 ? esc(raw) : esc(raw.slice(0, i)) + `<mark>${esc(raw.slice(i, i + needle.length))}</mark>` + esc(raw.slice(i + needle.length));
  };

  // Contador «X / N · quedan …»: barato, se actualiza también con cada aviso de reproducción
  function renderCount() {
    const items = queue.items || [];
    const left = upcomingSecs + Math.max(0, (state.duration || 0) - position());
    el.count.textContent = items.length ? `${queue.currentIndex + 1} / ${items.length}${left > 60 ? ' · quedan ' + fmtLong(left) : ''}` : '';
  }

  // Lista de la cola: solo se rehace cuando cambian la cola, la canción actual o la búsqueda
  function renderQueue(forceScroll = false) {
    const items = queue.items || [], cur = queue.currentIndex;
    upcomingSecs = items.slice(cur + 1).reduce((s: number, it: any) => s + (it.track?.durationMs || 0) / 1000, 0);
    renderCount();
    const key = JSON.stringify([cur, filter, items.map((i: any) => [i.id, i.status])]);
    if (key === lastQueueKey && !forceScroll) return;
    const curChanged = cur !== lastCur;
    lastQueueKey = key; lastCur = cur;
    if (infoCache.size > items.length + 200) {
      const ids = new Set(items.map((it: any) => it.id));
      for (const id of infoCache.keys()) if (!ids.has(id)) infoCache.delete(id);
    }
    let shown = 0;
    const html = items.map((it: any, i: number) => {
      const info = infoFor(it), ok = !filter || info.search.includes(filter);
      if (ok) shown++;
      const failed = it.status === 'error';
      const cls = [i === cur ? 'current' : '', i < cur ? 'played' : '', failed ? 'err' : '', ok ? '' : 'hidden'].join(' ');
      const eq = i === cur ? '<span class="eq"><i></i><i></i><i></i></span>' : '';
      const dur = it.track?.durationMs ? fmt(it.track.durationMs / 1000) : '';
      return `<li class="${cls}" data-i="${i}" data-id="${esc(it.id)}" draggable="true">
        <img src="${esc(info.thumb)}" loading="lazy" alt="">
        <div class="t"><b>${eq}${highlight(info.title)}</b><span>${failed ? 'No se pudo cargar' : highlight(info.artist)}</span></div>
        <div class="end"><span class="dur">${dur}</span><button class="x" title="Quitar de la cola">${svg(ICON.close)}</button></div></li>`;
    }).join('');
    el.list.innerHTML = html + (filter && !shown ? '<li class="empty-search">Nada coincide con la búsqueda</li>' : '');
    if (curChanged || forceScroll) scrollToCurrent();
    updateGoto();
  }

  // Solo desplaza la lista (scrollIntoView movía también la pantalla y la ventana de Nuclear)
  const currentLi = () => el.list.querySelector<HTMLElement>('.current:not(.hidden)');
  function scrollToCurrent() {
    const li = currentLi();
    if (li) el.list.scrollTo({ top: li.offsetTop - el.list.clientHeight / 2 + li.offsetHeight / 2, behavior: 'smooth' });
  }
  function updateGoto() {
    const li = currentLi(), list = el.list;
    const visible = !li || (li.offsetTop + li.offsetHeight > list.scrollTop && li.offsetTop < list.scrollTop + list.clientHeight);
    el.goto.classList.toggle('show', !visible);
  }
  el.list.addEventListener('scroll', updateGoto, { passive: true });

  // Reordenar arrastrando
  let dragFrom = -1;
  const rowAt = (e: Event) => (e.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
  const clearDrop = () => el.list.querySelectorAll('.drop-before,.drop-after').forEach((li) => li.classList.remove('drop-before', 'drop-after'));
  el.list.addEventListener('dragstart', (e) => {
    const li = rowAt(e);
    if (!li) return;
    dragFrom = +li.dataset.i!;
    li.classList.add('dragging');
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', String(dragFrom));
  });
  el.list.addEventListener('dragover', (e) => {
    const li = rowAt(e);
    if (!li || dragFrom < 0) return;
    e.preventDefault();
    clearDrop();
    const r = li.getBoundingClientRect();
    li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  el.list.addEventListener('dragleave', (e) => { if (e.target === el.list) clearDrop(); });
  el.list.addEventListener('drop', (e) => {
    e.preventDefault();
    const li = rowAt(e);
    const after = li?.classList.contains('drop-after');
    clearDrop();
    if (!li || dragFrom < 0) return;
    let to = +li.dataset.i! + (after ? 1 : 0);
    if (dragFrom < to) to -= 1;
    if (to !== dragFrom) api.Queue.reorder(dragFrom, to);
    dragFrom = -1;
  });
  el.list.addEventListener('dragend', () => { clearDrop(); dragFrom = -1; el.list.querySelector('.dragging')?.classList.remove('dragging'); });

  // Buscar en la cola
  const setSearch = (show: boolean) => {
    el.search.classList.toggle('show', show);
    el.searchBtn.classList.toggle('on', show);
    if (show) { if (qPrefs.collapsed) toggleQueue(); el.searchInput.focus(); el.searchInput.select(); }
    else { el.searchInput.value = ''; filter = ''; renderQueue(true); }
  };
  el.searchInput.addEventListener('input', () => { filter = norm(el.searchInput.value); renderQueue(); });

  // Guardar la cola como lista
  const setSave = (show: boolean) => {
    el.save.classList.toggle('show', show);
    el.saveBtn.classList.toggle('on', show);
    if (show) {
      el.saveInput.value = `Cola · ${new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
      el.saveInput.focus(); el.saveInput.select();
    }
  };
  const doSave = async () => {
    const name = el.saveInput.value.trim();
    if (!name) return;
    try {
      await api.Playlists.saveQueueAsPlaylist(name);
      toast(`✓ Cola guardada como «${name}»`);
      setSave(false);
    } catch (e: any) {
      toast(`✗ No se pudo guardar: ${e?.message || e}`);
    }
  };
  el.saveInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });

  // --- Reproducción ---
  function renderPlayback(s: any) {
    if (!seekDrag) state = { ...s, at: performance.now() };
    el.playIcon.setAttribute('d', s.status === 'playing' ? ICON.pause : ICON.play);
    root.classList.toggle('paused', s.status !== 'playing');
  }
  function renderVolume(v: number) {
    el.volFill.style.width = v * 100 + '%';
    el.volKnob.style.left = v * 100 + '%';
    el.volIcon.setAttribute('d', v === 0 ? ICON.volOff : v < 0.5 ? ICON.volLo : ICON.volHi);
  }

  // Aleatorio, repetir y volumen no tienen suscripción: se consultan cada segundo mientras está abierta
  // (Settings.subscribe solo ve los ajustes del plugin, no los core.playback.*). Solo se pinta si cambió algo.
  async function refreshModes() {
    try {
      const [sh, rep, vol, muted] = await Promise.all([
        api.Playback.isShuffleEnabled(), api.Playback.getRepeatMode(), api.Playback.getVolume(), api.Playback.isMuted(),
      ]);
      shuffle = sh; repeat = rep;
      const v = muted ? 0 : vol;
      const modes = `${sh}|${rep}|${volDrag ? '' : v}`;
      if (modes === lastModes) return;
      lastModes = modes;
      setOn(el.shuffle, sh);
      setOn(el.repeat, rep !== 'off');
      el.one.textContent = rep === 'one' ? '1' : '';
      if (!volDrag) { volume = v; renderVolume(volume); }
    } catch { /* noop */ }
  }

  // Línea de tiempo: solo escribe en la página cuando cambia lo que se ve
  function drawTime(pos: number, dur: number) {
    const pct = dur ? Math.round(Math.min(100, (pos / dur) * 100) * 100) / 100 : 0;
    if (pct !== lastTime.pct) {
      el.seekFill.style.width = pct + '%';
      el.seekKnob.style.left = pct + '%';
      lastTime.pct = pct;
    }
    const cur = fmt(pos), total = fmt(dur);
    if (cur !== lastTime.cur) el.cur.textContent = lastTime.cur = cur;
    if (total !== lastTime.dur) el.dur.textContent = lastTime.dur = total;
  }

  function renderUpNext(pos: number) {
    const next = queue.items?.[queue.currentIndex + 1];
    const remaining = (state.duration || 0) - pos;
    const show = !!(prefs?.upNext && next && state.status === 'playing' && state.duration > 25
      && remaining <= 10 && remaining > 0.3 && repeat !== 'one' && !shuffle);
    if (show && el.upnext.dataset.id !== next.id) {
      const info = infoFor(next);
      el.upnext.dataset.id = next.id;
      el.upImg.src = info.thumb;
      el.upTitle.textContent = info.title;
      el.upArtist.textContent = info.artist;
    }
    if (show !== upNextShown) { el.upnext.classList.toggle('show', show); upNextShown = show; }
  }

  function tick() {
    const pos = position();
    if (!seekDrag) drawTime(pos, state.duration);
    const playing = state.status === 'playing';
    if (showLyrics) lyrics.update(pos);
    comments.update(pos, playing);
    viz.draw(playing);
    renderUpNext(pos);
    raf = requestAnimationFrame(tick);
  }

  function slider(target: HTMLElement, onMove: (f: number) => void, onEnd: (f: number) => void) {
    const frac = (e: PointerEvent) => { const r = target.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    target.addEventListener('pointerdown', (e) => { target.setPointerCapture(e.pointerId); target.classList.add('drag'); onMove(frac(e)); });
    target.addEventListener('pointermove', (e) => { if (target.classList.contains('drag')) onMove(frac(e)); });
    target.addEventListener('pointerup', (e) => { if (!target.classList.contains('drag')) return; target.classList.remove('drag'); onEnd(frac(e)); });
  }
  slider(el.seek, (f) => {
    if (!state.duration) return;
    seekDrag = true; drawTime(f * state.duration, state.duration);
  }, (f) => {
    if (!seekDrag) return;
    seekDrag = false;
    const s = f * state.duration;
    state = { ...state, seek: s, at: performance.now() };
    api.Playback.seekTo(s);
  });
  const setVolume = (v: number) => {
    volume = Math.round(clamp(v, 0, 1) * 100) / 100;
    renderVolume(volume);
    api.Playback.setMuted(false);
    api.Playback.setVolume(volume);
  };
  slider(el.vol, (f) => { volDrag = true; setVolume(f); }, (f) => { setVolume(f); setTimeout(() => (volDrag = false), 600); });
  el.vol.addEventListener('wheel', (e) => { e.preventDefault(); setVolume(volume - Math.sign(e.deltaY) * 0.05); }, { passive: false });
  const toggleMute = () => { if (volume > 0) { lastVolume = volume; setVolume(0); } else setVolume(lastVolume || 0.5); };

  // --- Cola: ancho ajustable y plegable, recordado entre sesiones ---
  const Q_DEFAULT = 340, Q_MIN = 240;
  const qPrefs = storage.get(QUEUE_KEY, { width: Q_DEFAULT, collapsed: false });
  const saveQueuePrefs = () => storage.set(QUEUE_KEY, qPrefs);
  const applyQueue = () => {
    root.style.setProperty('--qw', qPrefs.collapsed ? '0px' : `${qPrefs.width}px`);
    root.classList.toggle('qcollapsed', qPrefs.collapsed);
    setOn(el.qtoggle, !qPrefs.collapsed);
  };
  const toggleQueue = () => { qPrefs.collapsed = !qPrefs.collapsed; applyQueue(); saveQueuePrefs(); };
  applyQueue();
  const resizer = q('.resizer'), app = q('.app');
  resizer.addEventListener('pointerdown', (e) => { e.preventDefault(); resizer.setPointerCapture(e.pointerId); app.classList.add('resizing'); });
  resizer.addEventListener('pointermove', (e) => {
    if (!app.classList.contains('resizing')) return;
    const max = Math.min(720, Math.round(root.clientWidth * 0.6));
    qPrefs.width = Math.round(clamp(root.getBoundingClientRect().right - e.clientX, Q_MIN, max));
    applyQueue();
  });
  resizer.addEventListener('pointerup', () => { app.classList.remove('resizing'); saveQueuePrefs(); });
  resizer.addEventListener('dblclick', () => { qPrefs.width = Q_DEFAULT; applyQueue(); saveQueuePrefs(); });

  // --- Letras, comentarios, favorito, pantalla completa ---
  const setLyrics = (on: boolean) => {
    showLyrics = on;
    root.classList.toggle('show-lyrics', on);
    setOn(el.lyricsBtn, on);
    if (on) lyrics.load(currentItem()?.track);
  };

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen?.().catch(() => {});
  };

  const toggleFav = async () => {
    const track = currentItem()?.track;
    if (!track?.source) return;
    try {
      if (isFav) await api.Favorites.removeTrack(track.source);
      else await api.Favorites.addTrack(track);
      el.fav.classList.remove('pop'); void el.fav.offsetWidth; el.fav.classList.add('pop');
      await refreshFav();
      toast(isFav ? '❤️ Añadida a favoritos' : 'Quitada de favoritos');
    } catch (e: any) { toast(`✗ ${e?.message || e}`); }
  };

  const actions: Record<string, () => void> = {
    prev: () => api.Queue.goToPrevious(),
    next: () => api.Queue.goToNext(),
    toggle: () => api.Playback.toggle(),
    shuffle: () => api.Playback.setShuffleEnabled(!shuffle).then(refreshModes),
    repeat: () => api.Playback.setRepeatMode(({ off: 'all', all: 'one', one: 'off' } as any)[repeat]).then(refreshModes),
    mute: toggleMute,
    volUp: () => setVolume(volume + 0.05),
    volDown: () => setVolume(volume - 0.05),
    fav: toggleFav,
    lyrics: () => setLyrics(!showLyrics),
    comments: () => api.Settings.set('comments', !prefs?.comments),
    queue: toggleQueue,
    search: () => setSearch(!el.search.classList.contains('show')),
    openSearch: () => setSearch(true),
    saveq: () => setSave(!el.save.classList.contains('show')),
    dosave: doSave,
    goto: scrollToCurrent,
    full: fullscreen,
    close: () => hide(),
    escape: () => { if (!document.fullscreenElement) hide(); },
  };
  const KEYS: Record<string, string> = {
    Space: 'toggle', ArrowRight: 'next', ArrowLeft: 'prev', ArrowUp: 'volUp', ArrowDown: 'volDown',
    KeyM: 'mute', KeyF: 'full', KeyS: 'shuffle', KeyR: 'repeat', KeyQ: 'queue',
    KeyL: 'lyrics', KeyC: 'comments', KeyH: 'fav', Slash: 'openSearch', Escape: 'escape',
  };

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-act]') as HTMLElement | null;
    if (btn) return actions[btn.dataset.act!]?.();
    const li = target.closest('.list li[data-i]') as HTMLElement | null;
    if (!li) return;
    if (target.closest('.x')) api.Queue.removeByIds([li.dataset.id]);
    else api.Queue.goToIndex(+li.dataset.i!);
  });

  // Mientras está abierta, el teclado es suyo (no llega a los atajos de Nuclear)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === HOTKEY) { e.preventDefault(); e.stopPropagation(); return open ? hide() : show(); }
    if (!open) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (el.save.classList.contains('show')) setSave(false); else setSearch(false);
        (e.target as HTMLElement).blur();
      }
      return;
    }
    const action = actions[KEYS[e.code]];
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    action();
  };
  window.addEventListener('keydown', onKey, true);

  const wake = () => {
    root.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => root.classList.add('idle'), 3000);
  };
  root.addEventListener('mousemove', wake);

  const tickClock = () => { el.clock.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };

  function applyPrefs(p: Prefs) {
    const prev = prefs;
    prefs = p;
    root.style.setProperty('--blur', `${p.blur}px`);
    root.classList.toggle('animated', p.animatedBg);
    root.classList.toggle('show-clock', p.clock);
    root.classList.toggle('pin-back', p.backAlwaysVisible);
    viz.setMode(p.visualizer);
    setOn(el.ctoggle, p.comments);
    comments.setEnabled(p.comments);
    if (open && p.comments && !prev?.comments) comments.load(currentItem()?.track);
  }

  async function show() {
    if (open) return;
    open = true;
    root.classList.add('open');
    root.scrollTop = 0;
    lastQueueKey = ''; lastCur = -1; lastCurrentId = null; lastModes = '';
    refreshModes();
    try {
      const [qu, playback] = await Promise.all([api.Queue.getQueue(), api.Playback.getState()]);
      queue = qu;
      renderPlayback(playback);
    } catch { /* noop */ }
    setLyrics(!!prefs?.lyrics);
    renderTrack(); renderQueue(true);
    unsubs.push(api.Queue.subscribe((qu: any) => { queue = qu; renderTrack(); renderQueue(); }));
    unsubs.push(api.Playback.subscribe((s: any) => { renderPlayback(s); renderCount(); }));
    try { unsubs.push(api.Favorites.subscribe(() => refreshFav())); } catch { /* noop */ }
    poll = window.setInterval(refreshModes, 1000);
    tickClock(); clockTimer = window.setInterval(tickClock, 5000);
    raf = requestAnimationFrame(tick);
    wake();
  }

  function hide() {
    if (!open) return;
    open = false;
    root.classList.remove('open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    unsubs.splice(0).forEach((u) => u());
    clearInterval(poll); clearInterval(clockTimer); cancelAnimationFrame(raf); clearTimeout(idleTimer);
    viz.stop();
    comments.clear();
  }

  // Botón en la barra de reproducción de abajo, a la izquierda del volumen.
  // No es una vía oficial: si una actualización cambia la barra, quedan F9 y el botón de Ajustes.
  const injectButton = () => {
    if (document.getElementById(BTN_ID)) return;
    const slot = document.querySelector('[data-testid="player-volume-slider"]')?.parentElement
      ?? document.querySelector('footer.surface-bottombar .justify-self-end');
    if (!slot) return;
    const b = document.createElement('button');
    b.id = BTN_ID;
    b.title = `Pantalla de reproducción (${HOTKEY})`;
    b.innerHTML = svg(ICON.screen);
    b.onclick = () => show();
    slot.prepend(b);
  };
  let pending = false;
  const observer = new MutationObserver((records) => {
    // Los cambios dentro de la propia pantalla no pueden haber quitado el botón de Nuclear
    if (pending || records.every((r) => root.contains(r.target))) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; injectButton(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  injectButton();

  return {
    show,
    toast,
    isOpen: () => open,
    setPrefs: applyPrefs,
    destroy() {
      hide();
      viz.destroy();
      observer.disconnect();
      window.removeEventListener('keydown', onKey, true);
      document.getElementById(BTN_ID)?.remove();
      root.remove();
      style.remove();
    },
  };
}

export type Screen = ReturnType<typeof createScreen>;

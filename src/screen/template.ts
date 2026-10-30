// Markup of the screen. Buttons carry a data-act attribute naming the action they run (see index.ts).
import { t } from '../i18n';
import { appWindow } from '../nuclear/window';
import { ICON, svg } from './icons';

export const template = () => `
<div class="backdrop">
  <div class="bg" data-bg="A"></div><div class="bg" data-bg="B" style="opacity:0"></div>
  <div class="blobs"><i></i><i></i><i></i></div>
</div>
<div class="tint"></div>
<div class="pulse"></div>
<div class="app">
  <section class="player">
    <canvas class="viz"></canvas>
    <div class="dragbar"></div>
    <button data-act="close" class="back" title="${t('backTitle')}">${svg(ICON.back)}<span>${t('back')}</span></button>
    <div class="clock"></div>
    <div class="corner">
      <button data-act="settings" class="stoggle" title="${t('settings')}">${svg(ICON.gear)}</button>
      <button data-act="queue" class="qtoggle" title="${t('queueToggleTitle')}">${svg(ICON.list)}</button>
      <button data-act="full" title="${t(appWindow.available ? 'maximizeTitle' : 'fullscreenTitle')}">${svg(ICON.full)}</button>
      <span class="winctl">
        <button data-act="winMin" title="${t('winMinimize')}">${svg(ICON.winMin)}</button>
        <button data-act="winMax" title="${t('winMaximize')}">${svg(ICON.winMax)}</button>
        <button data-act="winClose" class="winclose" title="${t('winClose')}">${svg(ICON.close)}</button>
      </span>
    </div>
    <div class="settings-panel" role="dialog"></div>
    <div class="stage">
      <div class="main">
        <div class="cover-wrap">
          <div class="cover-glow"></div>
          <div class="cover"><div class="empty"></div><img data-img="A" alt=""><img data-img="B" alt="" style="opacity:0"><div class="shine"><i></i></div></div>
        </div>
        <div class="info"><div class="title">—</div><div class="artist"></div><div class="album"></div></div>
        <div class="timeline">
          <div class="slider seek"><div class="sc-markers"></div><div class="fill"></div><div class="knob"></div></div>
          <div class="times"><span class="cur">0:00</span><span class="sc-status"></span><span class="loading-note">${t('loadingAudio')}</span><span class="dur">0:00</span></div>
        </div>
        <div class="dock">
          <div class="controls">
            <button data-act="fav" class="fav" title="${t('favTitle')}">${svg(ICON.heartOutline, 'class="favicon"')}</button>
            <button data-act="shuffle" class="mode off" title="${t('shuffleTitle')}">${svg(ICON.shuffle)}</button>
            <button data-act="prev" title="${t('prevTitle')}">${svg(ICON.prev)}</button>
            <button data-act="toggle" class="toggle" title="${t('playTitle')}">${svg(ICON.play, 'class="playicon"')}</button>
            <button data-act="next" title="${t('nextTitle')}">${svg(ICON.next)}</button>
            <button data-act="repeat" class="mode off" title="${t('repeatTitle')}">${svg(ICON.repeat)}<span class="one"></span></button>
            <button data-act="lyrics" class="mode off" title="${t('lyricsTitle')}">${svg(ICON.mic)}</button>
          </div>
          <div class="volume">
            <button data-act="mute" title="${t('muteTitle')}">${svg(ICON.volHi, 'class="volicon"')}</button>
            <div class="slider vol"><div class="fill"></div><div class="knob"></div></div>
          </div>
        </div>
      </div>
      <div class="lyrics"></div>
    </div>
    <div class="sc-layer"></div>
    <div class="upnext"><img alt=""><div><small>${t('upNext')}</small><b></b><span></span></div></div>
    <div class="toast"></div>
  </section>
  <aside class="queue">
    <div class="resizer" title="${t('resizerTitle')}"></div>
    <header>
      <h2>${t('queue')}</h2><span class="count"></span>
      <button data-act="search" title="${t('searchTitle')}">${svg(ICON.search)}</button>
      <button data-act="saveq" title="${t('saveQueueTitle')}">${svg(ICON.save)}</button>
      <button data-act="queue" title="${t('collapseTitle')}">${svg(ICON.chevron)}</button>
    </header>
    <div class="qbar qsearch"><input type="search" placeholder="${t('searchPlaceholder')}"></div>
    <div class="qbar qsave"><input type="text"><button data-act="dosave">${t('save')}</button></div>
    <ul class="list"></ul>
    <button data-act="goto" class="goto">${svg(ICON.target)}${t('goToCurrent')}</button>
  </aside>
</div>`;

// Plays a CSS animation again from the start: remove the class (or inline animation), force a reflow, put it back
export function restartAnimation(el: HTMLElement, className?: string) {
  if (className) el.classList.remove(className); else el.style.animation = 'none';
  void el.offsetWidth;
  if (className) el.classList.add(className); else el.style.animation = '';
}

// Marks a button as on/off without touching its other classes
export const setOn = (el: Element, on: boolean) => { el.classList.toggle('on', on); el.classList.toggle('off', !on); };

// Query inside the screen; the template guarantees the elements exist
export type Query = <T extends HTMLElement = HTMLElement>(selector: string) => T;
export const queryIn = (root: HTMLElement): Query => (selector) => {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`[Now Playing] missing element: ${selector}`);
  return el as never;
};

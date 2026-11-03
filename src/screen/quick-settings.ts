// Quick settings panel inside the screen (gear button). Every control writes the plugin setting
// through api.Settings, so it stays in sync with Nuclear › Settings › Now Playing; the screen applies
// the change when the settings subscription fires, and calls update() to refresh the controls.
import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

import { t } from '../i18n';
import { esc } from '../lib/format';
import { storage } from '../lib/storage';
import { BLUR_RANGE, DEFAULTS, VISUALIZER_MODES, type Prefs } from '../settings';

type ToggleKey = 'effects' | 'animatedBg' | 'clock' | 'comments';

// The visualizer switch turns it off, and back on with the last mode chosen
const LAST_VIZ_KEY = 'npx-last-visualizer';
const MODES = VISUALIZER_MODES.filter(([v]) => v !== 'off');

const TOGGLES: Array<[ToggleKey, Parameters<typeof t>[0]]> = [
  ['effects', 'setEffects'],
  ['animatedBg', 'setAnimatedBg'],
  ['clock', 'setClock'],
  ['comments', 'setComments'],
];

export function createQuickSettings(panel: HTMLElement, api: NuclearPluginAPI, onBlurPreview: (px: number) => void) {
  panel.innerHTML = `
    <h3>${esc(t('settings'))}</h3>
    ${TOGGLES.map(([key, label]) => `
      <div class="srow"><span>${esc(t(label))}</span><button class="switch" data-set="${key}" role="switch"></button></div>`).join('')}
    <div class="srow col viz-row">
      <div class="srow-line"><span>${esc(t('setVisualizer'))}</span><button class="switch" data-viz-switch role="switch"></button></div>
      <div class="seg">${MODES.map(([v, label]) => `<button data-viz="${v}">${esc(t(label))}</button>`).join('')}</div>
    </div>
    <div class="srow col"><span>${esc(t('setBlur'))} <b class="blur-value"></b></span>
      <input type="range" min="${BLUR_RANGE.min}" max="${BLUR_RANGE.max}" step="${BLUR_RANGE.step}" class="blur-range"></div>`;
  const range = panel.querySelector<HTMLInputElement>('.blur-range')!;
  let prefs: Prefs | null = null;

  panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLElement>('[data-set]');
    const viz = target.closest<HTMLElement>('[data-viz]');
    if (toggle && prefs) api.Settings.set(toggle.dataset.set!, !prefs[toggle.dataset.set as ToggleKey]);
    else if (viz) api.Settings.set('visualizer', viz.dataset.viz!);
    else if (target.closest('[data-viz-switch]') && prefs) {
      if (prefs.visualizer === 'off') api.Settings.set('visualizer', storage.get(LAST_VIZ_KEY, { mode: DEFAULTS.visualizer }).mode);
      else {
        storage.set(LAST_VIZ_KEY, { mode: prefs.visualizer });
        api.Settings.set('visualizer', 'off');
      }
    }
  });
  // Live preview while dragging; persist once released
  range.addEventListener('input', () => {
    onBlurPreview(+range.value);
    panel.querySelector('.blur-value')!.textContent = `${range.value} px`;
  });
  range.addEventListener('change', () => api.Settings.set('blur', +range.value));

  return {
    update(p: Prefs) {
      prefs = p;
      const setSwitch = (selector: string, on: boolean) => {
        const btn = panel.querySelector(selector)!;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-checked', String(on));
      };
      for (const [key] of TOGGLES) setSwitch(`[data-set="${key}"]`, p[key]);
      const vizOn = p.visualizer !== 'off';
      setSwitch('[data-viz-switch]', vizOn);
      panel.querySelector('.viz-row')!.classList.toggle('off', !vizOn);
      panel.querySelectorAll<HTMLElement>('[data-viz]').forEach((b) => b.classList.toggle('on', b.dataset.viz === p.visualizer));
      if (document.activeElement !== range) range.value = String(p.blur);
      panel.querySelector('.blur-value')!.textContent = `${p.blur} px`;
    },
  };
}

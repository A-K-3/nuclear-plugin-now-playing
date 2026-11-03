// Quick settings panel inside the screen (gear button). Every control writes the plugin setting
// through api.Settings, so it stays in sync with Nuclear › Settings › Now Playing; the screen applies
// the change when the settings subscription fires, and calls update() to refresh the controls.
import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

import { t } from '../i18n';
import { esc } from '../lib/format';
import { storage } from '../lib/storage';
import { BLUR_RANGE, DEFAULTS, SPARK_AMOUNTS, SPARK_STYLES, VISUALIZER_MODES, type Prefs } from '../settings';

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

// Buttons that set an enum setting, one per value
type PickKey = 'visualizer' | 'sparkStyle' | 'sparkAmount';
const seg = (key: PickKey, options: Array<[string, Parameters<typeof t>[0]]>) =>
  `<div class="seg">${options.map(([v, label]) => `<button data-pick="${key}" data-value="${v}">${esc(t(label))}</button>`).join('')}</div>`;

export function createQuickSettings(panel: HTMLElement, api: NuclearPluginAPI, onBlurPreview: (px: number) => void) {
  panel.innerHTML = `
    <h3>${esc(t('settings'))}</h3>
    ${TOGGLES.map(([key, label]) => `
      <div class="srow"><span>${esc(t(label))}</span><button class="switch" data-set="${key}" role="switch"></button></div>`).join('')}
    <div class="srow col viz-row">
      <div class="srow-line"><span>${esc(t('setVisualizer'))}</span><button class="switch" data-viz-switch role="switch"></button></div>
      ${seg('visualizer', MODES)}
      <div class="spark-opts">
        <span>${esc(t('setSparkStyle'))}</span>${seg('sparkStyle', SPARK_STYLES)}
        <span>${esc(t('setSparkAmount'))}</span>${seg('sparkAmount', SPARK_AMOUNTS)}
      </div>
    </div>
    <div class="srow col"><span>${esc(t('setBlur'))} <b class="blur-value"></b></span>
      <input type="range" min="${BLUR_RANGE.min}" max="${BLUR_RANGE.max}" step="${BLUR_RANGE.step}" class="blur-range"></div>`;
  const range = panel.querySelector<HTMLInputElement>('.blur-range')!;
  let prefs: Prefs | null = null;

  panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLElement>('[data-set]');
    const pick = target.closest<HTMLElement>('[data-pick]');
    if (toggle && prefs) api.Settings.set(toggle.dataset.set!, !prefs[toggle.dataset.set as ToggleKey]);
    else if (pick) api.Settings.set(pick.dataset.pick!, pick.dataset.value!);
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
      panel.querySelector('.viz-row')!.classList.toggle('sparks', p.visualizer === 'particles');
      panel.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => b.classList.toggle('on', p[b.dataset.pick as PickKey] === b.dataset.value));
      if (document.activeElement !== range) range.value = String(p.blur);
      panel.querySelector('.blur-value')!.textContent = `${p.blur} px`;
    },
  };
}

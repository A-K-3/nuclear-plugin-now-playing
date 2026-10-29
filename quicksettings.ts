// Quick settings panel inside the screen (gear button). Every control writes the plugin setting
// through api.Settings, so it stays in sync with Nuclear › Settings › Now Playing; the screen applies
// the change when the settings subscription fires, and calls update() to refresh the controls.
import { t } from './i18n';
import { esc } from './util';
import type { Prefs } from './settings';

type ToggleKey = 'effects' | 'animatedBg' | 'clock' | 'comments';

const TOGGLES: Array<[ToggleKey, Parameters<typeof t>[0]]> = [
  ['effects', 'setEffects'],
  ['animatedBg', 'setAnimatedBg'],
  ['clock', 'setClock'],
  ['comments', 'setComments'],
];
const VISUALIZER: Array<[Prefs['visualizer'], Parameters<typeof t>[0]]> = [
  ['off', 'setVizOff'], ['bars', 'setVizBars'], ['wave', 'setVizWave'],
];

export function createQuickSettings(panel: HTMLElement, api: any, onBlurPreview: (px: number) => void) {
  panel.innerHTML = `
    <h3>${esc(t('settings'))}</h3>
    ${TOGGLES.map(([key, label]) => `
      <div class="srow"><span>${esc(t(label))}</span><button class="switch" data-set="${key}" role="switch"></button></div>`).join('')}
    <div class="srow"><span>${esc(t('setVisualizer'))}</span>
      <div class="seg">${VISUALIZER.map(([v, label]) => `<button data-viz="${v}">${esc(t(label))}</button>`).join('')}</div>
    </div>
    <div class="srow col"><span>${esc(t('setBlur'))} <b class="blur-value"></b></span>
      <input type="range" min="0" max="150" step="10" class="blur-range"></div>`;
  const range = panel.querySelector<HTMLInputElement>('.blur-range')!;
  let prefs: Prefs | null = null;

  panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLElement>('[data-set]');
    const viz = target.closest<HTMLElement>('[data-viz]');
    if (toggle && prefs) api.Settings.set(toggle.dataset.set, !prefs[toggle.dataset.set as ToggleKey]);
    else if (viz) api.Settings.set('visualizer', viz.dataset.viz);
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
      for (const [key] of TOGGLES) {
        const btn = panel.querySelector(`[data-set="${key}"]`)!;
        btn.classList.toggle('on', p[key]);
        btn.setAttribute('aria-checked', String(p[key]));
      }
      panel.querySelectorAll<HTMLElement>('[data-viz]').forEach((b) => b.classList.toggle('on', b.dataset.viz === p.visualizer));
      if (document.activeElement !== range) range.value = String(p.blur);
      panel.querySelector('.blur-value')!.textContent = `${p.blur} px`;
    },
  };
}

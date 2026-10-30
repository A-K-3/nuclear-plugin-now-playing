// Plugin settings, shown in Nuclear › Settings under the "Now Playing" category
import type { NuclearPluginAPI, SettingDefinition, SettingValue } from '@nuclearplayer/plugin-sdk';

import { t } from './i18n';

const CATEGORY = 'Now Playing';

export type Prefs = {
  blur: number;
  effects: boolean;
  animatedBg: boolean;
  visualizer: 'off' | 'bars' | 'wave';
  clock: boolean;
  comments: boolean;
};

export const DEFAULTS: Prefs = {
  blur: 80,
  effects: true,
  animatedBg: true,
  visualizer: 'wave',
  clock: false,
  comments: true,
};

const definitions = (): SettingDefinition[] => [
  { category: CATEGORY, id: 'open', title: t('setOpen'), description: t('setOpenDesc'), kind: 'custom', widgetId: 'open', default: null },
  { category: CATEGORY, id: 'blur', title: t('setBlur'), kind: 'number', default: DEFAULTS.blur,
    widget: { type: 'slider', min: 0, max: 150, step: 10, unit: 'px', startLabel: t('setBlurSharp'), endLabel: t('setBlurSoft') } },
  { category: CATEGORY, id: 'effects', title: t('setEffects'), description: t('setEffectsDesc'), kind: 'boolean', default: DEFAULTS.effects },
  { category: CATEGORY, id: 'animatedBg', title: t('setAnimatedBg'), description: t('setAnimatedBgDesc'), kind: 'boolean', default: DEFAULTS.animatedBg },
  { category: CATEGORY, id: 'visualizer', title: t('setVisualizer'), kind: 'enum', default: DEFAULTS.visualizer, widget: { type: 'select' },
    options: [{ value: 'off', label: t('setVizOff') }, { value: 'bars', label: t('setVizBars') }, { value: 'wave', label: t('setVizWave') }] },
  { category: CATEGORY, id: 'clock', title: t('setClock'), kind: 'boolean', default: DEFAULTS.clock },
  { category: CATEGORY, id: 'comments', title: t('setComments'), description: t('setCommentsDesc'), kind: 'boolean', default: DEFAULTS.comments },
];

export async function registerSettings(api: NuclearPluginAPI) {
  await api.Settings.register(definitions());
}

// Reads the settings and calls onChange whenever one changes. Returns the unsubscribe function.
export async function watchSettings(api: NuclearPluginAPI, onChange: (prefs: Prefs) => void) {
  const prefs: Prefs = { ...DEFAULTS };
  const keys = Object.keys(DEFAULTS) as (keyof Prefs)[];
  // Values come from the host untyped; each key keeps the type of its default
  const assign = (k: keyof Prefs, v: SettingValue | undefined) => {
    (prefs as Record<keyof Prefs, unknown>)[k] = v ?? DEFAULTS[k];
  };
  await Promise.all(keys.map(async (k) => {
    try { assign(k, await api.Settings.get(k)); } catch { /* keep the default */ }
  }));
  onChange({ ...prefs });
  const unsubs = keys.map((k) => api.Settings.subscribe(k, (v) => {
    assign(k, v);
    onChange({ ...prefs });
  }));
  return () => unsubs.forEach((u) => typeof u === 'function' && u());
}

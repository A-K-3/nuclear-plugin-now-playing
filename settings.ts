// Plugin settings, shown in Nuclear › Settings under the "Now Playing" category
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
  visualizer: 'bars',
  clock: false,
  comments: true,
};

const definitions = () => [
  { id: 'open', title: t('setOpen'), description: t('setOpenDesc'), kind: 'custom', widgetId: 'open', default: null },
  { id: 'blur', title: t('setBlur'), kind: 'number', default: DEFAULTS.blur,
    widget: { type: 'slider', min: 0, max: 150, step: 10, unit: 'px', startLabel: t('setBlurSharp'), endLabel: t('setBlurSoft') } },
  { id: 'effects', title: t('setEffects'), description: t('setEffectsDesc'), kind: 'boolean', default: DEFAULTS.effects },
  { id: 'animatedBg', title: t('setAnimatedBg'), description: t('setAnimatedBgDesc'), kind: 'boolean', default: DEFAULTS.animatedBg },
  { id: 'visualizer', title: t('setVisualizer'), kind: 'enum', default: DEFAULTS.visualizer, widget: { type: 'select' },
    options: [{ value: 'off', label: t('setVizOff') }, { value: 'bars', label: t('setVizBars') }, { value: 'wave', label: t('setVizWave') }] },
  { id: 'clock', title: t('setClock'), kind: 'boolean', default: DEFAULTS.clock },
  { id: 'comments', title: t('setComments'), description: t('setCommentsDesc'), kind: 'boolean', default: DEFAULTS.comments },
];

export async function registerSettings(api: any) {
  await api.Settings.register(definitions().map((d) => ({ category: CATEGORY, ...d })));
}

// Reads the settings and calls onChange whenever one changes. Returns the unsubscribe function.
export async function watchSettings(api: any, onChange: (prefs: Prefs) => void) {
  const prefs: Prefs = { ...DEFAULTS };
  const keys = Object.keys(DEFAULTS) as (keyof Prefs)[];
  await Promise.all(keys.map(async (k) => {
    try {
      const v = await api.Settings.get(k);
      if (v !== undefined && v !== null) (prefs as any)[k] = v;
    } catch { /* keep the default */ }
  }));
  onChange({ ...prefs });
  const unsubs = keys.map((k) => api.Settings.subscribe(k, (v: any) => {
    (prefs as any)[k] = v ?? DEFAULTS[k];
    onChange({ ...prefs });
  }));
  return () => unsubs.forEach((u: any) => typeof u === 'function' && u());
}

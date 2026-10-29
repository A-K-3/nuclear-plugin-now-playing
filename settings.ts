// Ajustes del plugin: aparecen en Nuclear › Ajustes, en la categoría «Now Playing»

const CATEGORY = 'Now Playing';

export type Prefs = {
  blur: number;
  animatedBg: boolean;
  visualizer: 'off' | 'bars' | 'wave';
  clock: boolean;
  backAlwaysVisible: boolean;
  upNext: boolean;
  skipFailed: boolean;
  comments: boolean;
  lyrics: boolean;
};

export const DEFAULTS: Prefs = {
  blur: 80,
  animatedBg: true,
  visualizer: 'bars',
  clock: false,
  backAlwaysVisible: false,
  upNext: true,
  skipFailed: true,
  comments: true,
  lyrics: false,
};

const DEFS = [
  { id: 'open', title: 'Pantalla de reproducción', description: 'También con F9 o el botón junto al volumen.', kind: 'custom', widgetId: 'open', default: null },
  { id: 'blur', title: 'Desenfoque del fondo', kind: 'number', default: DEFAULTS.blur,
    widget: { type: 'slider', min: 0, max: 150, step: 10, unit: 'px', startLabel: 'Nítido', endLabel: 'Muy difuso' } },
  { id: 'animatedBg', title: 'Fondo animado', description: 'Los colores de la portada se mueven despacio.', kind: 'boolean', default: DEFAULTS.animatedBg },
  { id: 'visualizer', title: 'Visualizador', kind: 'enum', default: DEFAULTS.visualizer, widget: { type: 'select' },
    options: [{ value: 'off', label: 'Desactivado' }, { value: 'bars', label: 'Barras' }, { value: 'wave', label: 'Onda' }] },
  { id: 'clock', title: 'Mostrar reloj', kind: 'boolean', default: DEFAULTS.clock },
  { id: 'backAlwaysVisible', title: '«Volver» siempre visible', description: 'Si está desactivado, se oculta tras 3 s sin mover el ratón.', kind: 'boolean', default: DEFAULTS.backAlwaysVisible },
  { id: 'upNext', title: 'Aviso de «A continuación»', description: 'Tarjeta con la siguiente canción en los últimos 10 segundos.', kind: 'boolean', default: DEFAULTS.upNext },
  { id: 'skipFailed', title: 'Saltar canciones que fallan', description: 'Pasa a la siguiente si una no se puede cargar.', kind: 'boolean', default: DEFAULTS.skipFailed },
  { id: 'comments', title: 'Comentarios de SoundCloud', description: 'Muestra los comentarios en el segundo en que se escribieron.', kind: 'boolean', default: DEFAULTS.comments },
  { id: 'lyrics', title: 'Abrir con letras', description: 'Muestra el panel de letras al abrir la pantalla (tecla L).', kind: 'boolean', default: DEFAULTS.lyrics },
  { id: 'importer', title: 'Importar de Spotify', description: 'Pega enlaces de canciones, listas o álbumes de Spotify.', kind: 'custom', widgetId: 'importer', default: null },
];

export async function registerSettings(api: any) {
  await api.Settings.register(DEFS.map((d) => ({ category: CATEGORY, ...d })));
}

// Lee los ajustes y avisa cada vez que cambie uno. Devuelve la función para dejar de escuchar.
export async function watchSettings(api: any, onChange: (prefs: Prefs) => void) {
  const prefs: Prefs = { ...DEFAULTS };
  const keys = Object.keys(DEFAULTS) as (keyof Prefs)[];
  await Promise.all(keys.map(async (k) => {
    try {
      const v = await api.Settings.get(k);
      if (v !== undefined && v !== null) (prefs as any)[k] = v;
    } catch { /* noop */ }
  }));
  onChange({ ...prefs });
  const unsubs = keys.map((k) => api.Settings.subscribe(k, (v: any) => {
    (prefs as any)[k] = v ?? DEFAULTS[k];
    onChange({ ...prefs });
  }));
  return () => unsubs.forEach((u: any) => typeof u === 'function' && u());
}

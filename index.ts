// Now Playing para Nuclear:
// - Pantalla de reproducción (botón junto al volumen, F9 o Ajustes): portada, letras, comentarios de
//   SoundCloud, visualizador, favorito y cola buscable/reordenable/redimensionable.
// - Doble clic en una canción de cualquier lista para reproducirla.
// - Salto automático de canciones que no cargan.
// - Importador de Spotify (pantalla de importar listas de Nuclear y Ajustes).
import React from 'react';

import { setupAutoSkip } from './autoskip';
import { setupDoubleClickPlay } from './doubleclick';
import { createImporterWidget, createSpotifyProvider } from './importer';
import { createScreen, HOTKEY, type Screen } from './screen';
import { DEFAULTS, type Prefs, registerSettings, watchSettings } from './settings';
import { BUTTON_STYLE } from './util';

let api: any = null;
let screen: Screen | null = null;
let prefs: Prefs = { ...DEFAULTS };
// Todo lo que onEnable monta se desmonta desde aquí, en orden inverso
const cleanups: Array<() => void> = [];

const OpenWidget = () =>
  React.createElement('button', { onClick: () => screen?.show(), style: BUTTON_STYLE }, `Abrir pantalla (${HOTKEY})`);

const ImporterWidget = createImporterWidget(() => api);

function registerWidgets(pluginApi: any) {
  pluginApi.Settings.registerWidget('open', OpenWidget);
  pluginApi.Settings.registerWidget('importer', ImporterWidget);
}

export default {
  async onLoad(pluginApi: any) {
    api = pluginApi;
    registerWidgets(pluginApi);
    await registerSettings(pluginApi);
  },

  async onEnable(pluginApi: any) {
    api = pluginApi;
    registerWidgets(pluginApi);
    cleanups.push(() => {
      pluginApi.Settings.unregisterWidget('open');
      pluginApi.Settings.unregisterWidget('importer');
    });

    const created = createScreen(pluginApi);
    screen = created;
    cleanups.push(() => { created.destroy(); screen = null; });

    cleanups.push(await watchSettings(pluginApi, (p) => { prefs = p; screen?.setPrefs(p); }));
    cleanups.push(setupDoubleClickPlay());
    cleanups.push(setupAutoSkip(pluginApi, () => prefs.skipFailed, (text) => { if (screen?.isOpen()) screen.toast(text); }));
    try {
      const providerId = pluginApi.Providers.register(createSpotifyProvider(pluginApi));
      cleanups.push(() => pluginApi.Providers.unregister(providerId));
    } catch (e) {
      console.warn('[Now Playing] no se pudo registrar el importador de Spotify:', e);
    }
  },

  async onDisable() {
    cleanups.splice(0).reverse().forEach((fn) => { try { fn(); } catch { /* noop */ } });
  },
};

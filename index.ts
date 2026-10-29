// Now Playing for Nuclear:
// - Fullscreen Now Playing screen (button next to the volume, F9 or Settings): artwork, lyrics,
//   SoundCloud comments, visualizer, favorite and a searchable, reorderable, resizable queue.
// - Double-click any track row to play it.
// - Automatic skip of songs that fail to load.
// - Media keys (keyboard, headphones) routed through Nuclear, with track info for the OS overlay.
// - Spotify importer (Nuclear's import playlist screen and Settings).
import React from 'react';

import { setupAutoSkip } from './autoskip';
import { setupDoubleClickPlay } from './doubleclick';
import { initLanguage, t } from './i18n';
import { createImporterWidget, createSpotifyProvider } from './importer';
import { setupMediaSession } from './mediasession';
import { createScreen, type Screen } from './screen';
import { DEFAULTS, type Prefs, registerSettings, watchSettings } from './settings';
import { BUTTON_STYLE } from './util';

let api: any = null;
let screen: Screen | null = null;
let prefs: Prefs = { ...DEFAULTS };
// Everything onEnable sets up is torn down from here, in reverse order
const cleanups: Array<() => void> = [];

const OpenWidget = () =>
  React.createElement('button', { onClick: () => screen?.show(), style: BUTTON_STYLE }, t('setOpenButton'));

const ImporterWidget = createImporterWidget(() => api);

function registerWidgets(pluginApi: any) {
  pluginApi.Settings.registerWidget('open', OpenWidget);
  pluginApi.Settings.registerWidget('importer', ImporterWidget);
}

export default {
  async onLoad(pluginApi: any) {
    api = pluginApi;
    await initLanguage(pluginApi);
    registerWidgets(pluginApi);
    await registerSettings(pluginApi);
  },

  async onEnable(pluginApi: any) {
    api = pluginApi;
    await initLanguage(pluginApi);
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
    cleanups.push(setupMediaSession(pluginApi));
    cleanups.push(setupAutoSkip(pluginApi, () => prefs.skipFailed, (text) => { if (screen?.isOpen()) screen.toast(text); }));
    try {
      const providerId = pluginApi.Providers.register(createSpotifyProvider(pluginApi));
      cleanups.push(() => pluginApi.Providers.unregister(providerId));
    } catch (e) {
      console.warn('[Now Playing] could not register the Spotify importer:', e);
    }
  },

  async onDisable() {
    cleanups.splice(0).reverse().forEach((fn) => { try { fn(); } catch { /* keep tearing down */ } });
  },
};

// Now Playing for Nuclear:
// - Fullscreen Now Playing screen (button next to the volume, F9 or Settings): artwork, lyrics,
//   SoundCloud comments, visualizer, favorite and a searchable, reorderable, resizable queue.
// - Double-click any track row to play it.
// - Automatic skip of songs that fail to load.
// - Media keys (keyboard, headphones) routed through Nuclear, with track info for the OS overlay.
import type { NuclearPlugin, NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';
import React from 'react';

import { initLanguage, t } from './i18n';
import { setupAutoSkip } from './nuclear/auto-skip';
import { setupDoubleClickPlay } from './nuclear/double-click';
import { setupMediaSession } from './nuclear/media-session';
import { setupPlayerButton } from './nuclear/player-button';
import { createScreen, type Screen } from './screen';
import { registerSettings, watchSettings } from './settings';

// Style of the "Open screen" button in Nuclear › Settings › Now Playing
const BUTTON_STYLE = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer',
};

let screen: Screen | null = null;
// Everything onEnable sets up is torn down from here, in reverse order
const cleanups: Array<() => void> = [];
// Bumped on every enable and disable: an onEnable still waiting when the plugin is disabled stops there
let generation = 0;

const OpenWidget = () =>
  React.createElement('button', { onClick: () => screen?.show(), style: BUTTON_STYLE }, t('setOpenButton'));

const registerWidgets = (api: NuclearPluginAPI) => api.Settings.registerWidget('open', OpenWidget);

const plugin: NuclearPlugin = {
  async onLoad(api) {
    await initLanguage(api);
    registerWidgets(api);
    await registerSettings(api);
  },

  async onEnable(api) {
    const current = ++generation;
    await initLanguage(api);
    if (current !== generation) return;
    registerWidgets(api);
    cleanups.push(() => api.Settings.unregisterWidget('open'));

    const created = createScreen(api);
    screen = created;
    cleanups.push(() => { created.destroy(); screen = null; });
    cleanups.push(setupPlayerButton(() => created.show(), created.root));
    cleanups.push(setupDoubleClickPlay());
    cleanups.push(setupMediaSession(api));
    cleanups.push(setupAutoSkip(api, (text) => { if (created.isOpen()) created.toast(text); }));

    const unwatch = await watchSettings(api, (p) => created.setPrefs(p));
    // Disabled while reading the settings: everything above is already torn down
    if (current !== generation) unwatch();
    else cleanups.push(unwatch);
  },

  async onDisable() {
    generation++;
    cleanups.splice(0).reverse().forEach((fn) => { try { fn(); } catch { /* keep tearing down */ } });
  },
};

export default plugin;

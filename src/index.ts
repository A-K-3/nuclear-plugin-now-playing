// Now Playing for Nuclear:
// - Fullscreen Now Playing screen (button next to the volume, F9 or Settings): artwork, lyrics,
//   SoundCloud comments, visualizer, favorite and a searchable, reorderable, resizable queue.
// - Double-click any track row to play it.
// - Automatic skip of songs that fail to load.
// - Media keys (keyboard, headphones) routed through Nuclear, with track info for the OS overlay.
// - Nuclear's queue saves batched, so long queues (a 1000-song playlist) do not make it stutter.
import type { NuclearPlugin, NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';
import React from 'react';

import { initLanguage, t } from './i18n';
import { Scope } from './lib/scope';
import { setupAutoSkip } from './nuclear/auto-skip';
import { setupDoubleClickPlay } from './nuclear/double-click';
import { setupMediaSession } from './nuclear/media-session';
import { setupPlayerButton } from './nuclear/player-button';
import { setupQueueSaveBatching } from './nuclear/queue-saves';
// Folder imports must name index explicitly: Nuclear's loader resolves the imports inside a folder's
// index one level too high (see scripts/build.mjs)
import { createScreen, type Screen } from './screen/index';
import { registerSettings, watchSettings } from './settings';

// Style of the "Open screen" button in Nuclear › Settings › Now Playing
const BUTTON_STYLE = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer',
};

let screen: Screen | null = null;
// The current enable of the plugin: everything onEnable sets up is registered here and torn down on
// disable. An onEnable still waiting when the plugin is disabled finds its scope closed and stops.
let enabled: Scope | null = null;

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
    const scope = enabled = new Scope();
    await initLanguage(api);
    if (!scope.active) return;
    registerWidgets(api);
    scope.add(() => api.Settings.unregisterWidget('open'));

    const created = createScreen(api);
    screen = created;
    scope.add(() => { created.destroy(); screen = null; });
    scope.add(setupPlayerButton(() => created.show(), created.root));
    scope.add(setupDoubleClickPlay());
    scope.add(setupMediaSession(api));
    scope.add(setupQueueSaveBatching());
    scope.add(setupAutoSkip(api, (text) => { if (created.isOpen()) created.toast(text); }));
    // Runs straight away if the plugin was disabled while the settings were being read
    scope.add(await watchSettings(api, (p) => created.setPrefs(p)));
  },

  async onDisable() {
    enabled?.close();
    enabled = null;
  },
};

export default plugin;

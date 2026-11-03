// A stand-in for Nuclear's plugin API, run inside the test page. It records calls and subscriptions
// so the tests can check what the plugin did, and loads the built bundle the way Nuclear does
// (CommonJS, with only `react` provided).
// Everything inside installFakeHost is serialized into the page, so it must not use outer variables;
// type-only imports are fine (they disappear when compiled).
import type { NuclearPluginAPI, SettingValue } from '@nuclearplayer/plugin-sdk';

// The subset of the plugin API the fake implements; `satisfies` makes the type check fail when the SDK
// renames or changes a method the fake (and so the plugin) relies on
type FakeApi = { [K in keyof NuclearPluginAPI]?: Partial<NuclearPluginAPI[K]> };

export function installFakeHost() {
  // Any listener; each subscription passes its own kind of value
  type Listener = (value: never) => void;
  const listeners = { queue: new Set<Listener>(), playback: new Set<Listener>(), current: new Set<Listener>(), favorites: new Set<Listener>() };
  const settingListeners = new Map<string, Set<Listener>>();
  const calls: string[] = [];
  const settings: Record<string, SettingValue> = { comments: false };
  // Song 3 has a Cyrillic title, to check that searching works in any script
  const track = (i: number) => ({
    title: i === 3 ? 'Сломана' : `Song ${i}`, artists: [{ name: `Artist ${i}`, roles: [] }], durationMs: 180000 + i * 1000,
    source: { provider: 'test', id: String(i) },
  });
  const queue = { currentIndex: 1, items: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, track: track(i), status: 'success' as const, addedAtIso: '' })) };
  const playback = { status: 'playing' as const, seek: 30, duration: 181 };
  const call = (name: string) => async (..._args: unknown[]) => { calls.push(name); };
  const subscribe = (set: Set<Listener>) => (fn: Listener) => { set.add(fn); return () => set.delete(fn); };

  const api = {
    Queue: {
      getQueue: async () => queue,
      getCurrentItem: async () => queue.items[queue.currentIndex],
      subscribe: subscribe(listeners.queue),
      subscribeToCurrentItem: subscribe(listeners.current),
      goToNext: call('Queue.goToNext'), goToPrevious: call('Queue.goToPrevious'), goToIndex: call('Queue.goToIndex'),
      removeByIds: call('Queue.removeByIds'), reorder: call('Queue.reorder'),
    },
    Playback: {
      getState: async () => playback,
      subscribe: subscribe(listeners.playback),
      toggle: call('Playback.toggle'), play: call('Playback.play'), pause: call('Playback.pause'), seekTo: call('Playback.seekTo'),
      getVolume: async () => 0.8, setVolume: call('Playback.setVolume'), isMuted: async () => false, setMuted: call('Playback.setMuted'),
      isShuffleEnabled: async () => false, setShuffleEnabled: call('Playback.setShuffleEnabled'),
      getRepeatMode: async () => 'off', setRepeatMode: call('Playback.setRepeatMode'),
    },
    Settings: {
      register: async () => ({ registered: [] }),
      get: async <T extends SettingValue>(id: string) => settings[id] as T | undefined,
      set: async (id: string, value: SettingValue) => { settings[id] = value; settingListeners.get(id)?.forEach((fn) => fn(value as never)); },
      getGlobal: async () => undefined,
      subscribe: (id: string, fn: Listener) => {
        if (!settingListeners.has(id)) settingListeners.set(id, new Set());
        settingListeners.get(id)!.add(fn);
        return () => settingListeners.get(id)!.delete(fn);
      },
      registerWidget: () => {}, unregisterWidget: () => {},
    },
    Favorites: { isTrackFavorite: async () => false, addTrack: call('Favorites.addTrack'), removeTrack: call('Favorites.removeTrack'), subscribe: subscribe(listeners.favorites) },
    Lyrics: { getLyricsForTrack: async () => [] },
    Http: { fetch: async () => { throw new Error('offline'); } },
    Playlists: { saveQueueAsPlaylist: async (name: string) => { calls.push('Playlists.saveQueueAsPlaylist'); return name; } },
  } satisfies FakeApi;

  const subscriptions = () => {
    let n = 0;
    for (const set of Object.values(listeners)) n += set.size;
    for (const set of settingListeners.values()) n += set.size;
    return n;
  };

  const load = (code: string) => {
    const module = { exports: {} as Record<string, unknown> };
    const react = { createElement: () => null };
    new Function('module', 'exports', 'require', code)(module, module.exports, (name: string) => {
      if (name === 'react') return react;
      throw new Error(`unexpected require: ${name}`);
    });
    return (module.exports.default ?? module.exports) as {
      onLoad(api: unknown): Promise<void>; onEnable(api: unknown): Promise<void>; onDisable(api: unknown): Promise<void>;
    };
  };

  Object.assign(window, { fakeHost: { api, calls, settings, subscriptions, load } });
}

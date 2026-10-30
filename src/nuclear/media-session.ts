// Media keys (keyboard, headphones, Bluetooth) through the Media Session API.
// Nuclear registers no handlers, so the webview's default action pauses the <audio> element directly:
// the sound stops but Nuclear still believes it is playing, and every UI keeps the "pause" icon.
// Routing the actions to Nuclear's playback API keeps its state (and this plugin's screen) in sync.
// It also publishes title, artist and artwork to the OS media overlay.
import type { NuclearPluginAPI, QueueItem } from '@nuclearplayer/plugin-sdk';

import { art, display } from '../lib/track';

const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'stop'] as const;

export function setupMediaSession(api: NuclearPluginAPI) {
  const session = navigator.mediaSession;
  if (!session) return () => {};

  const handlers: Record<(typeof ACTIONS)[number], MediaSessionActionHandler> = {
    play: () => api.Playback.play(),
    pause: () => api.Playback.pause(),
    stop: () => api.Playback.pause(),
    nexttrack: () => api.Queue.goToNext(),
    previoustrack: () => api.Queue.goToPrevious(),
    seekto: (d) => { if (typeof d.seekTime === 'number') api.Playback.seekTo(d.seekTime); },
  };
  for (const action of ACTIONS) {
    try { session.setActionHandler(action, handlers[action]); } catch { /* action not supported */ }
  }

  let lastId: string | null = null;
  const showTrack = (item: QueueItem | undefined) => {
    if ((item?.id ?? null) === lastId) return;
    lastId = item?.id ?? null;
    const track = item?.track;
    if (!track) { session.metadata = null; return; }
    const d = display(track);
    const cover = art(track, true);
    session.metadata = new MediaMetadata({
      title: d.title, artist: d.artist, album: track.album?.title || '',
      artwork: cover ? [{ src: cover }] : [],
    });
  };
  // subscribeToCurrentItem is the precise hook; older hosts only have the whole-queue subscription
  const unsubQueue = typeof api.Queue.subscribeToCurrentItem === 'function'
    ? api.Queue.subscribeToCurrentItem(showTrack)
    : api.Queue.subscribe((queue) => showTrack(queue.items[queue.currentIndex]));
  api.Queue.getCurrentItem().then(showTrack).catch(() => {});

  let lastState = '';
  const unsubPlayback = api.Playback.subscribe((s) => {
    const state: MediaSessionPlaybackState = s.status === 'playing' ? 'playing' : s.status === 'paused' ? 'paused' : 'none';
    if (state !== lastState) session.playbackState = lastState = state;
  });

  return () => {
    unsubQueue();
    unsubPlayback();
    for (const action of ACTIONS) {
      try { session.setActionHandler(action, null); } catch { /* action not supported */ }
    }
    session.metadata = null;
    session.playbackState = 'none';
  };
}

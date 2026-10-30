// Skips to the next song when the current one cannot be played:
// - its queue item reports status "error" (the stream failed), or
// - it has been "playing" for STALL_MS without any audio loaded (duration still 0), which is what
//   happens when no streaming provider finds a source and Nuclear keeps waiting without an error.
// Stops after 5 failures in a row so a connection problem does not burn through the whole queue.
// Driven by Nuclear's queue and playback events: nothing runs while music plays normally.
import type { NuclearPluginAPI, QueueItem } from '@nuclearplayer/plugin-sdk';

import { t } from '../i18n';
import { display } from '../lib/track';

const DELAY_MS = 1500;
const STALL_MS = 30000;
const MAX_IN_A_ROW = 5;

export function setupAutoSkip(api: NuclearPluginAPI, notify: (text: string) => void) {
  let errorTimer = 0, stallTimer = 0, handled = '', inARow = 0;
  let current: QueueItem | undefined;
  let stalledId: string | null = null;

  const skip = async (item: QueueItem, reason: 'skipping' | 'noAudio') => {
    if (handled === item.id) return;
    handled = item.id;
    if (++inARow > MAX_IN_A_ROW) {
      notify(t('tooManyFailures'));
      return;
    }
    const queue = await api.Queue.getQueue().catch(() => null);
    if (!queue || queue.currentIndex >= queue.items.length - 1) return;
    notify(t(reason, { title: display(item.track).title || t('thisSong') }));
    api.Queue.goToNext();
  };

  const unsubQueue = api.Queue.subscribe((queue) => {
    const item = queue.items[queue.currentIndex];
    current = item;
    if (!item) return;
    if (item.status === 'success') inARow = 0;
    if (item.status !== 'error' || handled === item.id) return;
    clearTimeout(errorTimer);
    errorTimer = window.setTimeout(async () => {
      const now = await api.Queue.getCurrentItem().catch(() => undefined);
      if (now?.id === item.id && now.status === 'error') skip(item, 'skipping');
    }, DELAY_MS);
  });

  api.Queue.getCurrentItem().then((item) => { current ??= item; }).catch(() => {});

  // Stall watch: "playing" with no audio loaded. A timer runs only while that is the case.
  const unsubPlayback = api.Playback.subscribe((s) => {
    if (s.duration > 0) inARow = 0;
    const item = current;
    if (!item || s.status !== 'playing' || s.duration > 0) {
      stalledId = null;
      clearTimeout(stallTimer);
      return;
    }
    if (stalledId === item.id) return;
    stalledId = item.id;
    clearTimeout(stallTimer);
    stallTimer = window.setTimeout(async () => {
      const [now, state] = await Promise.all([
        api.Queue.getCurrentItem().catch(() => undefined),
        api.Playback.getState().catch(() => null),
      ]);
      if (now?.id === item.id && state?.status === 'playing' && !(state.duration > 0)) skip(item, 'noAudio');
    }, STALL_MS);
  });

  return () => { clearTimeout(errorTimer); clearTimeout(stallTimer); unsubQueue(); unsubPlayback(); };
}

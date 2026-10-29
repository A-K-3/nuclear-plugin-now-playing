// Skips to the next song when the current one cannot be played:
// - its queue item reports status "error" (the stream failed), or
// - it has been "playing" for STALL_MS without any audio loaded (duration still 0), which is what
//   happens when no streaming provider finds a source and Nuclear keeps waiting without an error.
// Stops after 5 failures in a row so a connection problem does not burn through the whole queue.
import { t } from './i18n';

const DELAY_MS = 1500;
const STALL_MS = 30000;
const CHECK_MS = 2000;
const MAX_IN_A_ROW = 5;

export function setupAutoSkip(api: any, notify: (text: string) => void) {
  let timer = 0, handled = '', inARow = 0;
  let stalledId: string | null = null, stalledSince = 0;

  const skip = async (item: any, reason: 'skipping' | 'noAudio') => {
    if (handled === item.id) return;
    handled = item.id;
    if (++inARow > MAX_IN_A_ROW) {
      notify(t('tooManyFailures'));
      return;
    }
    const queue = await api.Queue.getQueue().catch(() => null);
    if (!queue || queue.currentIndex >= queue.items.length - 1) return;
    notify(t(reason, { title: item.track?.title || t('thisSong') }));
    api.Queue.goToNext();
  };

  const unsubQueue = api.Queue.subscribe((queue: any) => {
    const item = queue.items?.[queue.currentIndex];
    if (!item) return;
    if (item.status === 'success') inARow = 0;
    if (item.status !== 'error' || handled === item.id) return;
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const now = await api.Queue.getCurrentItem().catch(() => null);
      if (now?.id === item.id && now.status === 'error') skip(item, 'skipping');
    }, DELAY_MS);
  });

  // Stall watch: "playing" with no audio loaded for too long
  const stallCheck = window.setInterval(async () => {
    const [item, state] = await Promise.all([
      api.Queue.getCurrentItem().catch(() => null),
      api.Playback.getState().catch(() => null),
    ]);
    if (!item || !state || state.status !== 'playing' || state.duration > 0) {
      stalledId = null;
      if (state?.duration > 0) inARow = 0;
      return;
    }
    if (stalledId !== item.id) { stalledId = item.id; stalledSince = Date.now(); return; }
    if (Date.now() - stalledSince >= STALL_MS) skip(item, 'noAudio');
  }, CHECK_MS);

  return () => { clearTimeout(timer); clearInterval(stallCheck); unsubQueue(); };
}

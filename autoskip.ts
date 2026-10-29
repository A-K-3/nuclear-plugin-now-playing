// Skips to the next song when the current one cannot be loaded (queue item status "error").
// Stops after 5 failures in a row so a connection problem does not burn through the whole queue.
import { t } from './i18n';

const DELAY_MS = 1500;
const MAX_IN_A_ROW = 5;

export function setupAutoSkip(api: any, isEnabled: () => boolean, notify: (text: string) => void) {
  let timer = 0, handled = '', inARow = 0;

  const unsubQueue = api.Queue.subscribe((queue: any) => {
    const item = queue.items?.[queue.currentIndex];
    if (!item) return;
    if (item.status === 'success') inARow = 0;
    if (item.status !== 'error' || handled === item.id || !isEnabled()) return;
    handled = item.id;
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const now = await api.Queue.getCurrentItem().catch(() => null);
      if (now?.id !== item.id || now.status !== 'error') return;
      if (++inARow > MAX_IN_A_ROW) {
        notify(t('tooManyFailures'));
        return;
      }
      if (queue.currentIndex >= queue.items.length - 1) return;
      notify(t('skipping', { title: item.track?.title || t('thisSong') }));
      api.Queue.goToNext();
    }, DELAY_MS);
  });

  return () => { clearTimeout(timer); unsubQueue(); };
}

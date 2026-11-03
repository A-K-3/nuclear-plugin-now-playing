// Batches Nuclear's queue saves. Nuclear writes the whole queue to queue.json after every queue change,
// even a status change of one song, and playing a song makes 6–7 such changes; with a long queue
// (playing a 1000-song playlist) each write serializes thousands of tracks and the app stutters.
// Here the queue's writes are held and only the latest values are written, once things settle
// (QUIET_MS without changes, or at most MAX_WAIT_MS after the first one), when the page is hidden,
// and when the plugin is disabled. Everything else Tauri does passes through untouched.
// Nuclear only reads queue.json at startup, so holding the writes changes nothing while it runs.
import { tauri, type Invoke } from './tauri';

const QUIET_MS = 1500;
const MAX_WAIT_MS = 8000;
// The keys Nuclear's queue store writes (queue.items, queue.currentIndex)
const QUEUE_KEY = /^queue\./;

export function setupQueueSaveBatching() {
  if (!tauri) return () => {};
  const bridge = tauri;
  const original = bridge.invoke;
  let queueRid: unknown;
  const pending = new Map<string, unknown>(); // latest value per key
  let timer = 0, firstChange = 0, saving: Promise<void> = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    timer = 0; firstChange = 0;
    if (!pending.size || queueRid === undefined) return saving;
    const entries = [...pending];
    pending.clear();
    const rid = queueRid;
    // One write at a time, in order
    saving = saving.then(async () => {
      for (const [key, value] of entries) await original.call(bridge, 'plugin:store|set', { rid, key, value });
      await original.call(bridge, 'plugin:store|save', { rid });
    }).catch((e) => console.warn('[Now Playing] queue save failed', e));
    return saving;
  };

  const schedule = () => {
    const now = Date.now();
    firstChange ||= now;
    clearTimeout(timer);
    timer = window.setTimeout(flush, Math.max(0, Math.min(QUIET_MS, firstChange + MAX_WAIT_MS - now)));
  };

  const batching: Invoke = function (this: unknown, command, args, options) {
    if (command === 'plugin:store|set' && typeof args?.key === 'string' && QUEUE_KEY.test(args.key)) {
      queueRid = args.rid;
      pending.set(args.key, args.value);
      schedule();
      return Promise.resolve(null);
    }
    if (command === 'plugin:store|save' && queueRid !== undefined && args?.rid === queueRid) {
      schedule();
      return Promise.resolve(null);
    }
    return original.call(this ?? bridge, command, args, options);
  };
  bridge.invoke = batching;

  const onHide = () => { void flush(); };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);

  return () => {
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('beforeunload', onHide);
    // Only undo our own wrapper (another plugin may have wrapped it after us)
    if (bridge.invoke === batching) bridge.invoke = original;
    void flush();
  };
}

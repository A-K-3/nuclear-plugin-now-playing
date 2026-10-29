// Salta a la siguiente canción cuando la actual no se puede cargar (estado «error» en la cola).
// Para tras 5 fallos seguidos, para no recorrer toda la cola si el problema es la conexión.
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
        notify('Varias canciones seguidas fallan; paro de saltar. ¿Hay conexión?');
        return;
      }
      if (queue.currentIndex >= queue.items.length - 1) return;
      notify(`No se pudo cargar «${item.track?.title || 'la canción'}»; paso a la siguiente`);
      api.Queue.goToNext();
    }, DELAY_MS);
  });

  return () => { clearTimeout(timer); unsubQueue(); };
}

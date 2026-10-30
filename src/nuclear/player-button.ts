// Button in Nuclear's player bar, left of the volume control, that opens the screen.
// Not an official extension point: Nuclear re-renders the bar, so the button is put back whenever it
// disappears. If an update changes the bar, F9 and the settings button still work.
import { t } from '../i18n';
import { ICON, svg } from '../screen/icons';
import { playerBarSlot } from './dom';

export const BUTTON_ID = 'npx-open';

export function setupPlayerButton(onClick: () => void, ignore: Node) {
  const inject = () => {
    if (document.getElementById(BUTTON_ID)) return;
    const slot = playerBarSlot();
    if (!slot) return;
    const b = document.createElement('button');
    b.id = BUTTON_ID;
    b.title = t('openButton');
    b.innerHTML = svg(ICON.screen);
    b.onclick = onClick;
    slot.prepend(b);
  };
  let pending = false;
  const observer = new MutationObserver((records) => {
    // Changes inside `ignore` (the screen itself) cannot have removed the button
    if (pending || records.every((r) => ignore.contains(r.target))) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; inject(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  inject();

  return () => {
    observer.disconnect();
    document.getElementById(BUTTON_ID)?.remove();
  };
}

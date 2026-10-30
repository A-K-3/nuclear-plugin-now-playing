// Double-click a track row (playlists, albums, favorites, search…) to play it now.
// Nuclear only plays on a click on the title, so this clicks that same button.
import { TRACK_ROW, trackTitleButton } from './dom';

export function setupDoubleClickPlay() {
  const onDblClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest(TRACK_ROW);
    if (!row || target.closest('button, a, input, [role="menuitem"]')) return;
    trackTitleButton(row)?.click();
    window.getSelection()?.removeAllRanges();
  };
  document.addEventListener('dblclick', onDblClick, true);
  return () => document.removeEventListener('dblclick', onDblClick, true);
}

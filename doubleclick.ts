// Double-click a track row (playlists, albums, favorites, search…) to play it now.
// Nuclear only plays on a click on the title, so this clicks that same button.
export function setupDoubleClickPlay() {
  const onDblClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest('tr[data-testid="track-row"]');
    if (!row || target.closest('button, a, input, [role="menuitem"]')) return;
    const titleButton = Array.from(row.querySelectorAll('td button'))
      .find((b) => (b as HTMLElement).className.includes('hover:underline')) as HTMLElement | undefined;
    titleButton?.click();
    window.getSelection()?.removeAllRanges();
  };
  document.addEventListener('dblclick', onDblClick, true);
  return () => document.removeEventListener('dblclick', onDblClick, true);
}

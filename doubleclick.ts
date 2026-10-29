// Doble clic en una fila de canciones (listas, álbumes, favoritos, búsqueda…) = reproducir ahora.
// Nuclear solo reproduce al hacer clic en el título; aquí se pulsa ese mismo botón por ti.
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

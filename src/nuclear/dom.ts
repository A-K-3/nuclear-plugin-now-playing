// Hooks into Nuclear's own interface that are not part of the plugin API. They are kept together
// here so an update to Nuclear's markup only needs changes in one place; every caller copes with a
// missing element (the plugin keeps working through F9 and the settings button).

// Where the "open" button goes in the player bar: left of the volume control
export function playerBarSlot(): Element | null {
  return document.querySelector('[data-testid="player-volume-slider"]')?.parentElement
    ?? document.querySelector('footer.surface-bottombar .justify-self-end');
}

// A track row in any list (playlists, albums, favourites, search…)
export const TRACK_ROW = 'tr[data-testid="track-row"]';

// The row's title button: clicking it is how Nuclear plays a track
export function trackTitleButton(row: Element): HTMLElement | undefined {
  return Array.from(row.querySelectorAll<HTMLElement>('td button')).find((b) => b.className.includes('hover:underline'));
}

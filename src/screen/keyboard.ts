// Keyboard shortcuts of the screen. Matched on the character typed (KeyboardEvent.key), not the
// physical key, so they work on any layout: "/" is Shift+7 on a Spanish keyboard, "q" is "a" on AZERTY.
import type { Action } from './actions';

const KEYS: Record<string, Action> = {
  ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'prev', ArrowUp: 'volUp', ArrowDown: 'volDown',
  m: 'mute', f: 'full', s: 'shuffle', r: 'repeat', q: 'queue',
  l: 'lyrics', c: 'comments', h: 'fav', '/': 'openSearch', Escape: 'escape',
};

// The action for a key press, if any. Shortcuts with Ctrl, Alt or Meta are left to the system.
export function keyAction(e: KeyboardEvent): Action | undefined {
  if (e.ctrlKey || e.altKey || e.metaKey) return undefined;
  return KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
}

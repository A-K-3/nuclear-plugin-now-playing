// Everything the screen can do from a button (data-act="…") or a keyboard shortcut
export const ACTIONS = [
  'prev', 'next', 'toggle', 'shuffle', 'repeat', 'mute', 'volUp', 'volDown', 'fav', 'lyrics', 'comments',
  'queue', 'search', 'openSearch', 'saveq', 'dosave', 'goto', 'full', 'close', 'escape', 'settings',
  'winMin', 'winMax', 'winClose',
] as const;

export type Action = (typeof ACTIONS)[number];

export const isAction = (name: string | undefined): name is Action => (ACTIONS as readonly string[]).includes(name ?? '');

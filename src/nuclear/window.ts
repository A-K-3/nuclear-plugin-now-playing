// Window controls for when the screen covers Nuclear's custom title bar.
// Plugins cannot import @tauri-apps/api, so this calls the same window commands Nuclear's own
// title bar uses (start_dragging, minimize, toggle_maximize, close), which its capabilities allow.
import { tauri } from './tauri';

const label = tauri?.metadata?.currentWindow?.label ?? 'main';

const call = (command: string) => Promise.resolve(tauri?.invoke(`plugin:window|${command}`, { label })).catch(() => {});

export const appWindow = {
  available: !!tauri,
  startDragging: () => call('start_dragging'),
  minimize: () => call('minimize'),
  toggleMaximize: () => call('toggle_maximize'),
  close: () => call('close'),
};

// Same behaviour as Nuclear's title bar: drag to move, double-click to maximize/restore
export function onDragRegionMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button, input') || e.buttons !== 1) return;
  if (e.detail === 2) appWindow.toggleMaximize();
  else appWindow.startDragging();
}

// Tauri's internal bridge in Nuclear's window. Plugins cannot import @tauri-apps/api, but its functions
// all go through this object (read on every call), so the plugin can call the same commands.
export type Invoke = (command: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>;

type TauriInternals = {
  invoke: Invoke;
  metadata?: { currentWindow?: { label?: string } };
};

// undefined outside Nuclear (a plain browser, the tests)
export const tauri = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

// HTTP through Nuclear (api.Http.fetch goes through the host, so no CORS limits). It has no timeout
// of its own: one is added here.
import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36';

// Timeout for a promise; onTimeout returns a fallback value or throws. Clears its timer.
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer = 0;
  const expiry = new Promise<T>((resolve, reject) => {
    timer = window.setTimeout(() => { try { resolve(onTimeout()); } catch (e) { reject(e); } }, ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

export async function httpText(api: NuclearPluginAPI, url: string, timeoutMs = 12000): Promise<string> {
  const res = await withTimeout(api.Http.fetch(url, { headers: { 'User-Agent': UA_BROWSER } }), timeoutMs, () => {
    throw new Error(`Timed out: ${url}`);
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

export const httpJson = async <T = unknown>(api: NuclearPluginAPI, url: string, timeoutMs?: number): Promise<T> =>
  JSON.parse(await httpText(api, url, timeoutMs)) as T;

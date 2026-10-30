// Smoke test: loads the built plugin into a page with a fake Nuclear API and checks the screen opens,
// renders, responds to buttons and keys, and leaves nothing behind when the plugin is disabled.
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { installFakeHost } from './fake-host';

// Built by `npm run build` (npm test runs it first)
const bundle = readFileSync('dist/plugin.js', 'utf8');

type Host = {
  api: unknown; calls: string[]; subscriptions(): number;
  load(code: string): { onLoad(api: unknown): Promise<void>; onEnable(api: unknown): Promise<void>; onDisable(api: unknown): Promise<void> };
  plugin?: ReturnType<Host['load']>;
};
declare const fakeHost: Host;

// `before` runs in the page before the plugin loads (e.g. to stand in for Tauri)
async function start(page: Page, before?: () => void) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setContent('<!doctype html><html><body></body></html>');
  if (before) await page.evaluate(before);
  await page.evaluate(installFakeHost);
  await page.evaluate(async (code) => {
    fakeHost.plugin = fakeHost.load(code);
    await fakeHost.plugin.onLoad(fakeHost.api);
    await fakeHost.plugin.onEnable(fakeHost.api);
  }, bundle);
  return errors;
}

test('opens with F9 and shows the current track and the queue', async ({ page }) => {
  const errors = await start(page);
  const root = page.locator('#npx-root');
  await expect(root).toBeHidden();
  await page.keyboard.press('F9');
  await expect(root).toBeVisible();
  await expect(page.locator('#npx-root .title')).toHaveText('Song 1');
  await expect(page.locator('#npx-root .artist')).toHaveText('Artist 1');
  await expect(page.locator('#npx-root .list li')).toHaveCount(5);
  await expect(page.locator('#npx-root .count')).toContainText('2 / 5');
  expect(errors).toEqual([]);
});

test('buttons and keyboard shortcuts reach Nuclear', async ({ page }) => {
  const errors = await start(page);
  await page.keyboard.press('F9');
  await page.locator('#npx-root [data-act="next"]').click();
  await page.keyboard.press(' ');
  await page.locator('#npx-root .list li').nth(3).click();
  const calls = await page.evaluate(() => fakeHost.calls);
  expect(calls).toEqual(expect.arrayContaining(['Queue.goToNext', 'Playback.toggle', 'Queue.goToIndex']));
  // Shortcuts follow the character typed, so they work on any keyboard layout
  await page.keyboard.press('q');
  await expect(page.locator('#npx-root')).toHaveClass(/qcollapsed/);
  // Ctrl+key is left to the system
  await page.keyboard.press('Control+q');
  await expect(page.locator('#npx-root')).toHaveClass(/qcollapsed/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#npx-root')).toBeHidden();
  expect(errors).toEqual([]);
});

test('settings apply live', async ({ page }) => {
  await start(page);
  await page.keyboard.press('F9');
  const canvas = page.locator('#npx-root .viz');
  await expect(canvas).toBeVisible();
  await page.evaluate(() => (fakeHost.api as { Settings: { set(id: string, v: unknown): Promise<void> } }).Settings.set('visualizer', 'off'));
  await expect(canvas).toBeHidden();
});

test('opening twice quickly keeps a single set of subscriptions', async ({ page }) => {
  await start(page);
  const base = await page.evaluate(() => fakeHost.subscriptions());
  await page.keyboard.press('F9');
  await expect(page.locator('#npx-root')).toBeVisible();
  const open = await page.evaluate(() => fakeHost.subscriptions());
  // Close, then open and close again in the same instant: the second opening is still waiting for
  // Nuclear when it is closed, and must not subscribe once that wait ends
  await page.evaluate(() => {
    const f9 = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }));
    f9(); f9(); f9();
  });
  await expect(page.locator('#npx-root')).toBeHidden();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => fakeHost.subscriptions())).toBe(base);
  await page.keyboard.press('F9');
  await expect(page.locator('#npx-root')).toBeVisible();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => fakeHost.subscriptions())).toBe(open);
});

test('disabling removes everything', async ({ page }) => {
  const errors = await start(page);
  await page.keyboard.press('F9');
  await page.evaluate(() => fakeHost.plugin!.onDisable(fakeHost.api));
  await expect(page.locator('#npx-root')).toHaveCount(0);
  expect(await page.evaluate(() => fakeHost.subscriptions())).toBe(0);
  expect(await page.evaluate(() => document.head.querySelectorAll('style').length)).toBe(0);
  // F9 does nothing once disabled
  await page.keyboard.press('F9');
  await expect(page.locator('#npx-root')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("batches Nuclear's queue saves and leaves other Tauri calls alone", async ({ page }) => {
  type Bridge = { invoke(c: string, a?: Record<string, unknown>): Promise<unknown> };
  // A Tauri bridge that records what reaches it; it must exist before the plugin loads
  const errors = await start(page, () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const internals = { invoke: async (command: string, args?: Record<string, unknown>) => { calls.push({ command, args }); return null; } };
    Object.assign(window, { __TAURI_INTERNALS__: internals, tauriCalls: calls, tauriInvoke: internals.invoke });
  });
  // What Nuclear's queue store does after every change, several times in a row
  await page.evaluate(async () => {
    const bridge = (window as unknown as { __TAURI_INTERNALS__: Bridge }).__TAURI_INTERNALS__;
    for (let i = 1; i <= 6; i++) {
      await bridge.invoke('plugin:store|set', { rid: 7, key: 'queue.items', value: [i] });
      await bridge.invoke('plugin:store|set', { rid: 7, key: 'queue.currentIndex', value: i });
      await bridge.invoke('plugin:store|save', { rid: 7 });
    }
    await bridge.invoke('plugin:store|set', { rid: 3, key: 'theme', value: 'dark' }); // another store
  });
  const recorded = () => page.evaluate(() => (window as unknown as { tauriCalls: Array<{ command: string; args?: Record<string, unknown> }> }).tauriCalls
    .filter((c) => c.command.startsWith('plugin:store')));
  // Only the other store's write went through straight away
  expect(await recorded()).toEqual([{ command: 'plugin:store|set', args: { rid: 3, key: 'theme', value: 'dark' } }]);
  // Once things settle: one write of the latest values, then one save
  await expect.poll(recorded, { timeout: 4000 }).toHaveLength(4);
  expect((await recorded()).slice(1)).toEqual([
    { command: 'plugin:store|set', args: { rid: 7, key: 'queue.items', value: [6] } },
    { command: 'plugin:store|set', args: { rid: 7, key: 'queue.currentIndex', value: 6 } },
    { command: 'plugin:store|save', args: { rid: 7 } },
  ]);
  // Disabling puts Tauri's own function back
  await page.evaluate(() => fakeHost.plugin!.onDisable(fakeHost.api));
  expect(await page.evaluate(() => {
    const w = window as unknown as { __TAURI_INTERNALS__: Bridge; tauriInvoke: unknown };
    return w.__TAURI_INTERNALS__.invoke === w.tauriInvoke;
  })).toBe(true);
  expect(errors).toEqual([]);
});

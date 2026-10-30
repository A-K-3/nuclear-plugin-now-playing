import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test',
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    // PW_CHANNEL=chrome (or msedge) runs the tests in an installed browser instead of Playwright's Chromium
    channel: process.env.PW_CHANNEL || undefined,
  },
});

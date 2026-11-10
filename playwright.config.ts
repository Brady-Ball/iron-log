import { defineConfig, devices } from '@playwright/test';

// Chrome made to act like an iPhone on the laptop, where Windows blocks Playwright's
// WebKit. GitHub runs the same checks in WebKit, Safari's engine (see live-check/).
const browserName = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://brady-ball.github.io/iron-log/',
  },
  projects: [
    { name: 'small iPhone', use: { ...devices['iPhone SE'], browserName } },
    { name: 'large iPhone', use: { ...devices['iPhone 15 Pro Max'], browserName } },
  ],
});

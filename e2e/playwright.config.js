// Omnivest quality gate — page health + user journeys on the browsers customers use.
// Run locally:  cd e2e && npx playwright test            (expects backend :8000 + frontend :3000 running)
// Against prod: BASE_URL=https://omnivest.in npx playwright test --project=iphone pages
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',   // stop infinite float/count animations so visual snapshots are stable
    actionTimeout: 15_000,     // a stuck click/fill fails with its own name instead of the whole test timing out
  },
  projects: [
    // iPhone in Apple's WebKit engine — the browser Tushar and most Indian retail users are on
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    // Android phone in Chromium
    { name: 'android', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    // Desktop
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});

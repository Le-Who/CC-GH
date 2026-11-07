import { defineConfig } from '@playwright/test';

// Start the repository's API and home-preview servers before this focused run.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['garden-terrarium.spec.js', 'garden-plant-anchors.spec.js'],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 90000,
  reporter: [['line'], ['json', { outputFile: 'output/playwright/terrarium-results.json' }]],
  outputDir: './output/playwright/terrarium-final',
  use: {
    browserName: 'chromium',
    baseURL: process.env.TERRARIUM_PREVIEW_URL || 'http://127.0.0.1:3321',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10000,
  },
});

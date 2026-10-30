import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',testMatch:'update-lifecycle.spec.js',workers:1,retries:0,timeout:45000,reporter:'list',outputDir:'artifacts/updates/browser',use:{browserName:'chromium',serviceWorkers:'allow',screenshot:'only-on-failure',trace:'off'}});

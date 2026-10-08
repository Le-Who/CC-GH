import {defineConfig} from '@playwright/test';
// The prior real-backend stage built this exact commit. Each test owns its
// synthetic HTTP fixture; no deployment or persistent server is started here.
export default defineConfig({testDir:'./tests/e2e',workers:1,fullyParallel:false,retries:0,forbidOnly:true,
 timeout:90000,globalTimeout:360000,reporter:[['line'],['json',{outputFile:'test-results/game-feedback/results.json'}]],
 outputDir:'test-results/game-feedback/work',
 use:{browserName:'chromium',serviceWorkers:'block',trace:'off',video:'off',screenshot:'only-on-failure'}});

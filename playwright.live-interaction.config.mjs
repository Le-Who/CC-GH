import {defineConfig} from '@playwright/test';
const phase=process.env.LIVE_INTERACTION_PHASE||'local';
if(!/^[a-z-]+$/.test(phase))throw Error('Invalid evidence phase');
export default defineConfig({testDir:'./tests/e2e',workers:1,fullyParallel:false,retries:0,forbidOnly:true,
 timeout:120000,globalTimeout:900000,reporter:[['line'],['json',{outputFile:`test-results/live-interaction/${phase}/results.json`}]],
 outputDir:`test-results/live-interaction/${phase}/work`,
 use:{browserName:'chromium',serviceWorkers:'block',trace:'off',video:'off',screenshot:'only-on-failure'}});

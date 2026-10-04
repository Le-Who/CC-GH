import {defineConfig} from '@playwright/test';
import {assertYardPlayerApiEnvironment,YARD_API_PORTS} from './tests/helpers/yard-player-api-guard.mjs';
assertYardPlayerApiEnvironment();
export default defineConfig({
  testDir:'./tests/yard-player-integration-e2e',testMatch:'*.spec.js',
  fullyParallel:false,workers:1,retries:0,forbidOnly:true,timeout:60000,globalTimeout:12*60*1000,
  outputDir:'test-results/yard-player-integration',reporter:[['list'],['json',{outputFile:'test-results/yard-player-integration-results.json'}]],
  use:{baseURL:`http://127.0.0.1:${YARD_API_PORTS.active}`,serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{browserName:'chromium'}}],
  webServer:{command:'node tests/helpers/yard-player-api-servers.mjs',url:`http://127.0.0.1:${YARD_API_PORTS.activePeer}/api/health`,reuseExistingServer:false,timeout:120000},
});

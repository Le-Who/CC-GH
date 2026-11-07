import {defineConfig} from '@playwright/test';
const port=3337;
export default defineConfig({testDir:'.',testMatch:['**/tests/leaderboard-privacy-e2e/*.spec.mjs','**/tests/home-theme-e2e/*.spec.mjs','**/qa/garden-tap-layout/*.spec.mjs','**/tests/development-batch-e2e/*.spec.mjs'],workers:1,retries:0,forbidOnly:true,timeout:60000,globalTimeout:780000,
 reporter:[['line'],['json',{outputFile:'test-results/development-batch/browser-results.json'}]],outputDir:'test-results/development-batch/browser-work',
 use:{baseURL:`http://127.0.0.1:${port}`,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure',video:'off',actionTimeout:10000},
 webServer:{command:'node scripts/playwright-web-server.mjs',url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:240000,
  env:{NODE_ENV:'test',PORT:String(port),DEV_AUTH_ENABLED:'true',DATABASE_URL:'',REDIS_URL:'',VITE_YARD_PIP_PREVIEW:'true',VITE_YARD_SAVED_VISITS:'false',VITE_YARD_PAINTED_FOOD_TRIAL:'false'}}});

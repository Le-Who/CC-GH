import {defineConfig} from '@playwright/test';
import path from 'node:path';
import {requireDisposableBackend} from './scripts/yard-real-backend-contract.mjs';
const baseURL=requireDisposableBackend(process.env);
export default defineConfig({testDir:'./tests/yard-saved-visit-real-e2e',workers:1,fullyParallel:false,retries:0,forbidOnly:true,
 timeout:150000,globalTimeout:660000,reporter:[['line'],['json',{outputFile:'test-results/saved-visit-real/results.json'}]],
 outputDir:'test-results/saved-visit-real/work',
 use:{baseURL,serviceWorkers:'block',trace:'off',video:'off',actionTimeout:15000,navigationTimeout:25000},
 webServer:{command:'node scripts/playwright-web-server.mjs',url:baseURL,reuseExistingServer:false,timeout:240000,
  env:{NODE_ENV:'test',PORT:'3199',DEV_AUTH_ENABLED:'true',YARD_SAVED_VISIT_PG:'1',
   DATABASE_URL:'postgres://ccgh_visit_test@127.0.0.1:55437/ccgh_visit_test',REDIS_URL:'',
   NODE_OPTIONS:`--import=${path.resolve('tests/fixtures/register-real-backend-runtime.mjs')}`,
   VITE_YARD_PIP_PREVIEW:'true',VITE_YARD_SAVED_VISITS:'true',
   VITE_YARD_PAINTED_FOOD_TRIAL:process.env.VITE_YARD_PAINTED_FOOD_TRIAL||'false'}}});

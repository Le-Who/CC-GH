import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/catalogue-access-e2e',testMatch:'catalogue-access.spec.js',workers:1,retries:0,
  timeout:120000,reporter:[['list'],['json',{outputFile:'artifacts/access-debug/browser-results.json'}]],
  outputDir:'artifacts/access-debug/browser',
  use:{baseURL:process.env.CATALOGUE_PREVIEW_URL||'http://127.0.0.1:3329',trace:'off',video:'off',screenshot:'only-on-failure'},
});

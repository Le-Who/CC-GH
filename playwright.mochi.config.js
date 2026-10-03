import {defineConfig} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_MOCHI_PORT||3197);
export default defineConfig({testDir:'./tests/yard-mochi-e2e',testMatch:'combined.spec.js',outputDir:'test-results-mochi/artifacts',fullyParallel:false,workers:1,forbidOnly:!!process.env.CI,retries:0,
 reporter:[['list'],['json',{outputFile:'test-results-mochi/results.json'}],['html',{outputFolder:'playwright-report-mochi',open:'never'}]],use:{baseURL:`http://127.0.0.1:${port}`,trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium'}}],webServer:{command:'node scripts/yard-mochi-ci-server.mjs',url:`http://127.0.0.1:${port}/__mochi_qa__/index.html`,reuseExistingServer:false,timeout:30000,env:{PLAYWRIGHT_MOCHI_PORT:String(port)}}});

import {defineConfig} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_YARD_EIGHT_PORT||3204);
export default defineConfig({testDir:'./tests/yard-eight-canonical-e2e',testMatch:'*.spec.js',outputDir:'test-results-yard-eight/artifacts',fullyParallel:false,workers:1,retries:0,forbidOnly:!!process.env.CI,
 reporter:[['list'],['json',{outputFile:'test-results-yard-eight/results.json'}]],use:{baseURL:`http://127.0.0.1:${port}`,trace:'retain-on-failure'},projects:[{name:'chromium',use:{browserName:'chromium'}}],
 webServer:{command:'node scripts/yard-eight-canonical-fixture.mjs && node scripts/yard-eight-canonical-ci-server.mjs',url:`http://127.0.0.1:${port}/__yard_qa__/index.html`,reuseExistingServer:false,timeout:180000,env:{PLAYWRIGHT_YARD_EIGHT_PORT:String(port)}}});

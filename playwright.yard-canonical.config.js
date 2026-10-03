import {defineConfig} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_YARD_CANONICAL_PORT||3198);
export default defineConfig({testDir:'./tests/yard-canonical-e2e',testMatch:'*.spec.js',outputDir:'test-results-yard-canonical/artifacts',fullyParallel:false,workers:1,retries:0,forbidOnly:!!process.env.CI,
 reporter:[['list'],['json',{outputFile:'test-results-yard-canonical/results.json'}],['html',{outputFolder:'playwright-report-yard-canonical',open:'never'}]],
 use:{baseURL:`http://127.0.0.1:${port}`,trace:'retain-on-failure'},projects:[{name:'chromium',use:{browserName:'chromium'}}],
 webServer:{command:'node scripts/yard-canonical-ci-server.mjs',url:`http://127.0.0.1:${port}/__yard_qa__/index.html`,reuseExistingServer:false,timeout:30000,env:{PLAYWRIGHT_YARD_CANONICAL_PORT:String(port)}}});

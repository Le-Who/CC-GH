import {defineConfig} from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_PIP_PORT||3199);
export default defineConfig({testDir:'./tests/yard-pip-e2e',testMatch:'visit.spec.js',outputDir:'test-results-pip/artifacts',fullyParallel:false,workers:1,forbidOnly:!!process.env.CI,retries:0,
 reporter:[['list'],['json',{outputFile:'test-results-pip/results.json'}],['html',{outputFolder:'playwright-report-pip',open:'never'}]],use:{baseURL:`http://127.0.0.1:${port}`,trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium'}}],webServer:{command:'node scripts/yard-pip-ci-server.mjs',url:`http://127.0.0.1:${port}/__pip_qa__/index.html`,reuseExistingServer:false,timeout:30000,env:{PLAYWRIGHT_PIP_PORT:String(port)}}});

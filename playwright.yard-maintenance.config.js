import {defineConfig} from '@playwright/test';
import {loadMaintenanceInputs} from './tests/helpers/yard-maintenance-guard.mjs';
const inputs=loadMaintenanceInputs();
if(!/^[a-f0-9-]{36}$/.test(process.env.YARD_PRODUCTION_RUN_ID||''))throw Error('Parent-owned maintenance run required');
export default defineConfig({
 metadata:{runId:process.env.YARD_PRODUCTION_RUN_ID,activeCommit:inputs.activeCommit,activeDigest:inputs.activeDigest,predecessorCommit:inputs.closedCommit,predecessorDigest:inputs.closedDigest,requestSha256:inputs.requestSha256},
 testDir:'./tests/yard-maintenance-e2e',testMatch:'maintenance.spec.js',fullyParallel:false,
 workers:1,retries:0,forbidOnly:true,timeout:180000,globalTimeout:12*60*1000,
 outputDir:'test-results/yard-maintenance/browser',reporter:[['list'],['json',{outputFile:'test-results/yard-maintenance/results.json'}]],
 use:{baseURL:'http://127.0.0.1:3233',serviceWorkers:'allow',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium'}}],
});

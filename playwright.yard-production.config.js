import {defineConfig} from '@playwright/test';
import {assertProductionAcceptance,PRODUCTION_PORTS} from './tests/helpers/yard-production-guard.mjs';
const inputs=assertProductionAcceptance();
if(!/^[a-f0-9-]{36}$/.test(process.env.YARD_PRODUCTION_RUN_ID||''))throw Error('Parent-owned acceptance run ID required');
export default defineConfig({
 metadata:{runId:process.env.YARD_PRODUCTION_RUN_ID,activeCommit:inputs.activeCommit,closedCommit:inputs.closedCommit,closedDigest:inputs.closedDigest},
 testDir:'./tests/yard-production-e2e',testMatch:'production.spec.js',fullyParallel:false,
 workers:1,retries:0,forbidOnly:true,timeout:180000,globalTimeout:12*60*1000,
 outputDir:'test-results/yard-production/browser',
 reporter:[['list'],['json',{outputFile:'test-results/yard-production/results.json'}]],
 use:{baseURL:`http://127.0.0.1:${PRODUCTION_PORTS.origin}`,serviceWorkers:'allow',
  viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
  trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium'}}],
});

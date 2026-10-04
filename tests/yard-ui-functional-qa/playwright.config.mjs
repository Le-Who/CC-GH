import {defineConfig} from '@playwright/test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {assertUiFunctionalQa,origin,UI_QA_SCOPE} from '../../scripts/yard-ui-functional-qa.mjs';
const {commit}=assertUiFunctionalQa(),runId=process.env.YARD_UI_QA_RUN_ID,imageId=process.env.YARD_UI_QA_IMAGE_ID;
assert.match(runId||'',/^[a-f0-9-]{36}$/);assert.match(imageId||'',/^sha256:[a-f0-9]{64}$/);
const out=resolve('test-results/yard-ui-functional');assert.equal(process.env.YARD_UI_QA_EVIDENCE,out);
export default defineConfig({
 metadata:{scope:UI_QA_SCOPE,commit,runId,imageId},testDir:'.',testMatch:'ui.spec.mjs',fullyParallel:false,
 workers:1,retries:0,forbidOnly:true,timeout:180000,globalTimeout:12*60*1000,
 outputDir:resolve(out,'browser'),reporter:[['list'],['json',{outputFile:resolve(out,'results.json')}]],
 use:{baseURL:origin,serviceWorkers:'allow',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium-phone',use:{browserName:'chromium'}}],
});

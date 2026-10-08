import {defineConfig} from '@playwright/test';
const phase=process.env.MIKA_QA_PHASE||'local';
if(!/^[a-z-]+$/.test(phase))throw Error('Invalid evidence phase');
export default defineConfig({testDir:'./tests/e2e',workers:1,fullyParallel:false,retries:0,forbidOnly:true,
 timeout:90000,globalTimeout:600000,
 reporter:[['line'],['json',{outputFile:`test-results/mika-normal/${phase}/results.json`}]],
 outputDir:`test-results/mika-normal/${phase}/work`,
 projects:[
  {name:'compact-diagnostic',use:{viewport:{width:320,height:568},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'portrait320',use:{viewport:{width:320,height:568},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'portrait390',use:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}},
  {name:'portrait360',use:{viewport:{width:360,height:800},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'portrait414',use:{viewport:{width:414,height:896},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'landscape568',use:{viewport:{width:568,height:320},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'tablet768',use:{viewport:{width:768,height:1024},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'tablet1024',use:{viewport:{width:1024,height:768},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'desktop1280',use:{viewport:{width:1280,height:720},deviceScaleFactor:1,isMobile:false,hasTouch:false}},
  {name:'rotating393',use:{viewport:{width:393,height:873},deviceScaleFactor:1,isMobile:true,hasTouch:true}},
  {name:'landscape844',use:{viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true}}
 ],
 use:{browserName:'chromium',serviceWorkers:'block',trace:'off',video:'on',screenshot:'only-on-failure'}});

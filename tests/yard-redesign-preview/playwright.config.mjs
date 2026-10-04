import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'.',testMatch:'ui.spec.mjs',fullyParallel:false,workers:1,retries:0,
  forbidOnly:!!process.env.CI,timeout:60000,
  outputDir:'../../test-results-yard-redesign-preview',
  reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:4196',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'320x568',use:{browserName:'chromium',viewport:{width:320,height:568},isMobile:true,hasTouch:true}},
    {name:'390x844-dpr2',use:{browserName:'chromium',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}},
    {name:'844x390-landscape',use:{browserName:'chromium',viewport:{width:844,height:390},isMobile:true,hasTouch:true}},
  ],
  webServer:{command:'pnpm exec vite --config tests/yard-redesign-preview/vite.config.mjs',url:'http://127.0.0.1:4196',reuseExistingServer:false,timeout:60000,cwd:process.cwd()},
});

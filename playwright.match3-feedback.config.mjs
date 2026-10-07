import {defineConfig} from '@playwright/test';
const slice=process.env.MATCH3_QA_SLICE||'matrix';
export default defineConfig({testDir:'./tests/e2e',testMatch:'match3-motion.spec.js',workers:1,fullyParallel:false,retries:0,forbidOnly:true,
 timeout:60000,globalTimeout:600000,reporter:[['line'],['json',{outputFile:`test-results/match3-feedback/${slice}/results.json`}]],
 outputDir:`test-results/match3-feedback/${slice}/work`,
 use:{baseURL:'http://127.0.0.1:3198',serviceWorkers:'block',trace:'retain-on-failure',video:'on',screenshot:'only-on-failure'},
 webServer:{command:'node server.js',url:'http://127.0.0.1:3198',reuseExistingServer:false,timeout:30000,env:{NODE_ENV:'test',PORT:'3198',DEV_AUTH_ENABLED:'true',DATABASE_URL:'',REDIS_URL:''}}});

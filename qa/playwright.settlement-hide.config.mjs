import {defineConfig} from '@playwright/test';
const proof=process.env.PROOF_DIRECTORY;
if(!proof||!process.env.CANDIDATE_COMMIT||!process.env.REQUEST_SHA256)throw Error('Pinned source QA invocation required');
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'settlement-hidden.spec.js',fullyParallel:false,forbidOnly:true,retries:0,workers:1,timeout:60000,globalTimeout:4*60*1000,
 metadata:{candidateCommit:process.env.CANDIDATE_COMMIT,candidateTree:process.env.CANDIDATE_TREE,requestSha256:process.env.REQUEST_SHA256},
 reporter:[['list'],['json',{outputFile:proof+'/home-results.json'}]],outputDir:proof+'/browser-artifacts',
 use:{baseURL:'http://127.0.0.1:3287',trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'chromium',use:{browserName:'chromium'}}],
 webServer:{command:'node server.js',url:'http://127.0.0.1:3287',reuseExistingServer:false,timeout:60000,env:{NODE_ENV:'test',PORT:'3287',DEV_AUTH_ENABLED:'true',DATABASE_URL:'',REDIS_URL:''}},
});

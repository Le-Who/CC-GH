import {defineConfig} from '@playwright/test';
import {assertEightCandidateApi,CANDIDATE_PORT} from './tests/helpers/yard-eight-player-candidate.mjs';
import {assertEightPlayerGroup} from './tests/helpers/yard-eight-player-groups.mjs';
assertEightCandidateApi();
const group=assertEightPlayerGroup();
export default defineConfig({
 testDir:'./tests/yard-eight-player-e2e',testMatch:'*.spec.js',fullyParallel:false,workers:1,retries:0,forbidOnly:true,
 timeout:90000,globalTimeout:14*60*1000,outputDir:`test-results/yard-eight-player-${group}`,
 reporter:[['list'],['json',{outputFile:`test-results/yard-eight-player-${group}-results.json`}]],
 use:{baseURL:`http://127.0.0.1:${CANDIDATE_PORT}`,serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{browserName:'chromium'}}],
 webServer:{command:'node --import ./tests/helpers/yard-eight-player-loader.mjs tests/helpers/yard-eight-player-server.mjs',url:`http://127.0.0.1:${CANDIDATE_PORT}/api/health`,reuseExistingServer:false,timeout:120000},
});

import path from 'node:path';
import {defineConfig} from '@playwright/test';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
assertCanonicalPgEnvironment();
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.GITHUB_REF!=='refs/heads/qa/yard-placement-redraw-20261006')throw Error('Only the authorized first finite GitHub run may launch this browser');
export default defineConfig({
 testDir:'..',testMatch:['**/yard-canonical-acceptance/hud.spec.mjs','**/yard-placement-redraw/transitions.spec.mjs'],fullyParallel:false,workers:1,retries:0,maxFailures:0,forbidOnly:true,
 timeout:200000,globalTimeout:220000,expect:{timeout:12000},
 outputDir:path.join(import.meta.dirname,'../yard-canonical-acceptance/work/browser'),reporter:[['line']],
 use:{baseURL:'http://127.0.0.1:3216',serviceWorkers:'block',trace:'off',screenshot:'off',video:'off'},
 projects:[{name:'chromium',use:{browserName:'chromium'}}],
 webServer:{cwd:path.resolve(import.meta.dirname,'../..'),command:'node tests/helpers/yard-canonical-api-server.mjs',url:'http://127.0.0.1:3216/api/health',reuseExistingServer:false,timeout:20000,env:{YARD_CANONICAL_API_TEST:'1',YARD_PLAYER_API_TEST:'1',DEV_AUTH_ENABLED:'true'}},
});

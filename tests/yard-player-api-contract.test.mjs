import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assertYardPlayerApiEnvironment,assertYardPlayerFixture,YARD_API_PORTS} from './helpers/yard-player-api-guard.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const allowed={YARD_PLAYER_API_TEST:'1',YARD_V2_PG_TEST:'1',YARD_V2_PG_TARGET:'integrated',CI:'true',NODE_ENV:'test',DEV_AUTH_ENABLED:'true',DATABASE_URL:'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci',REDIS_URL:'',NODE_OPTIONS:'',YARD_CANDIDATE_CI:'',YARD_PLAYER_WIRING_TEST:''};
test('real API test refuses unsafe databases, missing opt-ins and inherited loaders',()=>{
 assert.doesNotThrow(()=>assertYardPlayerApiEnvironment(allowed));
 for(const [key,value]of Object.entries({YARD_PLAYER_API_TEST:'',YARD_V2_PG_TEST:'',YARD_V2_PG_TARGET:'candidate',CI:'false',NODE_ENV:'production',DEV_AUTH_ENABLED:'false',DATABASE_URL:'postgres://ccgh_merge_ci:ccgh_merge_ci@example.com:5432/ccgh_merge_ci',REDIS_URL:'redis://localhost',NODE_OPTIONS:'--import anything',YARD_CANDIDATE_CI:'1',YARD_PLAYER_WIRING_TEST:'1'}))assert.throws(()=>assertYardPlayerApiEnvironment({...allowed,[key]:value}),key);
 for(const url of ['postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/production','postgres://other:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci','postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci?ssl=true'])assert.throws(()=>assertYardPlayerApiEnvironment({...allowed,DATABASE_URL:url}));
 assert.deepEqual(Object.values(YARD_API_PORTS),[3215,3216,3217]);
});
test('only exact fixture UUID identities and canonical accounts can be read or deleted',()=>{
 const id='yard_player_api_12345678-1234-4123-8123-123456789abc',account='acct:12345678-1234-4123-8123-123456789abc';
 assert.equal(assertYardPlayerFixture(id,account),id);
 for(const value of ['',undefined,'ordinary-user','yard_player_api_%',id+'suffix'])assert.throws(()=>assertYardPlayerFixture(value));
 for(const value of ['acct:someone','test:'+account,'',account+'suffix'])assert.throws(()=>assertYardPlayerFixture(id,value));
});
test('server bootstrap fails before unavailable database dependencies when authorization is absent',()=>{
 for(const script of ['tests/helpers/yard-player-api-server.mjs','tests/helpers/yard-player-api-servers.mjs']){
  const r=spawnSync(process.execPath,[script,'closed'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATABASE_URL:'',NODE_OPTIONS:'',YARD_PLAYER_API_TEST:'',YARD_V2_PG_TEST:'',YARD_PLAYER_WIRING_TEST:''},encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Yard v2 PG gate requires explicit opt-in/);assert.doesNotMatch(r.stderr,/ERR_MODULE_NOT_FOUND/);
 }
});
test('new lane keeps production app, policies, authentication, database and client genuine',()=>{
 const server=read('tests/helpers/yard-player-api-server.mjs'),coordinator=read('tests/helpers/yard-player-api-servers.mjs'),spec=read('tests/yard-player-integration-e2e/player.spec.js'),config=read('playwright.yard-player-integration.config.js');
 assert.match(server,/import\('\.\.\/\.\.\/server\.js'\)/);assert.match(server,/initSocket\(server\)/);assert.match(server,/listen\(YARD_API_PORTS\[mode\],'127\.0\.0\.1'/);assert.match(server,/server_version_num/);assert.match(server,/accepted!==false/);
 assert.match(coordinator,/--import/);assert.match(coordinator,/yard-player-rollout-test-loader\.mjs/);assert.doesNotMatch(coordinator,/writeFile|registerHooks|source\.replace|NODE_OPTIONS:/);
 assert.doesNotMatch(spec,/route\.fulfill|setState\(|registerHooks|createEightAcceptanceOptions|page\.clock|fastForward/);
 assert.match(spec,/getImageData/);assert.match(spec,/The courtyard could not load/);assert.match(spec,/route\.fetch\(\)/);assert.match(spec,/route\.abort\('failed'\)/);assert.match(spec,/account_identities WHERE provider='dev'/);
 assert.match(config,/workers:1/);assert.match(config,/retries:0/);assert.match(config,/globalTimeout:12\*60\*1000/);assert.match(config,/reuseExistingServer:false/);
 assert.match(read('game-logic/yard-v2/release-policy.mjs'),/enabled: false/);
});
test('independent required CI job builds the unchanged app and retains guarded PostgreSQL evidence',()=>{
 const ci=read('.github/workflows/ci.yml'),job=ci.slice(ci.indexOf('  yard-player:'),ci.indexOf('  yard-eight-player:'));
 assert.match(job,/image: postgres:15/);assert.match(job,/pnpm run build/);assert.match(job,/pnpm install --frozen-lockfile/);assert.match(job,/timeout-minutes: 30/);
 assert.doesNotMatch(job,/needs:|continue-on-error|download-artifact/);
 assert.match(ci,/needs: \[test, browser, touch, mochi, yard-eight-player, yard-player\]/);
 const start=job.indexOf('      - name: Genuine Yard API, store, browser and PostgreSQL15 integration'),end=job.length,block=job.slice(start,end);
 assert.ok(start>0&&end>start);assert.match(block,/timeout-minutes: 15/);assert.match(block,/YARD_PLAYER_API_TEST: '1'/);assert.match(block,/YARD_PLAYER_WIRING_TEST: ''/);assert.match(block,/playwright\.yard-player-integration\.config\.js/);assert.match(block,/if: always\(\)/);assert.match(block,/upload-browser-evidence/);assert.doesNotMatch(block,/continue-on-error/);
});

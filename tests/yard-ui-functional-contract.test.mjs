import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assertUiFunctionalQa,assertUiFunctionalReport,UI_QA_SCOPE,UI_QA_CASES,origin,databaseURL,fixtureBotToken} from '../scripts/yard-ui-functional-qa.mjs';
import {verifyImageIdentity} from './helpers/yard-production-guard.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const commit='c'.repeat(40),imageId='sha256:'+'d'.repeat(64),runId='00000000-0000-4000-8000-000000000001';
const env={CI:'true',YARD_UI_FUNCTIONAL_QA:'1',YARD_UI_QA_COMMIT:commit},identity={commit,runId,imageId};
const report=()=>({config:{metadata:{scope:UI_QA_SCOPE,...identity}},stats:{expected:5,unexpected:0,flaky:0,skipped:0},errors:[],suites:[{specs:UI_QA_CASES.map(title=>({title,ok:true,tests:[{expectedStatus:'passed',status:'expected',results:[{status:'passed'}]}]}))}]});
test('diagnostic opt-in is independent of release identities and requires exact C source',()=>{
 assert.deepEqual(assertUiFunctionalQa(env),{commit});assert.deepEqual(assertUiFunctionalQa({...env,DATABASE_URL:databaseURL}),{commit});
 for(const value of ['',null,'latest',commit+'\n','c'.repeat(39),commit.toUpperCase()])assert.throws(()=>assertUiFunctionalQa({...env,YARD_UI_QA_COMMIT:value}));
 for(const key of ['NODE_OPTIONS','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','ADMIN_TOKEN','REDIS_URL','YARD_PRODUCTION_ACCEPTANCE','YARD_ACTIVE_COMMIT','YARD_ACTIVE_DIGEST','YARD_CLOSED_COMMIT','YARD_CLOSED_DIGEST','YARD_CANDIDATE_CI','YARD_PLAYER_WIRING_TEST','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.throws(()=>assertUiFunctionalQa({...env,[key]:'forbidden'}),key);
 for(const changed of [{CI:'false'},{YARD_UI_FUNCTIONAL_QA:'0'},{DATABASE_URL:'postgres://foreign/real'}])assert.throws(()=>assertUiFunctionalQa({...env,...changed}));
 assert.equal(origin,'http://127.0.0.1:3233');assert.match(databaseURL,/127\.0\.0\.1:35432\/ccgh_yard_production_ci$/);assert.match(fixtureBotToken,/not-a-real-bot/);
});
test('missing diagnostic opt-in stops the real CLI before Git or Docker',()=>{
 const result=spawnSync(process.execPath,['scripts/yard-ui-functional-qa.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,CI:'true',NODE_OPTIONS:'',YARD_UI_FUNCTIONAL_QA:''},encoding:'utf8',timeout:5000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit UI functional diagnostic opt-in required/);assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND|spawn.*docker|Checkout must match/);
});
test('diagnostic image identity retains ordinary node server, source/build and production checks',()=>{
 const image=()=>({Id:imageId,Config:{Cmd:['node','server.js'],Labels:{'org.opencontainers.image.revision':commit},Env:['NODE_ENV=production',`APP_BUILD_ID=${commit}`]}});
 assert.equal(verifyImageIdentity(image(),{commit}),imageId);
 for(const mutate of [x=>x.Config.Cmd=['node','fake-server.mjs'],x=>x.Config.Labels['org.opencontainers.image.revision']='b'.repeat(40),x=>x.Config.Env[1]='APP_BUILD_ID=latest',x=>x.Config.Env[0]='NODE_ENV=test',x=>x.Config.Env.push('NODE_OPTIONS=--import hidden')]){const candidate=image();mutate(candidate);assert.throws(()=>verifyImageIdentity(candidate,{commit}));}
});
test('only five exact successful cases from this diagnostic run satisfy completion',()=>{
 assert.equal(assertUiFunctionalReport(report(),identity),5);
 for(const key of ['commit','runId','imageId','scope']){const value=report();value.config.metadata[key]='other';assert.throws(()=>assertUiFunctionalReport(value,identity),key);}
 for(const mutate of [r=>r.stats.expected=4,r=>r.stats.unexpected=1,r=>r.stats.flaky=1,r=>r.stats.skipped=1,r=>r.errors.push({message:'fixture failed'}),r=>r.suites[0].specs.pop(),r=>r.suites[0].specs.push(r.suites[0].specs[0]),r=>r.suites[0].specs[0].title='different',r=>r.suites[0].specs[0].ok=false,r=>r.suites[0].specs[0].tests=[],r=>r.suites[0].specs[0].tests[0].expectedStatus='failed',r=>r.suites[0].specs[0].tests[0].status='unexpected',r=>r.suites[0].specs[0].tests[0].results.push({status:'passed'}),r=>r.suites[0].specs[0].tests[0].results[0].status='skipped']){const value=report();mutate(value);assert.throws(()=>assertUiFunctionalReport(value,identity));}
});
test('nested Playwright suites preserve exact title and no-retry validation',()=>{
 const value=report();value.suites=[{suites:value.suites}];assert.equal(assertUiFunctionalReport(value,identity),5);
 value.suites[0].suites[0].specs[1].title=UI_QA_CASES[0];assert.throws(()=>assertUiFunctionalReport(value,identity));
});
test('runner owns only C and PostgreSQL, exact image IDs and internal loopback relays',()=>{
 const source=read('scripts/yard-ui-functional-qa.mjs');
 assert.match(source,/image','inspect',`ccgh-yard-ui-qa:\$\{inputs\.commit\}`/);assert.match(source,/verifyImageIdentity\(image,\{commit:inputs\.commit\}\)/);
 assert.match(source,/names=\{B:.*db:/);assert.doesNotMatch(source,/names\.A|closedDigest|verifyPromotionContract|verifyActiveRuntime|assertProductionAcceptance\(/);
 assert.match(source,/\['network','create','--internal',prefix\]/);assert.match(source,/ownedRelayEndpoint\(/);assert.match(source,/startLoopbackTcpRelay\(/);assert.doesNotMatch(source,/'-p',|'--network','host'/);
 assert.match(source,/created\.push\(names\.db\);await docker\(\['run'/);assert.match(source,/created\.push\(names\.B\);await docker\(\['run'/);
 assert.match(source,/'PUBLIC_APP_URL|`PUBLIC_APP_URL=\$\{origin\}`/);assert.match(source,/'--cap-drop','ALL','--security-opt','no-new-privileges'/);
 assert.match(source,/enabled,true/);assert.match(source,/runtime\.buildId,inputs\.commit/);assert.doesNotMatch(source,/verifyActiveRuntime|actorAtlasPages|runtime-media\.json/);
});
test('diagnostic lifecycle, health, database and evidence remain bounded and fail closed',()=>{
 const source=read('scripts/yard-ui-functional-qa.mjs');
 for(const signal of ['SIGINT','SIGTERM'])assert.ok(source.includes(`process.on('${signal}'`));
 assert.match(source,/15\*60\*1000/);assert.match(source,/AbortSignal\.timeout\(5000\)/);assert.match(source,/timeoutMs:13\*60\*1000/);assert.match(source,/closeAcceptance\(\)/);assert.match(source,/docker\(\['rm','-f','-v',name\],10000,true\)/);
 assert.match(source,/default_transaction_read_only=on -c statement_timeout=5000/);assert.ok(source.indexOf('assertFreshProductionDatabase(await docker')<source.indexOf("await runBoundedCommand('pnpm'"));
 assert.match(source,/Tracked C checkout must be clean/);assert.match(source,/Missing committed diagnostic source/);assert.match(source,/sourceHashes\[path\]=createHash\('sha256'\)/);
 assert.match(source,/releaseAcceptance:false,rollbackAcceptance:false,artCalibration:'not-assessed'/);assert.match(source,/cc-gh-yard-ui-functional-diagnostic\/v1/);assert.match(source,/completed&&!process\.exitCode/);
 assert.ok(source.indexOf("'DIAGNOSTIC.json','results.json','lost-reply.json'")<source.indexOf("'image','inspect'"));assert.doesNotMatch(source,/PASS\.json|cc-gh-yard-production-acceptance\/v1|cc-gh-yard-maintenance-acceptance\/v1/);
});
test('one ordinary SW-enabled phone project runs all five tests with zero retries',()=>{
 const source=read('tests/yard-ui-functional-qa/playwright.config.mjs');
 assert.match(source,/workers:1,retries:0,forbidOnly:true/);assert.match(source,/globalTimeout:12\*60\*1000/);assert.match(source,/serviceWorkers:'allow'/);assert.match(source,/width:390,height:844/);assert.match(source,/deviceScaleFactor:2,isMobile:true,hasTouch:true/);
 assert.match(source,/testMatch:'ui\.spec\.mjs'/);assert.match(source,/metadata:\{scope:UI_QA_SCOPE,commit,runId,imageId\}/);assert.doesNotMatch(source,/webServer|vite|storageState|--import|test\.skip/);
 assert.equal((source.match(/name:'chromium-phone'/g)||[]).length,1);
});
test('QA-only push workflow builds exact ordinary C without publication, deployment or historical acceptance',()=>{
 const source=read('.github/workflows/yard-ui-functional-qa.yml');
 assert.match(source,/push:\s+branches: \[qa\/yard-ui-functional-preview\]/);assert.match(source,/ref: \$\{\{ github\.sha \}\}/);assert.match(source,/persist-credentials: false/);
 assert.match(source,/docker build --file Dockerfile/);assert.match(source,/BUILD_ID=\$\{YARD_UI_QA_COMMIT\}/);assert.match(source,/org\.opencontainers\.image\.revision=\$\{YARD_UI_QA_COMMIT\}/);assert.match(source,/ccgh-yard-ui-qa:\$\{YARD_UI_QA_COMMIT\}/);
 assert.match(source,/pnpm install --frozen-lockfile/);assert.match(source,/timeout-minutes: 40/);assert.match(source,/timeout-minutes: 18/);assert.match(source,/if: always\(\)/);assert.match(source,/if-no-files-found: error/);
 assert.doesNotMatch(source,/workflow_dispatch:|pull_request:|inputs\.candidate_commit|packages: write|docker push|docker login|build-push-action|secrets\.|ssh|deploy.yml|workflow_call:|workflow_run:|continue-on-error|yard-active-contract\.mjs|yard-ci-dispatch\.mjs/);
 assert.equal((source.match(/run: node scripts\/yard-ui-functional-qa\.mjs/g)||[]).length,1);
});

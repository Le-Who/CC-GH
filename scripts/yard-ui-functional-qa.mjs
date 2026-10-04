/** C-only UI/API diagnostic. Never creates a release or rollback acceptance receipt. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {runBoundedCommand} from '../tests/helpers/yard-production-process.mjs';
import {setProxyState,startProductionProxy} from '../tests/helpers/yard-production-proxy.mjs';
import {verifyImageIdentity,PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL} from '../tests/helpers/yard-production-guard.mjs';
import {ownedRelayEndpoint,startLoopbackTcpRelay,healthDiagnostic,assertFreshProductionDatabase} from './yard-production-acceptance.mjs';

export const origin=`http://127.0.0.1:${PRODUCTION_PORTS.origin}`,databaseURL=DATABASE_URL,fixtureBotToken=FIXTURE_BOT_TOKEN;
export const UI_QA_SCOPE='ui-functional-diagnostic-only';
export const UI_QA_CASES=Object.freeze(['catalogue-actions','unaffordable-shiny','reserved-placement','lost-response-reload','storage-write-no-send']);
export function assertUiFunctionalQa(env=process.env){
 assert.equal(env.CI,'true','Isolated CI required');assert.equal(env.YARD_UI_FUNCTIONAL_QA,'1','Explicit UI functional diagnostic opt-in required');
 assert.ok(typeof env.YARD_UI_QA_COMMIT==='string'&&env.YARD_UI_QA_COMMIT.length===40&&/^[a-f0-9]{40}$/.test(env.YARD_UI_QA_COMMIT),'Exact C source commit required');
 for(const key of ['NODE_OPTIONS','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','ADMIN_TOKEN','REDIS_URL','YARD_PRODUCTION_ACCEPTANCE','YARD_ACTIVE_COMMIT','YARD_ACTIVE_DIGEST','YARD_CLOSED_COMMIT','YARD_CLOSED_DIGEST','YARD_CANDIDATE_CI','YARD_PLAYER_WIRING_TEST','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.ok(!env[key],`Inherited ${key} is forbidden in the UI diagnostic`);
 assert.ok(!env.DATABASE_URL||env.DATABASE_URL===databaseURL,'Only the owned disposable database is allowed');
 return {commit:env.YARD_UI_QA_COMMIT};
}
export function assertUiFunctionalReport(report,identity){
 for(const [key,value]of Object.entries({...identity,scope:UI_QA_SCOPE}))assert.equal(report.config?.metadata?.[key],value,`Wrong diagnostic report ${key}`);
 assert.deepEqual(Object.fromEntries(['expected','unexpected','flaky','skipped'].map(key=>[key,report.stats?.[key]])),{expected:UI_QA_CASES.length,unexpected:0,flaky:0,skipped:0});
 assert.deepEqual(report.errors||[],[]);const specs=[];
 const visit=suite=>{specs.push(...(suite.specs||[]));for(const child of suite.suites||[])visit(child);};for(const suite of report.suites||[])visit(suite);
 assert.deepEqual(specs.map(spec=>spec.title).sort(),[...UI_QA_CASES].sort(),'Every named UI case must run exactly once');
 for(const spec of specs){assert.equal(spec.ok,true);assert.equal(spec.tests?.length,1);const result=spec.tests[0];assert.equal(result.expectedStatus,'passed');assert.equal(result.status,'expected');assert.equal(result.results?.length,1);assert.equal(result.results[0].status,'passed');}
 return specs.length;
}
export async function runUiFunctionalQa(){
 const inputs=assertUiFunctionalQa(),root=process.cwd(),out=resolve(root,'test-results/yard-ui-functional');
 const git=args=>execFileSync('git',args,{encoding:'utf8',timeout:15000}).trim();
 assert.equal(git(['rev-parse','HEAD']),inputs.commit,'Checkout must match the exact C source');
 assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Tracked C checkout must be clean');
 const runId=randomUUID(),prefix=`ccgh-yard-prod-${runId.slice(0,8)}`,names={B:`${prefix}-b`,db:`${prefix}-db`},created=[],relays=[];
 const controller=new AbortController(),sigint=()=>controller.abort(Error('UI diagnostic interrupted by SIGINT')),sigterm=()=>controller.abort(Error('UI diagnostic interrupted by SIGTERM'));
 process.on('SIGINT',sigint);process.on('SIGTERM',sigterm);const deadline=setTimeout(()=>controller.abort(Error('UI diagnostic exceeded 15 minutes')),15*60*1000);
 const docker=async(args,timeoutMs=60000,cleanup=false)=>(await runBoundedCommand('docker',args,{timeoutMs,signal:cleanup?undefined:controller.signal})).stdout;
 let proxy,networkCreated=false,completed;const statePath=resolve(out,'proxy-state.json'),faultPath=resolve(out,'lost-reply.json');
 try{
  await mkdir(out,{recursive:true});for(const file of ['DIAGNOSTIC.json','results.json','lost-reply.json','image-identity.json','network-endpoints.json','health-C.json'])await rm(resolve(out,file),{force:true});
  const paths=git(['ls-files','--','scripts/yard-ui-functional-qa.mjs','scripts/yard-production-acceptance.mjs','tests/helpers/yard-production-guard.mjs','tests/helpers/yard-production-process.mjs','tests/helpers/yard-production-proxy.mjs','tests/helpers/yard-production-fixtures.mjs','tests/helpers/yard-native-draw.mjs','tests/yard-ui-functional-qa','tests/yard-ui-functional-contract.test.mjs','.github/workflows/yard-ui-functional-qa.yml']).split('\n');
  for(const required of ['scripts/yard-ui-functional-qa.mjs','tests/yard-ui-functional-qa/ui.spec.mjs','tests/yard-ui-functional-qa/fixtures.mjs','tests/yard-ui-functional-qa/controls.mjs','tests/yard-ui-functional-qa/playwright.config.mjs'])assert.ok(paths.includes(required),`Missing committed diagnostic source: ${required}`);
  const sourceHashes={};for(const path of paths)sourceHashes[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
  const [image]=JSON.parse(await docker(['image','inspect',`ccgh-yard-ui-qa:${inputs.commit}`])),[pg]=JSON.parse(await docker(['image','inspect','postgres:15']));
  const imageId=verifyImageIdentity(image,{commit:inputs.commit});assert.match(pg.Id||'',/^sha256:[a-f0-9]{64}$/);
  const identity={commit:inputs.commit,runId,imageId};
  await writeFile(resolve(out,'image-identity.json'),JSON.stringify({scope:UI_QA_SCOPE,...identity,postgresImageId:pg.Id,sourceHashes},null,2));
  networkCreated=true;await docker(['network','create','--internal',prefix]);
  const endpoints=[];const attach=async mode=>{
   const [container]=JSON.parse(await docker(['inspect',names[mode]])),[network]=JSON.parse(await docker(['network','inspect',prefix]));
   const endpoint=ownedRelayEndpoint({network,container,networkName:prefix,containerName:names[mode],imageId:mode==='db'?pg.Id:imageId,mode});
   endpoints.push(endpoint.diagnostic);await writeFile(resolve(out,'network-endpoints.json'),JSON.stringify({runId,endpoints},null,2));relays.push(await startLoopbackTcpRelay(endpoint));
  };
  created.push(names.db);await docker(['run','-d','--name',names.db,'--network',prefix,'-e','POSTGRES_USER=ccgh_yard_production_ci','-e','POSTGRES_PASSWORD=ccgh_yard_production_ci','-e','POSTGRES_DB=ccgh_yard_production_ci',pg.Id]);
  for(let n=0;n<90;n++){controller.signal.throwIfAborted();try{await docker(['exec',names.db,'pg_isready','-U','ccgh_yard_production_ci','-d','ccgh_yard_production_ci'],2000);break;}catch{if(n===89)throw Error('Owned PostgreSQL did not start');await new Promise(r=>setTimeout(r,500));}}
  await attach('db');
  created.push(names.B);await docker(['run','-d','--name',names.B,'--network',prefix,'--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','-e','PORT=8080','-e',`DATABASE_URL=postgres://ccgh_yard_production_ci:ccgh_yard_production_ci@${names.db}:5432/ccgh_yard_production_ci`,'-e',`TELEGRAM_BOT_TOKEN=${fixtureBotToken}`,'-e',`PUBLIC_APP_URL=${origin}`,imageId]);await attach('B');
  const readyUntil=Date.now()+90000;let healthy=false,attempt=0;
  while(Date.now()<readyUntil){controller.signal.throwIfAborted();const at=Date.now();try{
   const response=await fetch(`http://127.0.0.1:${PRODUCTION_PORTS.B}/api/health`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])}),body=await response.json();
   await writeFile(resolve(out,'health-C.json'),JSON.stringify({runId,...healthDiagnostic({attempt:++attempt,at,httpStatus:response.status,body})},null,2));
   if(response.ok&&body.status==='ok'&&body.postgres===true&&body.buildId===inputs.commit){healthy=true;break;}
  }catch(error){await writeFile(resolve(out,'health-C.json'),JSON.stringify({runId,...healthDiagnostic({attempt:++attempt,at,error})},null,2));}await new Promise(r=>setTimeout(r,500));}
  assert.ok(healthy,'Ordinary C service did not become healthy');
  const runtime=JSON.parse(await docker(['exec',names.B,'node','--input-type=module','-e',`import fs from 'node:fs';import {YARD_PLAYER_RELEASE_POLICY as p} from './game-logic/yard-v2/release-policy.mjs';if(!fs.existsSync('dist/index.html')||fs.existsSync('public')||fs.existsSync('recovery-tools'))throw Error('Ordinary final image required');console.log(JSON.stringify({enabled:p.enabled,revision:p.revision,buildId:process.env.APP_BUILD_ID}));`],10000));
  assert.equal(runtime.enabled,true);assert.equal(runtime.buildId,inputs.commit);
  assertFreshProductionDatabase(await docker(['exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000',names.db,'psql','-U','ccgh_yard_production_ci','-d','ccgh_yard_production_ci','-Atqc','SELECT count(*) FROM players;'],10000));
  // The inherited proxy calls this one candidate port B. There is no A/P image.
  await setProxyState(statePath,{target:'B'});proxy=await startProductionProxy({statePath,evidencePath:faultPath});
  const env={...process.env,DATABASE_URL:databaseURL,YARD_UI_QA_RUN_ID:runId,YARD_UI_QA_IMAGE_ID:imageId,YARD_UI_QA_EVIDENCE:out,YARD_UI_QA_PROXY_STATE:statePath,YARD_UI_QA_FAULT:faultPath};
  await runBoundedCommand('pnpm',['exec','playwright','test','--config','tests/yard-ui-functional-qa/playwright.config.mjs'],{inherit:true,env,signal:controller.signal,timeoutMs:13*60*1000});
  const tests=assertUiFunctionalReport(JSON.parse(await readFile(resolve(out,'results.json'),'utf8')),identity);
  completed={format:'cc-gh-yard-ui-functional-diagnostic/v1',scope:UI_QA_SCOPE,releaseAcceptance:false,rollbackAcceptance:false,artCalibration:'not-assessed',...identity,postgresImageId:pg.Id,sourceHashes,runtime,tests,retries:0,completedAt:new Date().toISOString()};
 }finally{
  clearTimeout(deadline);const errors=[];
  try{await proxy?.closeAcceptance();}catch(error){errors.push(error.message);}for(const relay of relays.reverse())try{await relay.close();}catch(error){errors.push(error.message);}
  for(const name of created.reverse()){
   try{const logs=await runBoundedCommand('docker',['logs',name],{timeoutMs:5000});await writeFile(resolve(out,`${name}.log`),logs.stdout+logs.stderr);}catch{}
   try{await docker(['rm','-f','-v',name],10000,true);}catch(error){errors.push(error.message);}
  }
  if(networkCreated)try{await docker(['network','rm',prefix],10000,true);}catch(error){errors.push(error.message);}
  process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
  if(errors.length){process.exitCode=1;console.error('UI diagnostic cleanup failed:',errors.join('; '));}if(controller.signal.aborted)process.exitCode=1;
 }
 if(completed&&!process.exitCode){await writeFile(resolve(out,'DIAGNOSTIC.json'),JSON.stringify(completed,null,2));console.log('C-only UI/API diagnostic passed. Art calibration and release/rollback acceptance are outside this result.');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runUiFunctionalQa();

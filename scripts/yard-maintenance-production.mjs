/** Isolated genuine ACTIVE predecessor/candidate acceptance. Never deploys.
 * Existing transport slots A/B denote ACTIVE P/C here; neither is CLOSED. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadMaintenanceInputs,assertMaintenanceCaseResults} from '../tests/helpers/yard-maintenance-guard.mjs';
import {verifyMaintenanceRollback} from './yard-active-maintenance.mjs';
import {ownedRelayEndpoint,startLoopbackTcpRelay,healthDiagnostic,assertFreshProductionDatabase,inspectProductionImagePair} from './yard-production-acceptance.mjs';
import {PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL,ACTORS,PROPS} from '../tests/helpers/yard-production-guard.mjs';
import {runBoundedCommand} from '../tests/helpers/yard-production-process.mjs';
import {setProxyState,startProductionProxy} from '../tests/helpers/yard-production-proxy.mjs';
export async function runMaintenanceProduction(){
const root=process.cwd(),inputs=loadMaintenanceInputs(process.env,root),out=resolve(root,'test-results/yard-maintenance');
const proofRoot=resolve(process.env.YARD_MAINTENANCE_PROOF_DIR||'');
const plan=JSON.parse(await readFile(resolve(proofRoot,'plan.json'),'utf8')),ordinary=JSON.parse(await readFile(resolve(proofRoot,'ordinary.json'),'utf8'));
assert.equal(plan.status,'source-and-predecessor-verified');assert.equal(plan.requestSha256,inputs.requestSha256);assert.equal(plan.source.candidateCommit,inputs.activeCommit);assert.equal(plan.source.candidateTree,inputs.request.candidateTree);
assert.equal(ordinary.status,'passed');assert.equal(ordinary.requestSha256,inputs.requestSha256);assert.equal(ordinary.candidateCommit,inputs.activeCommit);assert.equal(ordinary.candidateDigest,inputs.activeDigest);
const acceptedPredecessorReceiptBytes=await readFile(resolve(proofRoot,'predecessor-receipt.json'));
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:15000}).trim(),inputs.activeCommit,'Checkout must be exact active commit');
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8',timeout:15000}).trim(),'','Tracked checkout must be clean');
const runId=randomUUID(),prefix=`ccgh-yard-prod-${runId.slice(0,8)}`,names={db:`${prefix}-db`,A:`${prefix}-a`,B:`${prefix}-b`},created=[];
const controller=new AbortController(),onSignal=signal=>controller.abort(Error(`Acceptance interrupted by ${signal}`));
const sigint=()=>onSignal('SIGINT'),sigterm=()=>onSignal('SIGTERM');process.on('SIGINT',sigint);process.on('SIGTERM',sigterm);
const deadline=setTimeout(()=>controller.abort(Error('Production acceptance exceeded 15-minute parent deadline')),15*60*1000);
const docker=async(args,timeoutMs=60000,cleanup=false)=>(await runBoundedCommand('docker',args,{timeoutMs,signal:cleanup?undefined:controller.signal})).stdout;
let proxy,networkCreated=false,completedProof;const relays=[];
try{
await mkdir(out,{recursive:true});for(const file of ['PASS.json','results.json','lost-reply.json','image-identity.json','metadata-A.json','metadata-B.json','network-endpoints.json','health-A.json','health-B.json'])await rm(resolve(out,file),{force:true});
const inspectImage=async image=>JSON.parse(await docker(['image','inspect',image]))[0];
const {a,b,ids}=await inspectProductionImagePair(inputs,docker),pg=await inspectImage('postgres:15');
assert.match(pg.Id||'',/^sha256:[a-f0-9]{64}$/);
const compatibilityBytes={};
const probe=async(mode,image)=>{const name=`${prefix}-probe-${mode}`;created.push(name);const bytes=await docker(['run','--name',name,'--network','none','--read-only',image,'node','scripts/yard-release-compatibility.mjs']);compatibilityBytes[mode]=bytes;return JSON.parse(bytes);};
const compatibility={A:await probe('a',ids.A),B:await probe('b',ids.B)};assert.equal(compatibility.A.playerRolloutEnabled,true);assert.equal(compatibility.B.format,'cc-gh-yard-release-compatibility/v2');assert.equal(compatibility.B.maintenanceRecordSha256,inputs.request.recordSha256);
const registryScript=`
import fs from 'node:fs';
import {getYardServerOptions} from './game-logic/yard-v2/yard-media.mjs';
import {verifyActiveRuntime} from './scripts/yard-active-contract.mjs';
import {YARD_ACTOR_PROFILES} from './game-logic/yard-v2/released-actor-profiles.mjs';
import {YARD_PROP_PROFILES} from './game-logic/yard-v2/released-prop-profiles.mjs';
import {createTrustedObstacleContext} from './game-logic/yard-v2/prop-obstacles.mjs';
import {createHash} from 'node:crypto';
const options=getYardServerOptions(),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
if(fs.existsSync('public')||fs.existsSync('recovery-tools')||!fs.existsSync('dist/index.html'))throw Error('Ordinary final image layout required');
const promotion=await verifyActiveRuntime('/app');
console.log(JSON.stringify({promotion,actors:Object.keys(options.actorProfiles),actorProfilesHash:hash(YARD_ACTOR_PROFILES),bindings:options.mediaRegistry.bindings.map(b=>({id:b.id,visitorId:b.visitorId,goodieId:b.goodieId,revision:b.revision,playbackReady:b.playbackReady})),props:Object.keys(YARD_PROP_PROFILES),propProfilesHash:hash(YARD_PROP_PROFILES),obstacles:createTrustedObstacleContext(options.mediaRegistry)}));`;
const identityProbe=`${prefix}-probe-identity`;created.push(identityProbe);
const identity=JSON.parse(await docker(['run','--name',identityProbe,'--network','none','--read-only',ids.B,'node','--input-type=module','-e',registryScript]));
assert.deepEqual(identity.actors,ACTORS);assert.deepEqual(identity.props,PROPS);assert.equal(identity.bindings.length,10);assert.ok(identity.bindings.every(b=>b.playbackReady));assert.equal(new Set(identity.bindings.map(b=>b.id)).size,10);
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'image-identity.json'),JSON.stringify({runId,inputs,imageA:{Id:a.Id,RepoDigests:a.RepoDigests},imageB:{Id:b.Id,RepoDigests:b.RepoDigests},compatibility,identity},null,2));
const statePath=resolve(out,'proxy-state.json'),faultPath=resolve(out,'lost-reply.json');await setProxyState(statePath,{target:'B'});
const endpoints=[];
const attachRelay=async(mode)=>{
 const [container]=JSON.parse(await docker(['inspect',names[mode]])),[network]=JSON.parse(await docker(['network','inspect',prefix]));
 const endpoint=ownedRelayEndpoint({network,container,networkName:prefix,containerName:names[mode],imageId:mode==='db'?pg.Id:ids[mode],mode});
 endpoints.push(endpoint.diagnostic);await writeFile(resolve(out,'network-endpoints.json'),JSON.stringify({runId,endpoints},null,2));
 relays.push(await startLoopbackTcpRelay(endpoint));
};
const ready=async(mode)=>{
 const deadline=Date.now()+90000;let attempt=0,last;
 while(Date.now()<deadline){controller.signal.throwIfAborted();const at=Date.now();
  try{const response=await fetch(`http://127.0.0.1:${PRODUCTION_PORTS[mode]}/api/health`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])}),body=await response.json();
   last=healthDiagnostic({attempt:++attempt,at,httpStatus:response.status,body});await writeFile(resolve(out,`health-${mode}.json`),JSON.stringify({runId,...last},null,2));
   if(response.ok&&body.status==='ok'&&body.postgres&&body.buildId===(mode==='A'?inputs.closedCommit:inputs.activeCommit))return;
  }catch(error){last=healthDiagnostic({attempt:++attempt,at,error});await writeFile(resolve(out,`health-${mode}.json`),JSON.stringify({runId,...last},null,2));}
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error(`Production ${mode} did not become healthy: ${JSON.stringify(last)}`);
};
 networkCreated=true;await docker(['network','create','--internal',prefix]);
 created.push(names.db);await docker(['run','-d','--name',names.db,'--network',prefix,'-e','POSTGRES_USER=ccgh_yard_production_ci','-e','POSTGRES_PASSWORD=ccgh_yard_production_ci','-e','POSTGRES_DB=ccgh_yard_production_ci',pg.Id]);
 for(let n=0;n<90;n++){controller.signal.throwIfAborted();try{await docker(['exec',names.db,'pg_isready','-U','ccgh_yard_production_ci','-d','ccgh_yard_production_ci'],2000);break;}catch{if(n===89)throw Error('Disposable PostgreSQL did not start');await new Promise(r=>setTimeout(r,500));}}
 await attachRelay('db');
 for(const mode of ['A','B']){
  created.push(names[mode]);await docker(['run','-d','--name',names[mode],'--network',prefix,'--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','-e','PORT=8080','-e',`DATABASE_URL=postgres://ccgh_yard_production_ci:ccgh_yard_production_ci@${names.db}:5432/ccgh_yard_production_ci`,'-e',`TELEGRAM_BOT_TOKEN=${FIXTURE_BOT_TOKEN}`,'-e',`PUBLIC_APP_URL=http://127.0.0.1:${PRODUCTION_PORTS.origin}`,ids[mode]]);await attachRelay(mode);await ready(mode);
 }
 // Copy only exact image metadata for HTTP-byte assertions; no alternate client build.
 for(const mode of ['A','B']){
  const container=names[mode],metadata={};
  for(const actor of ACTORS){const path=`assets/${['mika','mochi','pebble','pip'].includes(actor)?`yard-${actor}`:`yard-family/${actor}`}/runtime-media.json`;metadata[path]=await docker(['exec',container,'cat',`dist/${path}`],10000);}
  await writeFile(resolve(out,`metadata-${mode}.json`),JSON.stringify(metadata));
 }
 // Prove the new database once, before any worker can create fixtures. A failed
 // test may restart its worker; that must not turn owned rows into a setup failure.
 const initialPlayerCount=await docker(['exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000',names.db,'psql','-U','ccgh_yard_production_ci','-d','ccgh_yard_production_ci','-Atqc','SELECT count(*) FROM players;'],10000);
 assertFreshProductionDatabase(initialPlayerCount); const previousHealth=await (await fetch(`http://127.0.0.1:${PRODUCTION_PORTS.A}/api/health`,{signal:AbortSignal.timeout(5000)})).json();
 verifyMaintenanceRollback({recordBytes:inputs.recordBytes,approvedRecordSha256:inputs.request.recordSha256,candidateBuildId:inputs.activeCommit,candidateDigest:inputs.activeDigest,candidateImage:b,candidate:compatibility.B,previousImage:a,previous:compatibility.A,previousHealth,previousCompatibilityBytes:compatibilityBytes.a,acceptedPredecessorReceiptBytes,persistentYardRows:Number(initialPlayerCount)});

 proxy=await startProductionProxy({statePath,evidencePath:faultPath});
 const env={...process.env,CI:'true',YARD_PRODUCTION_ACCEPTANCE:'1',YARD_ACTIVE_COMMIT:inputs.activeCommit,YARD_ACTIVE_DIGEST:inputs.activeDigest,YARD_CLOSED_COMMIT:inputs.closedCommit,YARD_CLOSED_DIGEST:inputs.closedDigest,YARD_IMAGE_REPOSITORY:inputs.repository,DATABASE_URL,YARD_PRODUCTION_RUN_ID:runId,YARD_PRODUCTION_CONTAINER_B:names.B,YARD_MAINTENANCE_CONTAINER_P:names.A,YARD_PRODUCTION_STATE:statePath,YARD_PRODUCTION_FAULT:faultPath,YARD_PRODUCTION_EVIDENCE:out};
 await runBoundedCommand('pnpm',['exec','playwright','test','--config','playwright.yard-maintenance.config.js'],{inherit:true,env,signal:controller.signal,timeoutMs:13*60*1000});
 const report=JSON.parse(await readFile(resolve(out,'results.json'),'utf8'));
 const tests=assertMaintenanceCaseResults(report,{runId,inputs});
 completedProof={format:'cc-gh-yard-maintenance-acceptance/v1',runId,activeCommit:inputs.activeCommit,activeDigest:inputs.activeDigest,repository:inputs.repository,predecessorCommit:inputs.closedCommit,predecessorDigest:inputs.closedDigest,activeImageId:ids.B,predecessorImageId:ids.A,initialActivation:inputs.record.anchor,recordSha256:inputs.request.recordSha256,requestSha256:inputs.requestSha256,affectedGames:inputs.record.affectedGames,tests,retries:0,completedAt:new Date().toISOString()};
}finally{
 // The awaited command has already terminated its entire process group on abort.
 clearTimeout(deadline);const cleanupErrors=[];
 try{await proxy?.closeAcceptance();}catch(error){cleanupErrors.push(error.message);}
 for(const relay of relays.reverse())try{await relay.close();}catch(error){cleanupErrors.push(error.message);}
 for(const name of created.reverse()){
  try{const logs=await runBoundedCommand('docker',['logs',name],{timeoutMs:5000});await writeFile(resolve(out,`${name}.log`),logs.stdout+logs.stderr);}catch{}
  try{await docker(['rm','-f','-v',name],10000,true);}catch(error){cleanupErrors.push(error.message);}
 }
 if(networkCreated)try{await docker(['network','rm',prefix],10000,true);}catch(error){cleanupErrors.push(error.message);}
 process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
 if(cleanupErrors.length){process.exitCode=1;console.error('Acceptance cleanup failed:',cleanupErrors.join('; '));}
 if(controller.signal.aborted)process.exitCode=1;
}

if(completedProof&&!process.exitCode){await writeFile(resolve(out,'PASS.json'),JSON.stringify(completedProof,null,2));console.log('Exact published ACTIVE P-C-P image/API/PG/SW acceptance passed.');}

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runMaintenanceProduction();

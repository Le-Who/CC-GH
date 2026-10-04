/** Explicit, bounded CI harness; no deployment, publication, loader, or clock override. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertProductionAcceptance,verifyImageIdentity,verifyCompatibility,PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL,ACTORS,PROPS} from '../tests/helpers/yard-production-guard.mjs';
import {runBoundedCommand} from '../tests/helpers/yard-production-process.mjs';
import {setProxyState,startProductionProxy} from '../tests/helpers/yard-production-proxy.mjs';
const inputs=assertProductionAcceptance(),root=process.cwd(),out=resolve(root,'test-results/yard-production');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:15000}).trim(),inputs.activeCommit,'Checkout must be exact active commit');
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8',timeout:15000}).trim(),'','Tracked checkout must be clean');
const runId=randomUUID(),prefix=`ccgh-yard-prod-${runId.slice(0,8)}`,names={db:`${prefix}-db`,A:`${prefix}-a`,B:`${prefix}-b`},created=[];
const controller=new AbortController(),onSignal=signal=>controller.abort(Error(`Acceptance interrupted by ${signal}`));
const sigint=()=>onSignal('SIGINT'),sigterm=()=>onSignal('SIGTERM');process.on('SIGINT',sigint);process.on('SIGTERM',sigterm);
const deadline=setTimeout(()=>controller.abort(Error('Production acceptance exceeded 15-minute parent deadline')),15*60*1000);
const docker=async(args,timeoutMs=60000,cleanup=false)=>(await runBoundedCommand('docker',args,{timeoutMs,signal:cleanup?undefined:controller.signal})).stdout;
let proxy,networkCreated=false,completedProof;
const imageA=`${inputs.repository}@${inputs.closedDigest}`,imageB=`ccgh-yard-production:${inputs.activeCommit}`;
try{
await mkdir(out,{recursive:true});for(const file of ['PASS.json','results.json','lost-reply.json','image-identity.json','metadata-A.json','metadata-B.json'])await rm(resolve(out,file),{force:true});
const inspectImage=async image=>JSON.parse(await docker(['image','inspect',image]))[0];
const a=await inspectImage(imageA),b=await inspectImage(imageB);
const ids={A:verifyImageIdentity(a,{commit:inputs.closedCommit,digest:inputs.closedDigest,repository:inputs.repository}),B:verifyImageIdentity(b,{commit:inputs.activeCommit})};
const probe=async(mode,image)=>{const name=`${prefix}-probe-${mode}`;created.push(name);return JSON.parse(await docker(['run','--name',name,'--network','none','--read-only',image,'node','scripts/yard-release-compatibility.mjs']));};
const compatibility={A:await probe('a',ids.A),B:await probe('b',ids.B)};verifyCompatibility(compatibility.A,compatibility.B,inputs);
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
await writeFile(resolve(out,'image-identity.json'),JSON.stringify({runId,inputs,imageA:{Id:a.Id,RepoDigests:a.RepoDigests},imageB:{Id:b.Id},compatibility,identity},null,2));
const statePath=resolve(out,'proxy-state.json'),faultPath=resolve(out,'lost-reply.json');await setProxyState(statePath,{target:'B'});
const ready=async(mode)=>{const deadline=Date.now()+90000;while(Date.now()<deadline){controller.signal.throwIfAborted();try{const r=await fetch(`http://127.0.0.1:${PRODUCTION_PORTS[mode]}/api/health`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])}),v=await r.json();if(v.status==='ok'&&v.postgres&&v.buildId===(mode==='A'?inputs.closedCommit:inputs.activeCommit))return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error(`Production ${mode} did not become healthy`);};
 networkCreated=true;await docker(['network','create','--internal',prefix]);
 created.push(names.db);await docker(['run','-d','--name',names.db,'--network',prefix,'-p',`127.0.0.1:${PRODUCTION_PORTS.database}:5432`,'-e','POSTGRES_USER=ccgh_yard_production_ci','-e','POSTGRES_PASSWORD=ccgh_yard_production_ci','-e','POSTGRES_DB=ccgh_yard_production_ci','postgres:15']);
 for(let n=0;n<90;n++){controller.signal.throwIfAborted();try{await docker(['exec',names.db,'pg_isready','-U','ccgh_yard_production_ci','-d','ccgh_yard_production_ci'],2000);break;}catch{if(n===89)throw Error('Disposable PostgreSQL did not start');await new Promise(r=>setTimeout(r,500));}}
 for(const mode of ['A','B']){
  created.push(names[mode]);await docker(['run','-d','--name',names[mode],'--network',prefix,'--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','-p',`127.0.0.1:${PRODUCTION_PORTS[mode]}:8080`,'-e','PORT=8080','-e',`DATABASE_URL=postgres://ccgh_yard_production_ci:ccgh_yard_production_ci@${names.db}:5432/ccgh_yard_production_ci`,'-e',`TELEGRAM_BOT_TOKEN=${FIXTURE_BOT_TOKEN}`,'-e',`PUBLIC_APP_URL=http://127.0.0.1:${PRODUCTION_PORTS.origin}`,ids[mode]]);await ready(mode);
 }
 // Copy only exact image metadata for HTTP-byte assertions; no alternate client build.
 for(const mode of ['A','B']){
  const container=names[mode],metadata={};
  for(const actor of ACTORS){const path=`assets/${['mika','mochi','pebble','pip'].includes(actor)?`yard-${actor}`:`yard-family/${actor}`}/runtime-media.json`;metadata[path]=await docker(['exec',container,'cat',`dist/${path}`],10000);}
  await writeFile(resolve(out,`metadata-${mode}.json`),JSON.stringify(metadata));
 }
 proxy=await startProductionProxy({statePath,evidencePath:faultPath});
 const env={...process.env,DATABASE_URL,YARD_PRODUCTION_RUN_ID:runId,YARD_PRODUCTION_CONTAINER_B:names.B,YARD_PRODUCTION_STATE:statePath,YARD_PRODUCTION_FAULT:faultPath,YARD_PRODUCTION_EVIDENCE:out};
 await runBoundedCommand('pnpm',['exec','playwright','test','--config','playwright.yard-production.config.js'],{inherit:true,env,signal:controller.signal,timeoutMs:13*60*1000});
 const report=JSON.parse(await readFile(resolve(out,'results.json'),'utf8'));
 for(const [key,value]of Object.entries({runId,activeCommit:inputs.activeCommit,closedCommit:inputs.closedCommit,closedDigest:inputs.closedDigest}))assert.equal(report.config.metadata?.[key],value,'Report must belong to this exact run and image pair');
 assert.equal(report.stats.unexpected,0);assert.equal(report.stats.flaky,0);assert.equal(report.stats.skipped,0);assert.equal(report.stats.expected,9,'Exact bounded nine-test lane required');
 completedProof={format:'cc-gh-yard-production-acceptance/v1',runId,...inputs,activeImageId:ids.B,closedImageId:ids.A,tests:9,retries:0,completedAt:new Date().toISOString()};
}finally{
 // The awaited command has already terminated its entire process group on abort.
 clearTimeout(deadline);const cleanupErrors=[];
 try{await proxy?.closeAcceptance();}catch(error){cleanupErrors.push(error.message);}
 for(const name of created.reverse()){
  try{const logs=await runBoundedCommand('docker',['logs',name],{timeoutMs:5000});await writeFile(resolve(out,`${name}.log`),logs.stdout+logs.stderr);}catch{}
  try{await docker(['rm','-f','-v',name],10000,true);}catch(error){cleanupErrors.push(error.message);}
 }
 if(networkCreated)try{await docker(['network','rm',prefix],10000,true);}catch(error){cleanupErrors.push(error.message);}
 process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
 if(cleanupErrors.length){process.exitCode=1;console.error('Acceptance cleanup failed:',cleanupErrors.join('; '));}
 if(controller.signal.aborted)process.exitCode=1;
}

if(completedProof&&!process.exitCode){await writeFile(resolve(out,'PASS.json'),JSON.stringify(completedProof,null,2));console.log('Ordinary production image/API and same-origin warm-cache acceptance passed.');}

/** Explicit, bounded CI harness; no deployment, publication, loader, or clock override. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {assertProductionAcceptance,verifyImageIdentity,verifyCompatibility,PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL,ACTORS,PROPS} from '../tests/helpers/yard-production-guard.mjs';
import {runBoundedCommand} from '../tests/helpers/yard-production-process.mjs';
import {setProxyState,startProductionProxy} from '../tests/helpers/yard-production-proxy.mjs';
/** Docker can omit published ports on internal-only bridges. Keep egress isolation:
 * the host connects only to an inspected member of this run's own bridge. */
export function ownedRelayEndpoint({network,container,networkName,containerName,imageId,mode}){
 assert.match(networkName,/^ccgh-yard-prod-[a-f0-9]{8}$/);assert.ok(['A','B','db'].includes(mode));
 assert.equal(containerName,`${networkName}-${mode.toLowerCase()}`);
 assert.equal(network.Name,networkName);assert.match(network.Id||'',/^[a-f0-9]{64}$/);
 assert.equal(network.Driver,'bridge');assert.equal(network.Internal,true);
 assert.equal(container.Name,`/${containerName}`);assert.match(container.Id||'',/^[a-f0-9]{64}$/);
 assert.match(imageId||'',/^sha256:[a-f0-9]{64}$/);assert.equal(container.Image,imageId);assert.equal(container.State?.Running,true);
 assert.deepEqual(Object.keys(container.NetworkSettings?.Networks||{}),[networkName]);
 const attachment=container.NetworkSettings.Networks[networkName],member=network.Containers?.[container.Id];
 assert.equal(attachment.NetworkID,network.Id);assert.equal(member?.Name,containerName);
 const address=attachment.IPAddress;assert.equal(net.isIPv4(address),true);
 const octets=address.split('.').map(Number);assert.ok(octets[0]===10||octets[0]===172&&octets[1]>=16&&octets[1]<=31||octets[0]===192&&octets[1]===168,'Private Docker IPv4 address required');
 assert.match(member.IPv4Address||'',/^\d+\.\d+\.\d+\.\d+\/\d+$/);assert.equal(member.IPv4Address.split('/')[0],address);
 const toNumber=ip=>ip.split('.').reduce((n,x)=>(n*256+Number(x))>>>0,0);
 assert.ok(network.IPAM?.Config?.some(row=>{const [base,bits]=String(row.Subnet||'').split('/'),n=Number(bits);if(!net.isIPv4(base)||!Number.isInteger(n)||n<8||n>30)return false;const mask=(0xffffffff<<(32-n))>>>0;return (toNumber(base)&mask)===(toNumber(address)&mask);}), 'Container address must belong to the owned network subnet');
 return {hostPort:mode==='db'?PRODUCTION_PORTS.database:PRODUCTION_PORTS[mode],targetHost:address,targetPort:mode==='db'?5432:8080,
  diagnostic:{containerName,containerId:container.Id,imageId,networkName,networkId:network.Id,internal:true,address,
   portBindings:Object.fromEntries(Object.entries(container.NetworkSettings.Ports||{}).filter(([key])=>/^\d+\/(tcp|udp)$/.test(key)).map(([key,rows])=>[key,Array.isArray(rows)?rows.map(row=>({HostIp:net.isIP(row.HostIp)?row.HostIp:null,HostPort:/^\d{1,5}$/.test(row.HostPort||'')?row.HostPort:null})):null]))}};
}

/** Raw bytes only: HTTP, WebSocket and PostgreSQL still use the genuine services. */
export async function startLoopbackTcpRelay({hostPort,targetHost,targetPort},{connectTimeoutMs=5000,idleTimeoutMs=60000}={}){
 assert.ok(Number.isInteger(hostPort)&&hostPort>=0&&hostPort<=65535);assert.ok(Number.isInteger(targetPort)&&targetPort>0&&targetPort<=65535);assert.equal(net.isIPv4(targetHost),true);
 const sockets=new Set();let closing=false;
 const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));return socket;};
 const server=net.createServer({allowHalfOpen:true},downstream=>{
  track(downstream);if(closing){downstream.destroy();return;}
  const upstream=track(net.createConnection({host:targetHost,port:targetPort,allowHalfOpen:true}));
  const terminate=()=>{upstream.destroy();downstream.destroy();};
  const timer=setTimeout(terminate,connectTimeoutMs);
  upstream.once('connect',()=>{clearTimeout(timer);downstream.pipe(upstream);upstream.pipe(downstream);});
  for(const socket of [upstream,downstream]){socket.setTimeout(idleTimeoutMs,terminate);socket.on('error',terminate);}
  downstream.once('close',()=>{clearTimeout(timer);upstream.destroy();});
  upstream.once('close',()=>{clearTimeout(timer);if(!upstream.readableEnded)downstream.destroy();});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(hostPort,'127.0.0.1',resolve);});
 return {port:server.address().port,async close(){
  closing=true;for(const socket of sockets)socket.destroy();
  await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('Loopback relay close exceeded 2000ms')),2000);server.close(error=>{clearTimeout(deadline);error?reject(error):resolve();});});
 }};
}
export function healthDiagnostic({attempt,at,httpStatus,body,error}){
 return {attempt,at,...(Number.isInteger(httpStatus)?{httpStatus}:{}),
  ...(body&&typeof body==='object'?{status:['ok','degraded'].includes(body.status)?body.status:'unexpected',postgres:body.postgres===true,buildId:/^[a-f0-9]{40}$/.test(body.buildId||'')?body.buildId:null}:{}),
  ...(error?{errorName:String(error.name||'Error').slice(0,64),errorCode:String(error.cause?.code||error.code||'').slice(0,64)}:{})};
}

export function assertFreshProductionDatabase(count){assert.equal(String(count).trim(),'0','Acceptance must begin with an empty disposable player database');}

/** Inspect the pushed object when requested. An absent or mismatched object must
 * fail here, before any probe/service starts; never retry with the PR build tag. */
export async function inspectProductionImagePair(inputs,docker){
 const imageA=`${inputs.repository}@${inputs.closedDigest}`;
 const imageB=inputs.activeDigest===null?`ccgh-yard-production:${inputs.activeCommit}`:`${inputs.repository}@${inputs.activeDigest}`;
 const inspectImage=async image=>JSON.parse(await docker(['image','inspect',image]))[0];
 const a=await inspectImage(imageA),b=await inspectImage(imageB);
 const ids={A:verifyImageIdentity(a,{commit:inputs.closedCommit,digest:inputs.closedDigest,repository:inputs.repository}),B:verifyImageIdentity(b,{commit:inputs.activeCommit,digest:inputs.activeDigest,repository:inputs.repository})};
 return {a,b,ids};
}

export async function runProductionAcceptance(){
const inputs=assertProductionAcceptance(),root=process.cwd(),out=resolve(root,'test-results/yard-production');
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
 assertFreshProductionDatabase(await docker(['exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=5000',names.db,'psql','-U','ccgh_yard_production_ci','-d','ccgh_yard_production_ci','-Atqc','SELECT count(*) FROM players;'],10000));
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

if(completedProof&&!process.exitCode){await writeFile(resolve(out,'PASS.json'),JSON.stringify(completedProof,null,2));console.log('Ordinary production image/API and same-origin warm-cache acceptance passed.');}

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runProductionAcceptance();

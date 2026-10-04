import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assertProductionAcceptance,verifyImageIdentity,verifyCompatibility,DATABASE_URL,FIXTURE_BOT_TOKEN} from './helpers/yard-production-guard.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const A='a'.repeat(40),B='b'.repeat(40),digest='sha256:'+'c'.repeat(64),repository='ghcr.io/le-who/cc-gh';
const env={CI:'true',YARD_PRODUCTION_ACCEPTANCE:'1',YARD_ACTIVE_COMMIT:B,YARD_CLOSED_COMMIT:A,YARD_CLOSED_DIGEST:digest,YARD_IMAGE_REPOSITORY:repository};
test('production lane requires exact explicit identities and rejects overrides or external storage',()=>{
 assert.doesNotThrow(()=>assertProductionAcceptance(env));assert.doesNotThrow(()=>assertProductionAcceptance({...env,DATABASE_URL}));
 for(const [key,value]of Object.entries({CI:'false',YARD_PRODUCTION_ACCEPTANCE:'',YARD_ACTIVE_COMMIT:'latest',YARD_CLOSED_COMMIT:B,YARD_CLOSED_DIGEST:'latest',YARD_IMAGE_REPOSITORY:'other/image',DATABASE_URL:'postgres://host/production',NODE_OPTIONS:'--import loader',DEV_AUTH_ENABLED:'true',TELEGRAM_BOT_TOKEN:'real-token',REDIS_URL:'redis://localhost',YARD_CANDIDATE_CI:'1',YARD_PLAYER_WIRING_TEST:'1',YARD_EIGHT_PLAYER_CANDIDATE_TEST:'1'}))assert.throws(()=>assertProductionAcceptance({...env,[key]:value}),key);
 assert.match(FIXTURE_BOT_TOKEN,/not-a-real-bot/);
});
const image=()=>({Id:'sha256:'+'d'.repeat(64),RepoDigests:[`${repository}@${digest}`],Config:{Cmd:['node','server.js'],Labels:{'org.opencontainers.image.revision':A},Env:['NODE_ENV=production',`APP_BUILD_ID=${A}`]}});
test('ordinary final Docker identity pins command, build, registry digest and production environment',()=>{
 assert.equal(verifyImageIdentity(image(),{commit:A,digest,repository}),image().Id);
 for(const mutate of [x=>x.Config.Cmd=['node','test-server.js'],x=>x.RepoDigests=[],x=>x.Config.Labels['org.opencontainers.image.revision']=B,x=>x.Config.Env.push('NODE_OPTIONS=--import evil'),x=>x.Config.Env[0]='NODE_ENV=test',x=>x.Config.Env[1]=`APP_BUILD_ID=${B}`]){const value=image();mutate(value);assert.throws(()=>verifyImageIdentity(value,{commit:A,digest,repository}));}
});
const compatibility=()=>[{format:'cc-gh-yard-release-compatibility/v1',buildId:A,playerRolloutEnabled:false,closedQuarantineVerified:true,readableStorageFormats:['yard-persistent/v1']},{format:'cc-gh-yard-release-compatibility/v1',buildId:B,playerRolloutEnabled:true,requiredClosedPredecessor:{buildId:A,imageDigest:digest},readableStorageFormats:['yard-persistent/v1']}];
test('active B cannot be tested against a guessed, unproven, active or different predecessor',()=>{
 const inputs=assertProductionAcceptance(env);assert.doesNotThrow(()=>verifyCompatibility(...compatibility(),inputs));
 for(const mutate of [(a,b)=>b.requiredClosedPredecessor=null,(a,b)=>b.requiredClosedPredecessor.imageDigest='sha256:'+'e'.repeat(64),(a,b)=>b.playerRolloutEnabled=false,a=>a.playerRolloutEnabled=true,a=>a.closedQuarantineVerified=false,a=>a.buildId=B,a=>a.readableStorageFormats=[]]){const [a,b]=compatibility();mutate(a,b);assert.throws(()=>verifyCompatibility(a,b,inputs));}
});
test('missing opt-in fails before Docker, PostgreSQL or Playwright starts',()=>{
 const result=spawnSync(process.execPath,['scripts/yard-production-acceptance.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_OPTIONS:'',YARD_PRODUCTION_ACCEPTANCE:''},encoding:'utf8',timeout:5000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit production acceptance opt-in required/);assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND|spawnSync docker/);
});
test('nine-case lane leaves the 59-case evidence intact and runs real production boundaries',()=>{
 const script=read('scripts/yard-production-acceptance.mjs'),config=read('playwright.yard-production.config.js'),spec=read('tests/yard-production-e2e/production.spec.js'),fixtures=read('tests/helpers/yard-production-fixtures.mjs'),workflow=read('.github/workflows/yard-production-acceptance.yml');
 assert.match(script,/verifyActiveRuntime\('\/app'\)/);assert.match(script,/yard-release-compatibility\.mjs/);assert.match(script,/postgres:15/);assert.match(script,/report\.stats\.expected,9/);
 assert.match(config,/workers:1,retries:0/);assert.match(config,/serviceWorkers:'allow'/);assert.match(config,/globalTimeout:12\*60\*1000/);
 assert.doesNotMatch(config,/webServer|vite/);assert.doesNotMatch(script+spec+fixtures,/--import|registerHooks|Date\.now\s*=|page\.clock|AUTHORED_CLOCK|createEightAcceptanceOptions|ensurePersistentPlayerYard|route\.fulfill|route\.abort|setSnapshot|useGameHub\.getState|dist-yard-eight/);
 assert.match(fixtures,/const now=Date\.now\(\),opportunity=Math\.floor\(now\/HOUR\)\*HOUR/);assert.match(fixtures,/drawNativeSeed\(candidate,context\)/);assert.match(fixtures,/No authored runtime\/plan fixture allowed/);
 assert.match(spec,/window\.__APP_BUILD_ID__/);assert.match(spec,/gh_build_reload_guard/);assert.match(spec,/navigator\.serviceWorker\.controller/);assert.match(spec,/attributedDraw/);assert.match(spec,/\['restart',containerB\]/);assert.match(spec,/YARD_ROLLOUT_PAUSED/);assert.match(spec,/SOCKET|socketProof/);
 assert.match(workflow,/workflow_dispatch:/);assert.doesNotMatch(workflow,/push:|workflow_run:|workflow_call:|packages: write|ssh|deploy.yml|continue-on-error/);assert.match(workflow,/docker build --file Dockerfile/);assert.match(workflow,/closed_digest:/);
});

test('proxy passes genuine response bytes and injects one committed lost reply at the transport boundary',async()=>{
 const {createServer}=await import('node:http'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {startProductionProxy,setProxyState}=await import('./helpers/yard-production-proxy.mjs'),{PRODUCTION_PORTS}=await import('./helpers/yard-production-guard.mjs');
 const dir=await mkdtemp(join(tmpdir(),'yard-production-proxy-test-')),statePath=join(dir,'state.json'),evidencePath=join(dir,'lost.json');
 let writes=0,proxy;const server=createServer(async(req,res)=>{for await(const chunk of req)void chunk;if(req.method==='POST')writes++;res.writeHead(200,{'content-type':'application/json','x-upstream':'genuine'});res.end(JSON.stringify({duplicate:false,writes}));});
 try{
  await new Promise(resolve=>server.listen(PRODUCTION_PORTS.B,'127.0.0.1',resolve));await setProxyState(statePath,{target:'B'});proxy=await startProductionProxy({statePath,evidencePath});
  const origin=`http://127.0.0.1:${PRODUCTION_PORTS.origin}`;const response=await fetch(origin+'/read');assert.equal(response.headers.get('x-upstream'),'genuine');assert.deepEqual(await response.json(),{duplicate:false,writes:0});
  await setProxyState(statePath,{target:'B',dropCollect:true});
  const options={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'yard.collectGifts',clientActionId:'fixture-nonce'})};
  await assert.rejects(fetch(origin+'/api/player/mutate',options));assert.equal(writes,1);
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));assert.equal(evidence.status,200);assert.equal(evidence.body.writes,1);assert.equal(evidence.command.clientActionId,'fixture-nonce');
  await assert.rejects(fetch(origin+'/api/player/mutate',options));assert.equal(writes,1);
  await setProxyState(statePath,{target:'B'});assert.equal((await fetch(origin+'/api/player/mutate',options)).status,200);assert.equal(writes,2);
 }finally{proxy?.closeAllConnections();await new Promise(resolve=>proxy?proxy.close(resolve):resolve());server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('proxy teardown closes real upgraded peers and a hanging upstream within its bound',{timeout:5000},async()=>{
 const {createServer}=await import('node:http'),net=await import('node:net'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {startProductionProxy,setProxyState}=await import('./helpers/yard-production-proxy.mjs'),{PRODUCTION_PORTS}=await import('./helpers/yard-production-guard.mjs');
 const dir=await mkdtemp(join(tmpdir(),'yard-production-proxy-close-')),statePath=join(dir,'state.json');
 const peers=new Set();let markHanging,markUpgraded,client,proxy;
 const hanging=new Promise(resolve=>markHanging=resolve),upgraded=new Promise(resolve=>markUpgraded=resolve);
 const server=createServer((_req,_res)=>markHanging());server.on('connection',peer=>{peers.add(peer);peer.once('close',()=>peers.delete(peer));});
 server.on('upgrade',(_req,peer)=>{peer.once('end',()=>peer.destroy());peer.resume();peer.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');markUpgraded();});
 try{
  await new Promise(resolve=>server.listen(PRODUCTION_PORTS.B,'127.0.0.1',resolve));await setProxyState(statePath,{target:'B'});proxy=await startProductionProxy({statePath,evidencePath:join(dir,'lost.json')});
  client=net.createConnection(PRODUCTION_PORTS.origin,'127.0.0.1');client.on('error',()=>{});client.resume();const clientClosed=new Promise(resolve=>client.once('close',resolve));
  client.write('GET /socket.io/ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');await upgraded;
  const request=fetch(`http://127.0.0.1:${PRODUCTION_PORTS.origin}/hanging`).catch(error=>error);await hanging;
  const started=Date.now();await proxy.closeAcceptance();await clientClosed;await request;assert.ok(Date.now()-started<2500);proxy=null;
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(peers.size,0,'Both upstream HTTP and upgraded peers must close');
 }finally{client?.destroy();if(proxy)await proxy.closeAcceptance();for(const peer of peers)peer.destroy();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('proxy rejects a nonresponding upstream on an absolute request deadline',{timeout:5000},async()=>{
 const {createServer}=await import('node:http'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {startProductionProxy,setProxyState}=await import('./helpers/yard-production-proxy.mjs'),{PRODUCTION_PORTS}=await import('./helpers/yard-production-guard.mjs');
 const dir=await mkdtemp(join(tmpdir(),'yard-production-proxy-timeout-')),statePath=join(dir,'state.json');let proxy;
 const server=createServer(()=>{});try{await new Promise(resolve=>server.listen(PRODUCTION_PORTS.B,'127.0.0.1',resolve));await setProxyState(statePath,{target:'B'});proxy=await startProductionProxy({statePath,evidencePath:join(dir,'lost.json'),timeoutMs:100});
  const started=Date.now(),result=await fetch(`http://127.0.0.1:${PRODUCTION_PORTS.origin}/hang`).catch(error=>error);assert.ok(result instanceof Error||result.status===502);assert.ok(Date.now()-started<2000);
 }finally{await proxy?.closeAcceptance();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('owned process groups stop on timeout and abort, including children that ignore TERM',async()=>{
 const {runBoundedCommand}=await import('./helpers/yard-production-process.mjs');
 const normal=await runBoundedCommand(process.execPath,['-e','console.log("bounded")'],{timeoutMs:2000});assert.equal(normal.stdout.trim(),'bounded');
 const stubborn=['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'];let started=Date.now();
 await assert.rejects(runBoundedCommand(process.execPath,stubborn,{timeoutMs:100}),/deadline/);assert.ok(Date.now()-started<3500);
 const controller=new AbortController();started=Date.now();setTimeout(()=>controller.abort(Error('fixture cancellation')),100);
 await assert.rejects(runBoundedCommand(process.execPath,stubborn,{timeoutMs:10000,signal:controller.signal}),/fixture cancellation/);assert.ok(Date.now()-started<3500);
});

test('runner owns probes before launch and requires actual browser paused-nonce handling',()=>{
 const script=read('scripts/yard-production-acceptance.mjs'),spec=read('tests/yard-production-e2e/production.spec.js');
 assert.ok(script.indexOf('try{')<script.indexOf('const inspectImage='));assert.match(script,/created\.push\(name\);return JSON\.parse\(await docker\(\['run','--name'/);
 assert.match(script,/created\.push\(names\[mode\]\);await docker/);assert.match(script,/created\.push\(names.db\);await docker/);
 assert.match(script,/AbortSignal\.timeout\(5000\)/);assert.match(script,/15\*60\*1000/);assert.match(script,/process\.on\('SIGINT'/);assert.match(script,/process\.on\('SIGTERM'/);assert.match(script,/closeAcceptance/);
 assert.match(spec,/page\.waitForResponse/);assert.match(spec,/command\?\.clientActionId!==lost\.command\.clientActionId/);assert.match(spec,/await response\.json\(\)\)\.error==='YARD_ROLLOUT_PAUSED'/);assert.match(spec,/toBe\('rollout-paused'\)/);
 assert.match(spec,/Object\.hasOwn\(committed\._yardV2\.runtime\.commandReceipts,lost\.command\.clientActionId\)/);
});

test('process deadline kills a stubborn wrapper and its same-group grandchild',async()=>{
 const {runBoundedCommand}=await import('./helpers/yard-production-process.mjs'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'yard-process-group-test-')),path=join(dir,'pids.json');
 try{
  const source=`const {spawn}=require('node:child_process'),fs=require('node:fs');process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(path)},JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
  await assert.rejects(runBoundedCommand(process.execPath,['-e',source],{timeoutMs:200}),/deadline/);
  const pids=JSON.parse(await readFile(path,'utf8'));
  for(const pid of pids){try{const status=await readFile(`/proc/${pid}/status`,'utf8');assert.match(status,/State:\s+Z/,'No live descendant after process-group termination');}catch(error){if(error.code!=='ENOENT')throw error;}}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a nonzero wrapper exit cannot leave an inherited-stdio process group running',async()=>{
 const {runBoundedCommand}=await import('./helpers/yard-production-process.mjs'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'yard-failed-wrapper-test-')),path=join(dir,'child.json');
 try{
  const source=`const {spawn}=require('node:child_process'),fs=require('node:fs');const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(path)},JSON.stringify(child.pid));setTimeout(()=>process.exit(7),100);`;
  await assert.rejects(runBoundedCommand(process.execPath,['-e',source],{inherit:true,timeoutMs:2000}),/failed \(7\)/);
  const pid=JSON.parse(await readFile(path,'utf8'));await new Promise(resolve=>setTimeout(resolve,20));
  try{const status=await readFile(`/proc/${pid}/status`,'utf8');assert.match(status,/State:\s+Z/,'Failed wrapper descendant must be terminated');}catch(error){if(error.code!=='ENOENT')throw error;}
 }finally{await rm(dir,{recursive:true,force:true});}
});

// Keep the additional cross-game lane honest about source, persistence and scope.
test('cross-game production coverage uses owned signed fixtures and real UI results',()=>{
 const spec=read('tests/yard-production-e2e/production.spec.js');
 assert.match(spec,/authentic Merge Moon Lamp enters Yard/);
 assert.match(spec,/fixture-assisted real Blox finishes fund one Merge pack/);
 assert.match(spec,/all eight real routes survive rapid Home/);
 assert.match(spec,/await saved\(f\)/);assert.match(spec,/mergeLab\.replayed/);
 assert.match(spec,/fixtureAssisted:true/);assert.match(spec,/seededScore:3498/);
 assert.doesNotMatch(spec,/route\.fulfill\s*\(|window\.__.*setState\s*\(|test\.skip\s*\(/);
});

test('internal relay destinations require exact owned network, running container and image',async()=>{
 const {ownedRelayEndpoint}=await import('../scripts/yard-production-acceptance.mjs');
 const networkName='ccgh-yard-prod-1234abcd',networkId='d'.repeat(64),containerId='e'.repeat(64),imageId='sha256:'+'f'.repeat(64),containerName=networkName+'-a';
 const fixture=()=>({networkName,containerName,imageId,mode:'A',network:{Id:networkId,Name:networkName,Driver:'bridge',Internal:true,IPAM:{Config:[{Subnet:'172.20.0.0/16'}]},Containers:{[containerId]:{Name:containerName,IPv4Address:'172.20.0.2/16'}}},container:{Id:containerId,Name:'/'+containerName,Image:imageId,State:{Running:true},Config:{Env:['SECRET=never-include']},NetworkSettings:{Ports:{'8080/tcp':null},Networks:{[networkName]:{NetworkID:networkId,IPAddress:'172.20.0.2'}}}}});
 const endpoint=ownedRelayEndpoint(fixture());assert.equal(endpoint.hostPort,3231);assert.equal(endpoint.targetPort,8080);assert.equal(endpoint.targetHost,'172.20.0.2');assert.equal(endpoint.diagnostic.internal,true);assert.doesNotMatch(JSON.stringify(endpoint),/SECRET|Config|Env/);
 for(const mutate of [f=>f.network.Internal=false,f=>f.network.Driver='host',f=>f.network.Name='foreign',f=>f.container.Name='/foreign',f=>f.container.State.Running=false,f=>f.container.Image='sha256:'+'a'.repeat(64),f=>f.container.NetworkSettings.Networks.extra={},f=>f.container.NetworkSettings.Networks[networkName].NetworkID='a'.repeat(64),f=>f.container.NetworkSettings.Networks[networkName].IPAddress='8.8.8.8',f=>f.network.Containers[containerId].IPv4Address='172.20.0.3/16',f=>f.network.IPAM.Config[0].Subnet='172.21.0.0/16',f=>delete f.network.Containers[containerId]]){const f=fixture();mutate(f);assert.throws(()=>ownedRelayEndpoint(f));}
});

test('loopback relay preserves large duplex bytes and half-close; cannot bind a public interface',{timeout:5000},async()=>{
 const net=await import('node:net'),{startLoopbackTcpRelay}=await import('../scripts/yard-production-acceptance.mjs');
 const bytes=Buffer.alloc(2*1024*1024,0x6b),server=net.createServer({allowHalfOpen:true},peer=>{const chunks=[];peer.on('data',chunk=>chunks.push(chunk));peer.on('end',()=>{assert.deepEqual(Buffer.concat(chunks),bytes);peer.end(Buffer.concat(chunks));});});let relay;
 try{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));relay=await startLoopbackTcpRelay({hostPort:0,targetHost:'127.0.0.1',targetPort:server.address().port});
  const result=await new Promise((resolve,reject)=>{const client=net.createConnection({host:'127.0.0.1',port:relay.port}),chunks=[];client.on('error',reject);client.on('data',chunk=>chunks.push(chunk));client.on('end',()=>resolve(Buffer.concat(chunks)));client.on('connect',()=>client.end(bytes));});assert.deepEqual(result,bytes);
 }finally{await relay?.close();await new Promise(resolve=>server.close(resolve));}
 const source=read('scripts/yard-production-acceptance.mjs');assert.match(source,/server\.listen\(hostPort,'127\.0\.0\.1'/);assert.doesNotMatch(source,/'-p',/);assert.match(source,/\['network','create','--internal',prefix\]/);
});

test('relay rejects connection failure, times out idle peers and closes live upgraded bytes',{timeout:5000},async()=>{
 const net=await import('node:net'),{startLoopbackTcpRelay}=await import('../scripts/yard-production-acceptance.mjs');
 const peers=new Set(),server=net.createServer(peer=>{peers.add(peer);peer.on('error',()=>{});peer.on('data',()=>peer.write('HTTP/1.1 101 Switching Protocols\r\n\r\n'));peer.on('close',()=>peers.delete(peer));});let relay,client;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const targetPort=server.address().port;
  relay=await startLoopbackTcpRelay({hostPort:0,targetHost:'127.0.0.1',targetPort},{idleTimeoutMs:75});
  let at=Date.now();await new Promise(resolve=>{client=net.createConnection({host:'127.0.0.1',port:relay.port});client.on('error',()=>{});client.resume();client.on('close',resolve);});assert.ok(Date.now()-at<1500);await relay.close();relay=null;
  relay=await startLoopbackTcpRelay({hostPort:0,targetHost:'127.0.0.1',targetPort});
  client=net.createConnection({host:'127.0.0.1',port:relay.port});client.on('error',()=>{});const closed=new Promise(resolve=>client.on('close',resolve));await new Promise(resolve=>{client.once('data',resolve);client.write('upgrade bytes');});
  at=Date.now();await relay.close();relay=null;await closed;assert.ok(Date.now()-at<2500);
  for(const peer of peers)peer.destroy();await new Promise(resolve=>server.close(resolve));
  relay=await startLoopbackTcpRelay({hostPort:0,targetHost:'127.0.0.1',targetPort});
  at=Date.now();await new Promise(resolve=>{client=net.createConnection({host:'127.0.0.1',port:relay.port});client.on('error',()=>{});client.resume();client.once('close',resolve);});assert.ok(Date.now()-at<1500);
 }finally{client?.destroy();await relay?.close();for(const peer of peers)peer.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));}
});

test('health diagnostics omit arbitrary response/credential text and keep useful failure codes',async()=>{
 const {healthDiagnostic}=await import('../scripts/yard-production-acceptance.mjs');
 const row=healthDiagnostic({attempt:2,at:123,httpStatus:503,body:{status:'degraded',postgres:false,buildId:'a'.repeat(40),secret:'never-include'},error:{name:'TypeError',message:'secret-password',cause:{code:'ECONNREFUSED'}}});
 assert.deepEqual(row,{attempt:2,at:123,httpStatus:503,status:'degraded',postgres:false,buildId:'a'.repeat(40),errorName:'TypeError',errorCode:'ECONNREFUSED'});assert.doesNotMatch(JSON.stringify(row),/secret|password|never-include/);
 const source=read('scripts/yard-production-acceptance.mjs');assert.match(source,/network-endpoints\.json/);assert.match(source,/health-\$\{mode\}\.json/);assert.match(source,/await attachRelay\(mode\);await ready\(mode\)/);assert.match(source,/for\(const relay of relays\.reverse\(\)\)try\{await relay\.close\(\)/);
});

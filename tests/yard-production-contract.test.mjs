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
const activeDigest='sha256:'+'e'.repeat(64);
const activeImage=()=>({Id:'sha256:'+'f'.repeat(64),RepoDigests:[`${repository}@${activeDigest}`],Config:{Cmd:['node','server.js'],Labels:{'org.opencontainers.image.revision':B},Env:['NODE_ENV=production',`APP_BUILD_ID=${B}`]}});
test('optional active digest accepts only an exact supplied SHA-256 and never treats invalid input as absent',()=>{
 assert.equal(assertProductionAcceptance(env).activeDigest,null);
 assert.equal(assertProductionAcceptance({...env,YARD_ACTIVE_DIGEST:activeDigest}).activeDigest,activeDigest);
 for(const value of ['',null,'latest',' '+activeDigest,activeDigest+'\n',activeDigest.toUpperCase(),repository+'@'+activeDigest,'sha256:'+'e'.repeat(63)])assert.throws(()=>assertProductionAcceptance({...env,YARD_ACTIVE_DIGEST:value}),String(value));
 const result=spawnSync(process.execPath,['scripts/yard-production-acceptance.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,...env,NODE_OPTIONS:'',YARD_ACTIVE_DIGEST:''},encoding:'utf8',timeout:5000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Exact active registry digest required/);assert.doesNotMatch(result.stderr,/Checkout must be exact|spawnSync docker/);
});
test('published B uses only its immutable reference and local PR mode keeps its existing tag',async()=>{
 const {inspectProductionImagePair}=await import('../scripts/yard-production-acceptance.mjs');
 for(const published of [false,true]){
  const inputs=assertProductionAcceptance({...env,...(published?{YARD_ACTIVE_DIGEST:activeDigest}:{})}),calls=[];
  const pair=await inspectProductionImagePair(inputs,async args=>{calls.push(args);return JSON.stringify([calls.length===1?image():activeImage()]);});
  assert.deepEqual(calls,[['image','inspect',`${repository}@${digest}`],['image','inspect',published?`${repository}@${activeDigest}`:`ccgh-yard-production:${B}`]]);
  assert.equal(pair.ids.A,image().Id);assert.equal(pair.ids.B,activeImage().Id);assert.deepEqual(pair.b.RepoDigests,[`${repository}@${activeDigest}`]);
 }
});
test('published B rejects absent or foreign digest, revision/build mismatch and missing image without fallback',async()=>{
 const {inspectProductionImagePair}=await import('../scripts/yard-production-acceptance.mjs'),inputs=assertProductionAcceptance({...env,YARD_ACTIVE_DIGEST:activeDigest});
 for(const mutate of [x=>x.RepoDigests=[],x=>delete x.RepoDigests,x=>x.RepoDigests=[`${repository}@${digest}`],x=>x.RepoDigests=[`ghcr.io/foreign/image@${activeDigest}`],x=>x.Config.Labels['org.opencontainers.image.revision']=A,x=>x.Config.Env[1]=`APP_BUILD_ID=${A}`]){
  const calls=[],b=activeImage();mutate(b);
  await assert.rejects(inspectProductionImagePair(inputs,async args=>{calls.push(args);return JSON.stringify([calls.length===1?image():b]);}));
  assert.equal(calls.length,2);assert.deepEqual(calls[1],['image','inspect',`${repository}@${activeDigest}`]);
 }
 const calls=[];await assert.rejects(inspectProductionImagePair(inputs,async args=>{calls.push(args);if(calls.length===2)throw Error('No such image');return JSON.stringify([image()]);}),/No such image/);assert.equal(calls.length,2);
 const runner=read('scripts/yard-production-acceptance.mjs');
 assert.ok(runner.indexOf('await inspectProductionImagePair(inputs,docker)')<runner.indexOf("const probe="));
 assert.match(runner,/activeImageId:ids\.B,closedImageId:ids\.A/);assert.match(runner,/runId,\.\.\.inputs/);assert.match(runner,/imageB:\{Id:b\.Id,RepoDigests:b\.RepoDigests\}/);
});
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
 assert.ok(script.indexOf('try{')<script.indexOf('await inspectProductionImagePair(inputs,docker)'));assert.match(script,/created\.push\(name\);return JSON\.parse\(await docker\(\['run','--name'/);
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

for(const encoding of ['gzip','br','deflate'])test(`lost-reply capture decodes genuine ${encoding} response without changing normal bytes`,{timeout:5000},async()=>{
 const {createServer}=await import('node:http'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),zlib=await import('node:zlib');
 const {startProductionProxy,setProxyState}=await import('./helpers/yard-production-proxy.mjs'),{PRODUCTION_PORTS}=await import('./helpers/yard-production-guard.mjs');
 const dir=await mkdtemp(join(tmpdir(),'yard-compressed-fault-')),statePath=join(dir,'state.json'),evidencePath=join(dir,'lost.json'),errors=[];let proxy,writes=0;
 const body=()=>({duplicate:false,writes,snapshot:{verified:'actual upstream response',padding:'x'.repeat(10000)}});
 const encode={gzip:zlib.gzipSync,br:zlib.brotliCompressSync,deflate:zlib.deflateSync}[encoding];
 const server=createServer(async(req,res)=>{for await(const chunk of req)void chunk;if(req.method==='POST')writes++;res.writeHead(200,{'content-type':'application/json','content-encoding':encoding});res.end(encode(Buffer.from(JSON.stringify(body()))));});
 try{
  await new Promise(resolve=>server.listen(PRODUCTION_PORTS.B,'127.0.0.1',resolve));await setProxyState(statePath,{target:'B'});proxy=await startProductionProxy({statePath,evidencePath});proxy.on('acceptance-error',error=>errors.push(error));
  const origin=`http://127.0.0.1:${PRODUCTION_PORTS.origin}`,normal=await fetch(origin+'/read');assert.deepEqual(await normal.json(),body());
  await setProxyState(statePath,{target:'B',dropCollect:true});const options={method:'POST',headers:{'content-type':'application/json','accept-encoding':encoding},body:JSON.stringify({action:'yard.collectGifts',clientActionId:`fixture-${encoding}`})};
  await assert.rejects(fetch(origin+'/api/player/mutate',options));assert.equal(writes,1);assert.equal(errors.length,0,'Compressed capture must not be silently discarded');
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));assert.equal(evidence.status,200);assert.deepEqual(evidence.body,body());assert.equal(evidence.command.clientActionId,`fixture-${encoding}`);
  await assert.rejects(fetch(origin+'/api/player/mutate',options));assert.equal(writes,1,'A blocked retry must not reach the service twice');
 }finally{await proxy?.closeAcceptance();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('captured response decoding rejects unknown, malformed and oversized evidence',async()=>{
 const {decodeCapturedJson}=await import('./helpers/yard-production-proxy.mjs'),{gzipSync}=await import('node:zlib');
 assert.deepEqual(decodeCapturedJson(Buffer.from('{"verified":true}')),{verified:true});
 for(const encoding of ['constructor','__proto__','gzip, br','unknown'])assert.throws(()=>decodeCapturedJson(Buffer.from('{}'),encoding),{code:'UNSUPPORTED_CAPTURE_ENCODING'});
 assert.throws(()=>decodeCapturedJson(Buffer.from('not json')),{code:'INVALID_CAPTURE_JSON'});
 assert.throws(()=>decodeCapturedJson(Buffer.from('not gzip'),'gzip'));
 assert.throws(()=>decodeCapturedJson(Buffer.alloc(4*1024*1024+1)),{code:'CAPTURE_WIRE_TOO_LARGE'});
 assert.throws(()=>decodeCapturedJson(gzipSync(Buffer.alloc(4*1024*1024+1)),'gzip'),{code:'ERR_BUFFER_TOO_LARGE'});
});

test('failed fault capture writes explicit failure evidence and never claims a successful body',{timeout:5000},async()=>{
 const {createServer}=await import('node:http'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {startProductionProxy,setProxyState}=await import('./helpers/yard-production-proxy.mjs'),{PRODUCTION_PORTS}=await import('./helpers/yard-production-guard.mjs');
 const dir=await mkdtemp(join(tmpdir(),'yard-bad-capture-')),statePath=join(dir,'state.json'),evidencePath=join(dir,'lost.json');let proxy;
 const server=createServer(async(req,res)=>{for await(const chunk of req)void chunk;res.writeHead(200,{'content-type':'application/json','content-encoding':'unknown'});res.end('{}');});
 try{await new Promise(resolve=>server.listen(PRODUCTION_PORTS.B,'127.0.0.1',resolve));await setProxyState(statePath,{target:'B',dropCollect:true});proxy=await startProductionProxy({statePath,evidencePath});
  await assert.rejects(fetch(`http://127.0.0.1:${PRODUCTION_PORTS.origin}/api/player/mutate`,{method:'POST',body:JSON.stringify({action:'yard.collectGifts',clientActionId:'bad-capture'})}));
  const evidence=JSON.parse(await readFile(evidencePath,'utf8'));assert.equal(evidence.status,0);assert.equal(evidence.upstreamStatus,200);assert.equal(evidence.captureError,'UNSUPPORTED_CAPTURE_ENCODING');assert.equal(evidence.body,undefined);
 }finally{await proxy?.closeAcceptance();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('fresh database proof runs once before worker startup and rejects nonempty or invalid counts',async()=>{
 const {assertFreshProductionDatabase}=await import('../scripts/yard-production-acceptance.mjs');
 assert.doesNotThrow(()=>assertFreshProductionDatabase('0\n'));
 for(const count of ['1','-1','0\n1','','NaN',null])assert.throws(()=>assertFreshProductionDatabase(count));
 const runner=read('scripts/yard-production-acceptance.mjs'),spec=read('tests/yard-production-e2e/production.spec.js');
 assert.equal((runner.match(/SELECT count\(\*\) FROM players;/g)||[]).length,1);assert.ok(runner.indexOf('assertFreshProductionDatabase(await docker')<runner.indexOf("await runBoundedCommand('pnpm'"));
 assert.match(runner,/default_transaction_read_only=on -c statement_timeout=5000/);assert.doesNotMatch(spec,/SELECT count\(\*\)/);
 assert.match(runner,/report\.stats\.expected,9/);assert.match(runner,/report\.stats\.skipped,0/);assert.match(spec,/expect\(lost\.captureError\)\.toBeUndefined\(\)/);
});

// Deliberately scoped to the checked-in workflow's block form. A different YAML
// layout must update this test explicitly, rather than silently evade a gate.
function assertPublishedWorkflowGate(source){
 const job=name=>{const parts=source.split(new RegExp(`^  ${name}:\\n`,'m'));assert.equal(parts.length,2);return parts[1].split(/(?=^  [a-zA-Z][\w-]*:\n)/m)[0];};
 const field=(block,key,indent)=>{const rows=[...block.matchAll(new RegExp(`^ {${indent}}${key}: (.*)$`,'gm'))];assert.equal(rows.length,1,`Exactly one ${key} field required`);return rows[0][1];};
 const build=job('build-and-push'),deploy=job('deploy'),steps=build.split(/^      - name: /m).slice(1);
 assert.equal(field(build,'needs',4),'validate');assert.equal(field(deploy,'needs',4),'build-and-push');
 assert.doesNotMatch(build+deploy,/continue-on-error:|^    if:.*(?:always\(|failure\(|cancelled\()/m);
 assert.equal(field(build,'image_digest',6),'${{ steps.build_image.outputs.digest }}');
 const push=steps.findIndex(step=>/^        id: build_image$/m.test(step));
 assert.equal(push,4);assert.equal(field(steps[push],'id',8),'build_image');assert.equal(field(steps[push],'uses',8),'docker/build-push-action@v7');assert.equal(field(steps[push],'push',10),'true');
 const names=['Set up Node for published Yard image acceptance','Verify published Yard acceptance inputs','Prepare exact published Yard images and browser','Require nine cases on the exact published Yard digest','Preserve published Yard digest acceptance evidence','Require committed ACTIVE published-image proof'];
 const gate=steps.slice(push+1);assert.deepEqual(gate.map(step=>step.split('\n')[0]),names);
 const active="hashFiles('game-logic/yard-v2/active-release-contract.json') != ''",captured="steps.published_yard.outputs.mode == 'ACTIVE'";
 gate.forEach((step,index)=>assert.equal(field(step,'if',8),index<2?active:index===5?'always()':index===4?'always() && '+captured:captured));
 assert.equal(field(gate[0],'uses',8),'actions/setup-node@v6');assert.equal(field(gate[0],'node-version',10),'24.x');
 assert.equal(field(gate[1],'id',8),'published_yard');assert.equal(field(gate[1],'YARD_ACTIVE_COMMIT',10),'${{ github.sha }}');
 assert.match(gate[1],/test "\$\(git rev-parse HEAD\)" = "\$YARD_ACTIVE_COMMIT"\n/);
 const validate='process.stdout.write(validateActivationInputs(contract.inputs).closed.buildId);',fetch='timeout --kill-after=5s 60s git fetch --no-tags --depth=1 origin "$closed_commit"',verify='node scripts/yard-active-contract.mjs "$PWD"';
 assert.ok(gate[1].includes(validate));assert.ok(gate[1].split('\n').includes('          '+fetch));assert.ok(gate[1].split('\n').includes('          '+verify));
 assert.ok(gate[1].indexOf(validate)<gate[1].indexOf(fetch),'Validate the fetched commit first');
 assert.ok(gate[1].indexOf(fetch)<gate[1].indexOf(verify),'Fetch the shallow checkout ancestor before verification');
 assert.ok(gate[1].indexOf(verify)<gate[1].indexOf('appendFileSync(process.env.GITHUB_OUTPUT'),'Capture ACTIVE only after verification');
 assert.match(gate[1],/closed_commit="\$\(node --input-type=module <<'JS'/);
 assert.match(gate[1],/const \{buildId,imageDigest\}=contract\.inputs\.closed;/);
 assert.match(gate[1],/mode=ACTIVE\\nclosed_commit=\$\{buildId\}\\nclosed_digest=\$\{imageDigest\}\\n/);
 for(const step of gate.slice(1,4))assert.equal(field(step,'YARD_ACTIVE_DIGEST',10),'${{ steps.build_image.outputs.digest }}');
 assert.equal(field(gate[2],'YARD_CLOSED_DIGEST',10),'${{ steps.published_yard.outputs.closed_digest }}');
 assert.match(gate[2],/^          docker pull "\$\{REGISTRY\}\/\$\{REPO\}@\$\{YARD_ACTIVE_DIGEST\}"$/m);
 assert.match(gate[2],/^          docker pull "\$\{REGISTRY\}\/\$\{REPO\}@\$\{YARD_CLOSED_DIGEST\}"$/m);
 assert.equal(field(gate[3],'id',8),'published_yard_proof');assert.equal(field(gate[3],'timeout-minutes',8),'18');assert.equal(field(gate[3],'run',8),'node scripts/yard-production-acceptance.mjs');
 for(const [key,value]of Object.entries({CI:"'true'",YARD_PRODUCTION_ACCEPTANCE:"'1'",YARD_ACTIVE_COMMIT:'${{ github.sha }}',YARD_CLOSED_COMMIT:'${{ steps.published_yard.outputs.closed_commit }}',YARD_CLOSED_DIGEST:'${{ steps.published_yard.outputs.closed_digest }}',YARD_IMAGE_REPOSITORY:repository}))assert.equal(field(gate[3],key,10),value);
 for(const key of ['NODE_OPTIONS','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','DATABASE_URL','REDIS_URL','YARD_PLAYER_WIRING_TEST','YARD_CANDIDATE_CI','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.equal(field(gate[3],key,10),"''");
 assert.equal(field(gate[4],'uses',8),'actions/upload-artifact@v7');assert.equal(field(gate[4],'path',10),'test-results/yard-production/');assert.equal(field(gate[4],'if-no-files-found',10),'error');
 assert.equal(field(gate[5],'timeout-minutes',8),'1');assert.equal(field(gate[5],'NODE_OPTIONS',10),"''");
 for(const [key,value]of Object.entries({YARD_ACTIVE_COMMIT:'${{ github.sha }}',YARD_ACTIVE_DIGEST:'${{ steps.build_image.outputs.digest }}',YARD_PROOF_MODE:'${{ steps.published_yard.outputs.mode }}',YARD_PROOF_OUTCOME:'${{ steps.published_yard_proof.outcome }}'}))assert.equal(field(gate[5],key,10),value);
 assert.match(gate[5],/git\(\['ls-tree','--name-only','HEAD','--',path\]\)/);assert.doesNotMatch(gate[5],/hashFiles|existsSync/);
 assert.equal(field(deploy,'APP_IMAGE_DIGEST',10),'${{ needs.build-and-push.outputs.image_digest }}');
 assert.doesNotMatch(gate.join('\n')+deploy,/docker\s+(?:build\b|buildx\s+build\b)|uses: docker\/build-push-action/);
}
test('published-image workflow gates deploy on the same pushed digest and preserves failed-run evidence',()=>{
 assertPublishedWorkflowGate(read('.github/workflows/deploy.yml'));
 const runner=read('scripts/yard-production-acceptance.mjs');
 for(const [key,value]of Object.entries({unexpected:0,flaky:0,skipped:0,expected:9}))assert.match(runner,new RegExp(`report\\.stats\\.${key},${value}`));
 assert.match(runner,/Report must belong to this exact run and image pair/);assert.match(runner,/completedProof&&!process\.exitCode/);
});
test('published-image workflow rejects moved, bypassed, mutable, rebuilt or evidence-dropping gates',()=>{
 const source=read('.github/workflows/deploy.yml'),active="hashFiles('game-logic/yard-v2/active-release-contract.json') != ''",captured="steps.published_yard.outputs.mode == 'ACTIVE'";
 assertPublishedWorkflowGate(source);
 const changes=[
  ['    needs: build-and-push','    needs: validate'],
  ['      image_digest: ${{ steps.build_image.outputs.digest }}','      image_digest: latest'],
  ['          APP_IMAGE_DIGEST: ${{ needs.build-and-push.outputs.image_digest }}','          APP_IMAGE_DIGEST: sha256:other'],
  ['          YARD_ACTIVE_DIGEST: ${{ steps.build_image.outputs.digest }}','          YARD_ACTIVE_DIGEST: latest'],
  ['@${YARD_ACTIVE_DIGEST}"',':latest"'],
  [`        if: ${active}`,"        if: false"],
  [`        if: always() && ${captured}`,`        if: ${captured}`],
  [`        if: ${captured}`,`        if: ${active}`],
  ['mode=ACTIVE\\nclosed_commit=','closed_commit='],
  ['timeout --kill-after=5s 60s git fetch --no-tags --depth=1 origin "$closed_commit"','true'],
  ['timeout --kill-after=5s 60s git fetch --no-tags --depth=1 origin "$closed_commit"','git fetch origin "$closed_commit"'],
  ['process.stdout.write(validateActivationInputs(contract.inputs).closed.buildId);','process.stdout.write(contract.inputs.closed.buildId);'],
  ['        run: node scripts/yard-production-acceptance.mjs','        run: node scripts/yard-production-acceptance.mjs || true'],
  ['        timeout-minutes: 18','        timeout-minutes: 1'],
  ['        timeout-minutes: 18','        continue-on-error: true\n        timeout-minutes: 18'],
  ['          path: test-results/yard-production/','          path: elsewhere/'],
  ['          if-no-files-found: error','          if-no-files-found: ignore'],
  ['        id: published_yard_proof','        id: optional_yard_proof'],
  ['          YARD_PROOF_OUTCOME: ${{ steps.published_yard_proof.outcome }}','          YARD_PROOF_OUTCOME: success'],
  ['          YARD_PROOF_MODE: ${{ steps.published_yard.outputs.mode }}','          YARD_PROOF_MODE: ACTIVE'],
  ['        if: always()\n        timeout-minutes: 1','        if: success()\n        timeout-minutes: 1'],
  ['      - name: Preserve published Yard digest acceptance evidence','      - name: Rebuild after proof\n        run: docker build .\n\n      - name: Preserve published Yard digest acceptance evidence'],
 ];
 for(const [before,after]of changes){assert.ok(source.includes(before),before);assert.throws(()=>assertPublishedWorkflowGate(source.replace(before,after)),before);}
 const start=source.indexOf('      - name: Set up Node for published Yard image acceptance'),end=source.indexOf('\n  deploy:',start),gate=source.slice(start,end),without=source.slice(0,start)+source.slice(end),push=without.indexOf('      - name: Build and push Docker image');
 assert.throws(()=>assertPublishedWorkflowGate(without.slice(0,push)+gate+without.slice(push)),'Acceptance must follow the registry push');
 assert.throws(()=>assertPublishedWorkflowGate(source.replace(/      - name: Require nine cases on the exact published Yard digest[\s\S]*?(?=      - name: Preserve published Yard digest acceptance evidence)/,'')),'The nine-case gate cannot disappear');
 assert.throws(()=>assertPublishedWorkflowGate(source.replace(/      - name: Require committed ACTIVE published-image proof[\s\S]*?(?=\n  deploy:)/,'')),'The unconditional final check cannot disappear');
});
test('shallow ancestry verification and captured mode cannot be reordered or disabled by dependency deletion',()=>{
 const source=read('.github/workflows/deploy.yml'),fetch='timeout --kill-after=5s 60s git fetch --no-tags --depth=1 origin "$closed_commit"',verify='node scripts/yard-active-contract.mjs "$PWD"';
 assertPublishedWorkflowGate(source);
 const reordered=source.replace(fetch+'\n          '+verify,verify+'\n          '+fetch);assert.notEqual(reordered,source);assert.throws(()=>assertPublishedWorkflowGate(reordered));
 const deleting=source.replace('          pnpm install --frozen-lockfile','          pnpm install --frozen-lockfile\n          rm game-logic/yard-v2/active-release-contract.json');
 // Deletion during preparation must still run the required proof (whose tracked
 // checkout guard then fails), and must still upload evidence after that failure.
 assertPublishedWorkflowGate(deleting);
 for(const name of ['Require nine cases on the exact published Yard digest','Preserve published Yard digest acceptance evidence']){
  const captured=name.startsWith('Preserve')?"always() && steps.published_yard.outputs.mode == 'ACTIVE'":"steps.published_yard.outputs.mode == 'ACTIVE'";
  const mutable=name.startsWith('Preserve')?"always() && hashFiles('game-logic/yard-v2/active-release-contract.json') != ''":"hashFiles('game-logic/yard-v2/active-release-contract.json') != ''";
  const label=name+'\n'+(name.startsWith('Require')?'        id: published_yard_proof\n':'');
  const changed=deleting.replace(label+'        if: '+captured,label+'        if: '+mutable);assert.notEqual(changed,deleting);assert.throws(()=>assertPublishedWorkflowGate(changed));
 }
 assert.match(read('scripts/yard-production-acceptance.mjs'),/Tracked checkout must be clean/);
});

test('final published proof uses committed HEAD and fails on missing mode, outcome, PASS or exact identities',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const workflow=read('.github/workflows/deploy.yml'),step=workflow.split('      - name: Require committed ACTIVE published-image proof\n')[1]?.split('\n  deploy:')[0];
 assert.ok(step,'The unconditional final check is required');
 const match=step.match(/          node --input-type=module <<'JS'\n([\s\S]*?)^          JS$/m);assert.ok(match);
 const script=match[1].split('\n').map(line=>line.slice(10)).join('\n'),dir=await mkdtemp(join(tmpdir(),'yard-final-proof-'));
 const git=args=>{const result=spawnSync('git',args,{cwd:dir,encoding:'utf8',timeout:5000});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 const run=values=>spawnSync(process.execPath,['--input-type=module'],{cwd:dir,input:script,encoding:'utf8',timeout:5000,env:{...process.env,NODE_OPTIONS:'',YARD_ACTIVE_DIGEST:activeDigest,YARD_PROOF_MODE:'',YARD_PROOF_OUTCOME:'',...values}});
 const contract=join(dir,'game-logic/yard-v2/active-release-contract.json'),pass=join(dir,'test-results/yard-production/PASS.json');
 try{
  git(['init','--quiet']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','--allow-empty','-m','CLOSED fixture']);
  const closed=git(['rev-parse','HEAD']);assert.equal(run({YARD_ACTIVE_COMMIT:closed}).status,0,'Committed CLOSED requires no Yard proof');
  await mkdir(join(dir,'game-logic/yard-v2'),{recursive:true});await writeFile(contract,'{}');
  assert.equal(run({YARD_ACTIVE_COMMIT:closed}).status,0,'An untracked contract cannot change the committed release mode');
  git(['add','game-logic/yard-v2/active-release-contract.json']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','ACTIVE fixture']);
  const active=git(['rev-parse','HEAD']),values={YARD_ACTIVE_COMMIT:active,YARD_PROOF_MODE:'ACTIVE',YARD_PROOF_OUTCOME:'success'};
  const proof={format:'cc-gh-yard-production-acceptance/v1',activeCommit:active,activeDigest,tests:9,retries:0};
  await mkdir(join(dir,'test-results/yard-production'),{recursive:true});await writeFile(pass,JSON.stringify(proof));
  assert.equal(run(values).status,0);
  await rm(contract);assert.equal(run(values).status,0,'Contract deletion does not change the committed ACTIVE requirement');
  for(const [key,value]of [['YARD_PROOF_MODE',''],['YARD_PROOF_MODE','CLOSED'],['YARD_PROOF_OUTCOME',''],['YARD_PROOF_OUTCOME','skipped'],['YARD_PROOF_OUTCOME','failure'],['YARD_PROOF_OUTCOME','cancelled'],['YARD_ACTIVE_COMMIT',closed],['YARD_ACTIVE_DIGEST',digest],['YARD_ACTIVE_DIGEST','']]){
   const result=run({...values,[key]:value});assert.notEqual(result.status,0,`${key}=${value} must fail even after contract deletion`);assert.equal(result.signal,null,result.stderr);
  }
  for(const changed of [{...proof,activeCommit:closed},{...proof,activeDigest:digest},{...proof,activeDigest:null},{...proof,tests:8},{...proof,retries:1},{}]){
   await writeFile(pass,JSON.stringify(changed));assert.notEqual(run(values).status,0);
  }
  await writeFile(pass,'malformed');assert.notEqual(run(values).status,0);await rm(pass);assert.notEqual(run(values).status,0,'Missing PASS cannot succeed');
 }finally{await rm(dir,{recursive:true,force:true});}
});

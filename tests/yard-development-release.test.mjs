import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, chmodSync, symlinkSync, linkSync, renameSync, unlinkSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseDevelopmentRecord, verifyDevelopmentReceipts, verifyImage, verifyApp, verifyHealth, verifyConfig, verifyProtected, sha256, PREDECESSOR, PREDECESSOR_TREE, CHECKS} from '../scripts/yard-development-contract.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serial = value => JSON.stringify(value)+'\n';
const id = letter => `sha256:${letter.repeat(64)}`;
const releaseIdentity = release => ({commit:release.commit,tree:release.tree,imageDigest:release.imageDigest,imageId:release.imageId});
function fixture(compose = 'services:\n  app:\n    image: old\n    env_file: [.env]\n') {
  const prior = {commit:PREDECESSOR,tree:PREDECESSOR_TREE,imageDigest:id('1'),imageId:id('2')};
  const candidate = {commit:'a'.repeat(40),tree:'b'.repeat(40),imageDigest:id('3'),imageId:id('4')};
  const proof = commit => ({runId:37220749198,runAttempt:1,status:'completed',conclusion:'success',headCommit:commit,artifactSha256:'c'.repeat(64)});
  const storage = {format:'yard-persistent/v1',readVersions:[1,2],writeVersions:[1,2],transition:'first-successful-canonical-placement-writes-v2',rollback:'old-image-preserves-bytes-and-quarantines-v2',compatibilityRequired:false,reset:'none'};
  const capabilities = {authority:'source-owned-authenticated-policy',clientGraph:true,itemKinds:['leaf_pot'],placementLimit:2,foodSocket:'bowl-1',canonicalVisitorAdmission:false,fixtureLoader:false,devAuth:false};
  const predecessorReceipt = {format:'cc-gh-yard-accepted-active/v1',repository:'le-who/cc-gh',repositoryId:1162268629,status:'accepted',release:prior,acceptance:proof(prior.commit),deployment:proof(prior.commit)};
  const candidateReceipt = {format:'cc-gh-yard-accepted-development/v1',repository:'le-who/cc-gh',repositoryId:1162268629,status:'accepted',release:candidate,predecessor:prior,acceptance:proof(candidate.commit),mode:'development-protocol-evolution',storage,capabilities,checks:CHECKS.map(name=>({name,status:'completed',conclusion:'success',attempts:1,release:candidate,predecessor:prior,artifactSha256:'d'.repeat(64)}))};
  const record = {format:'cc-gh-yard-development-release/v1',repository:'le-who/cc-gh',mode:'development-protocol-evolution',predecessor:{...prior,receiptSha256:sha256(serial(predecessorReceipt))},candidate:{...candidate,receiptSha256:sha256(serial(candidateReceipt))},storage,capabilities,runtime:{composeSha256:sha256(compose),localUrl:'http://127.0.0.1:18080/',publicUrl:'https://games.tri.mom/',dbUser:'appuser',dbName:'gamehub',protectedServices:['caddy.service','neighbor-worker.service'],neighborPublicHealth:'not-proven'}};
  return {record, predecessorReceipt, candidateReceipt, compose};
}
const parse = record => parseDevelopmentRecord(serial(record),sha256(serial(record)));
test('development record explicitly permits v2 and records old-image quarantine without reset',()=>{
  const f=fixture(); assert.equal(parse(f.record).mode,'development-protocol-evolution');
  assert.equal(verifyDevelopmentReceipts(f.record,serial(f.predecessorReceipt),serial(f.candidateReceipt)),true);
});
test('approval hash cannot be obtained implicitly from candidate bytes',()=>assert.throws(()=>parseDevelopmentRecord(serial(fixture().record),'0'.repeat(64)),/approved bytes/));
for (const [name, change] of [
  ['maintenance disguise', r=>r.mode='same-format-no-migration'],
  ['unreviewed predecessor', r=>r.predecessor.commit='e'.repeat(40)],
  ['database reset',r=>r.storage.reset='now'],
  ['rollback compatibility claim',r=>r.storage.rollback='fully-compatible'],
  ['client enablement authority',r=>r.capabilities.authority='query-string'],
  ['fixture loader',r=>r.capabilities.fixtureLoader=true],
  ['canonical visitor admission',r=>r.capabilities.canonicalVisitorAdmission=true],
  ['foreign public target',r=>r.runtime.publicUrl='https://neighbor.invalid/'],
  ['invented neighbor-health claim',r=>r.runtime.neighborPublicHealth='healthy'],
]) test(`rejects ${name}`,()=>{const {record}=fixture();change(record);assert.throws(()=>parse(record));});
for (const [name, change] of [
  ['missing capability case',f=>f.candidateReceipt.checks.pop()],
  ['different digest',f=>f.candidateReceipt.checks[0].release={...f.candidateReceipt.release,imageDigest:id('f')}],
  ['hidden retry',f=>f.candidateReceipt.checks[0].attempts=2],
  ['unsuccessful prior deployment',f=>f.predecessorReceipt.deployment.conclusion='failure'],
]) test(`rejects acceptance ${name}`,()=>{
  const f=fixture();change(f);f.record.predecessor.receiptSha256=sha256(serial(f.predecessorReceipt));f.record.candidate.receiptSha256=sha256(serial(f.candidateReceipt));
  assert.throws(()=>verifyDevelopmentReceipts(f.record,serial(f.predecessorReceipt),serial(f.candidateReceipt)));
});
test('health independently binds image, service, exact build, both dependencies and authentication',()=>{
  const {candidate}=fixture().record;
  const image={id:candidate.imageId,repoDigests:[`ghcr.io/le-who/cc-gh@${candidate.imageDigest}`],revision:candidate.commit,command:['node','server.js']};
  verifyImage(image,candidate);assert.throws(()=>verifyImage({...image,id:id('f')},candidate));
  const app={image:candidate.imageId,name:'/ccgh-app',project:'ccgh',service:'app',running:true,status:'running'};
  verifyApp(app,candidate);assert.throws(()=>verifyApp({...app,project:'neighbor'},candidate));
  const health={status:'ok',buildId:candidate.commit,postgres:true,redis:true};verifyHealth(health,candidate);
  for(const change of [{buildId:PREDECESSOR},{redis:false},{postgres:false},{status:'degraded'}])assert.throws(()=>verifyHealth({...health,...change},candidate));
  verifyConfig({buildId:candidate.commit,telegramAuthRequired:true,devAuthEnabled:false},candidate);
  assert.throws(()=>verifyConfig({buildId:candidate.commit,telegramAuthRequired:false,devAuthEnabled:true},candidate));
});
test('protected host/neighbor changes fail even when application is healthy',()=>{
  const snapshot={bootId:'11111111-2222-3333-4444-555555555555',services:[{name:'caddy.service',LoadState:'loaded',ActiveState:'active',MainPID:'100',ExecMainStartTimestampMonotonic:'500'}],containers:[{id:'1',image:'2',status:'running',restartCount:0}]};
  verifyProtected(snapshot,structuredClone(snapshot));
  for(const mutate of [x=>x.bootId='22222222-2222-3333-4444-555555555555',x=>x.services[0].MainPID='101',x=>x.containers[0].restartCount=1]){const changed=structuredClone(snapshot);mutate(changed);assert.throws(()=>verifyProtected(snapshot,changed));}
});
test('CLI failure does not serialize private neighbor comparison values',()=>{
  const directory=mkdtempSync(resolve(tmpdir(),'yard-private-proof-'));
  try {
    const before={bootId:'11111111-2222-3333-4444-555555555555',services:[{name:'caddy.service',LoadState:'loaded',ActiveState:'active',MainPID:'100'}],containers:[{id:'PRIVATE_NEIGHBOR_ID',name:'PRIVATE_NEIGHBOR_NAME',restartCount:0}]};
    const after=structuredClone(before);after.containers[0].restartCount=1;
    writeFileSync(resolve(directory,'before.json'),serial(before));writeFileSync(resolve(directory,'after.json'),serial(after));
    const r=spawnSync(process.execPath,[resolve(root,'scripts/yard-development-contract.mjs'),'protected',resolve(directory,'before.json'),resolve(directory,'after.json')],{encoding:'utf8'});
    assert.equal(r.status,1);assert.doesNotMatch(r.stdout+r.stderr,/PRIVATE_NEIGHBOR/);assert.match(r.stderr,/protected container\/service/);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

// Every external executable below is a deterministic local fake. No Docker,
// network request, service operation, server, image build or deployment is run.
const mockSource = String.raw`
import {readFileSync,writeFileSync,appendFileSync,readdirSync,chmodSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const cfg=JSON.parse(readFileSync(CONFIG));
const tool=TOOL,args=process.argv.slice(2),state=JSON.parse(readFileSync(cfg.state));
const say=x=>process.stdout.write(typeof x==='string'?x+'\n':JSON.stringify(x)+'\n');
const save=()=>writeFileSync(cfg.state,JSON.stringify(state));
appendFileSync(cfg.trace,JSON.stringify({tool,args,which:state.which,compose:process.env.COMPOSE_FILE||null})+'\n');
const fail=()=>process.exit(1), current=()=>cfg.record[state.which];
if(tool==='sleep')process.exit(0);
if(tool==='rm'){
 const target=args.at(-1);if(args[0]!=='--'||!target.startsWith(cfg.release+'/'))throw Error('Unscoped local removal');
 unlinkSync(target);
 if(cfg.scenario==='signal-after-marker-clear'&&target===cfg.release+'/.yard-development-inflight'&&state.which==='candidate'){
  state.signalAfterMarkerClear=true;save();process.kill(process.ppid,'SIGTERM');
 }
 process.exit(0);
}
if(tool==='systemctl'){say('Id='+args[1]+'\nLoadState=loaded\nActiveState=active\nSubState=running\nMainPID=100\nExecMainStartTimestampMonotonic=500');process.exit(0);}
if(tool==='curl'){
 if(args[0]!=='--disable'||args[1]!=='--noproxy'||args[2]!=='*')throw Error('Health request can inherit curl configuration or a proxy');
 const url=args.at(-1),r=current();
 if(cfg.scenario==='pre-health'&&state.switches===0)fail();
 if(state.which==='candidate'&&(cfg.scenario==='candidate-local'&&url.startsWith('http:')||cfg.scenario==='candidate-public'&&url.startsWith('https:')))fail();
 if(state.which==='predecessor'&&state.switches>0&&cfg.scenario==='rollback-unhealthy')fail();
 const buildId=cfg.scenario==='stale-public'&&state.which==='candidate'&&url.startsWith('https:')?cfg.record.predecessor.commit:r.commit;
 if(url.endsWith('/api/health'))say({status:'ok',buildId,postgres:true,redis:true});
 else if(url.endsWith('/api/config'))say({buildId,telegramAuthRequired:true,devAuthEnabled:false});
 else say('<script>window.__APP_BUILD_ID__="'+buildId+'"</script>');
 process.exit(0);
}
if(tool!=='docker')throw Error('Unknown fake tool');
if(args[0]==='context'){
 if(args[1]==='show')say(cfg.scenario==='remote-context'?'remote':'default');
 else say('unix:///var/run/docker.sock');
 process.exit(0);
}
if(args[0]==='compose'){
 if(args[1]==='version'){if(cfg.scenario==='no-compose')fail();say('Docker Compose fake');process.exit(0);}
 if(JSON.stringify(args)===JSON.stringify(['compose','-p','ccgh','config','--hash','app'])){
  const selector=process.env.COMPOSE_FILE.includes('candidate.json')?'candidate':process.env.COMPOSE_FILE.includes('predecessor.json')?'predecessor':'live';
  say('app '+({candidate:'7',predecessor:'8',live:'6'}[selector]).repeat(64));process.exit(0);
 }
 if(JSON.stringify(args)!==JSON.stringify(['compose','-p','ccgh','up','-d','--no-deps','app']))throw Error('Forbidden compose command');
 const files=process.env.COMPOSE_FILE.split(':'),over=JSON.parse(readFileSync(files[1]));
 if(Object.keys(over).join()!=='services'||Object.keys(over.services).join()!=='app'||Object.keys(over.services.app).sort().join()!=='environment,image'||Object.keys(over.services.app.environment).join()!=='APP_BUILD_ID')throw Error('Unscoped override');
 const which=over.services.app.image===cfg.record.predecessor.imageId?'predecessor':'candidate';
 state.switches++;state.which=which;state.configSelector=which;save();
 if(which==='candidate'&&cfg.scenario==='switch-timeout-repeat'){state.which='predecessor';state.configSelector='live';state.pendingDaemonOperation=true;save();process.exit(124);}
 if(which==='candidate'&&cfg.scenario==='switch-timeout')process.exit(124);
 if(which==='candidate'&&['during-switch','rollback-unhealthy','rollback-command'].includes(cfg.scenario))fail();
 if(which==='predecessor'&&cfg.scenario==='rollback-command')fail();
 process.exit(0);
}
if(args[0]==='run'){
 if(!args.includes('--read-only')||!args.includes('none')||!args.includes('no-new-privileges'))throw Error('Verifier not isolated');
 const mounts=[];for(let i=0;i<args.length;i++)if(args[i]==='--mount'){const fields=Object.fromEntries(args[++i].split(',').map(x=>x.split('=')));mounts.push([fields.dst,fields.src]);}
 const map=p=>{if(p==='/packet')return cfg.packet;for(const [dest,src] of mounts)if(p===dest||p.startsWith(dest+'/'))return src+p.slice(dest.length);return p;};
 const index=args.indexOf('/tools/yard-development-contract.mjs');
 if(index<0)throw Error('Only trusted verifier is allowed');
 const scriptArgs=args.slice(index).map(map);
 const sub=spawnSync(process.execPath,scriptArgs,{encoding:'utf8'});
 process.stdout.write(sub.stdout||'');process.stderr.write(sub.stderr||'');process.exit(sub.status??1);
}
if(args[0]==='image'&&args[1]==='tag'){
 state.tagged=true;save();
 if(cfg.scenario==='backup-corruption')for(const name of readdirSync(cfg.release+'/backups'))if(name.endsWith('.dump')){chmodSync(cfg.release+'/backups/'+name,0o600);appendFileSync(cfg.release+'/backups/'+name,'CORRUPTED AFTER CATALOG AND HASH');state.backupCorrupted=true;save();}
 process.exit(0);
}
if(args[0]==='image'&&args[1]==='inspect'){
 const target=args[2],r=target===cfg.record.predecessor.imageId||target.includes(':rollback-')?cfg.record.predecessor:cfg.record.candidate,format=args.at(-1);
 if(format==='{{.Id}}')say(r.imageId);
 else if(format.includes('index .Config.Labels')&&!format.startsWith('{"'))say(r.commit);
 else if(format.includes('range .RepoDigests'))say('ghcr.io/le-who/cc-gh@'+r.imageDigest);
 else say({id:cfg.scenario==='wrong-candidate-image'&&r===cfg.record.candidate?'sha256:'+'f'.repeat(64):r.imageId,repoDigests:['ghcr.io/le-who/cc-gh@'+r.imageDigest],revision:r.commit,command:['node','server.js']});
 process.exit(0);
}
if(args[0]==='ps'){say(['8','9','a','b'].map(c=>c.repeat(64)).join('\n'));process.exit(0);}
if(args[0]==='inspect'){
 const target=args.at(-1),format=args[2],app=target==='ccgh-app'||target==='8'.repeat(64),name=app?'/ccgh-app':target==='9'.repeat(64)?'/ccgh-postgres':target==='a'.repeat(64)?'/ccgh-redis':'/neighbor-app';
 if(cfg.scenario==='neighbor-disappears'&&target==='b'.repeat(64)){process.stderr.write('PRIVATE_NEIGHBOR_ID is missing\n');fail();}
 if(format==='{{.Image}}')say(cfg.scenario==='wrong-predecessor'?'sha256:'+'f'.repeat(64):current().imageId);
 else if(format.includes('com.docker.compose.config-hash'))say((cfg.scenario==='config-drift'||cfg.scenario==='candidate-config-drift'&&state.which==='candidate'?'9':{candidate:'7',predecessor:'8',live:'6'}[state.configSelector||'live']).repeat(64));
 else if(format==='{{.Name}}')say(name);
  else if(app)say({image:current().imageId,name,project:'ccgh',service:'app',running:true,status:'running',boundary:{ports:{'8080/tcp':[{HostIp:'127.0.0.1',HostPort:cfg.scenario==='candidate-port-drift'&&state.which==='candidate'?'18081':'18080'}]},mounts:[],networkNames:'ccgh-internal;',networkMode:'ccgh-internal',restartPolicy:{Name:'unless-stopped',MaximumRetryCount:0}}});
 else say({id:target,image:'sha256:'+'5'.repeat(64),name,startedAt:'2026-10-06T00:00:00Z',restartCount:cfg.scenario==='neighbor-drift'&&state.switches>0?1:0,status:'running',health:'healthy'});
 process.exit(0);
}
if(args[0]==='exec'){
 if(args.includes('pg_dump')){if(cfg.scenario==='backup-fail')fail();say('FAKE PRIVATE ARCHIVE');process.exit(0);}
 if(args.includes('pg_restore')&&args.includes('--list')){if(cfg.scenario==='backup-invalid')fail();readFileSync(0);process.exit(0);}
}
throw Error('Unexpected Docker operation: '+JSON.stringify(args));
`;
function runShell(scenario='success') {
  const directory=mkdtempSync(resolve(tmpdir(),'yard-release-fake-'));
  const bin=resolve(directory,'bin'),release=resolve(directory,'live'),packet=resolve(release,'releases','packet'),scripts=resolve(packet,'scripts');
  for(const path of [bin,release,packet,scripts,resolve(release,'backups')])mkdirSync(path,{recursive:true});
  const f=fixture(), config=resolve(directory,'fake-config.json'),state=resolve(directory,'state.json'),trace=resolve(directory,'trace.ndjson');
  writeFileSync(resolve(release,'docker-compose.yml'),f.compose);writeFileSync(resolve(release,'.env'),'SENTINEL_SECRET_NEVER_READ_BY_TEST=keep\n');
  writeFileSync(resolve(release,'.release.lock'),'KEEP_LOCK_BYTES\n');
  const productionSource=readFileSync(resolve(root,'scripts/ccgh-app-development-release.sh'),'utf8');
  const rootDeclaration='readonly authorized_release_root=/opt/game-hub';
  assert.equal(productionSource.split(rootDeclaration).length,2,'Test instrumentation must change exactly one fixed production root constant');
  const testScript=resolve(scripts,'ccgh-app-development-release.sh');
  writeFileSync(testScript,productionSource.replace(rootDeclaration,`readonly authorized_release_root='${release}'`));
  writeFileSync(resolve(scripts,'yard-development-contract.mjs'),readFileSync(resolve(root,'scripts/yard-development-contract.mjs')));
  writeFileSync(resolve(packet,'development-record.json'),serial(f.record));writeFileSync(resolve(packet,'candidate-receipt.json'),serial(f.candidateReceipt));writeFileSync(resolve(packet,'predecessor-receipt.json'),serial(f.predecessorReceipt));
  writeFileSync(state,serial({which:'predecessor',switches:0}));writeFileSync(trace,'');writeFileSync(config,serial({record:f.record,scenario,state,trace,packet,release}));
  for(const tool of ['docker','curl','systemctl','sleep','rm']){
    const path=resolve(bin,tool);writeFileSync(path,`#!${process.execPath}\nconst CONFIG=${JSON.stringify(config)};const TOOL=${JSON.stringify(tool)};\n${mockSource}`);chmodSync(path,0o700);
  }
  const sibling=resolve(directory,'sibling-sentinel');writeFileSync(sibling,'KEEP_NEIGHBOR_BYTES\n');
  if(scenario==='lock-symlink'){unlinkSync(resolve(release,'.release.lock'));symlinkSync(sibling,resolve(release,'.release.lock'));}
  if(scenario==='lock-hardlink'){unlinkSync(resolve(release,'.release.lock'));linkSync(sibling,resolve(release,'.release.lock'));}
  if(scenario==='backup-symlink'){renameSync(resolve(release,'backups'),resolve(directory,'neighbor-backups'));symlinkSync(resolve(directory,'neighbor-backups'),resolve(release,'backups'),'dir');}
  for(const [name,path] of [['compose-symlink',resolve(release,'docker-compose.yml')],['env-symlink',resolve(release,'.env')],['verifier-symlink',resolve(scripts,'yard-development-contract.mjs')],['record-symlink',resolve(packet,'development-record.json')]])if(scenario===name){const target=resolve(directory,name);renameSync(path,target);symlinkSync(target,path);}
  if(scenario==='packet-symlink'){renameSync(packet,resolve(directory,'actual-packet'));symlinkSync(resolve(directory,'actual-packet'),packet,'dir');}
  if(scenario==='root-symlink'){renameSync(release,resolve(directory,'actual-live'));symlinkSync(resolve(directory,'actual-live'),release,'dir');}
  const env={PATH:`${bin}:/usr/bin:/bin`,HOME:directory,...(scenario==='docker-config-override'?{DOCKER_CONFIG:resolve(directory,'alternate-docker-config')}:{})};
  const result=spawnSync('bash',[scenario==='unauthorized-root'?resolve(root,'scripts/ccgh-app-development-release.sh'):testScript,packet,sha256(serial(f.record)),release,f.record.predecessor.imageId,f.record.predecessor.imageDigest],{encoding:'utf8',timeout:120000,env});
  const callsBeforeRepeat=readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).length;
  const repeated=scenario==='switch-timeout-repeat'?spawnSync('bash',[testScript,packet,sha256(serial(f.record)),release,f.record.predecessor.imageId,f.record.predecessor.imageDigest],{encoding:'utf8',timeout:120000,env}):null;
  const calls=readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse), final=JSON.parse(readFileSync(state));
  assert.equal(readFileSync(resolve(release,'docker-compose.yml'),'utf8'),f.compose);
  assert.equal(readFileSync(resolve(release,'.env'),'utf8'),'SENTINEL_SECRET_NEVER_READ_BY_TEST=keep\n');
  assert.equal(readFileSync(sibling,'utf8'),'KEEP_NEIGHBOR_BYTES\n');
  if(!['lock-symlink','lock-hardlink'].includes(scenario))assert.equal(readFileSync(resolve(release,'.release.lock'),'utf8'),'KEEP_LOCK_BYTES\n');
  const work=readdirSync(release).find(name=>name.startsWith('development-release.'));
  const resultText=work&&readdirSync(resolve(release,work)).includes('result.txt')?readFileSync(resolve(release,work,'result.txt'),'utf8'):null;
  const privateErrors=work&&readdirSync(resolve(release,work)).includes('operations.stderr.log')?readFileSync(resolve(release,work,'operations.stderr.log'),'utf8'):null;
  const answer={...result,calls,final,resultText,privateErrors,repeated,repeatCalls:calls.slice(callsBeforeRepeat),markerExists:existsSync(resolve(release,'.yard-development-inflight')),backups:readdirSync(resolve(release,'backups'))};
  rmSync(directory,{recursive:true,force:true});return answer;
}
test('shell success changes only app image/build identity and preserves original compose/env',()=>{
  const r=runShell();assert.equal(r.status,0,r.stderr);assert.equal(r.final.which,'candidate');assert.equal(r.final.tagged,true);
  const switches=r.calls.filter(x=>x.tool==='docker'&&x.args.includes('up'));assert.equal(switches.length,1);
  assert.deepEqual(switches[0].args,['compose','-p','ccgh','up','-d','--no-deps','app']);
  assert.match(r.resultText,/neighbor-application-health-not-proven/);assert.equal(r.backups.length,2);
  assert.equal(r.markerExists,false);
  assert.ok(!JSON.stringify(r.calls).includes('SENTINEL_SECRET'));
});
for(const scenario of ['unauthorized-root','root-symlink','packet-symlink','lock-symlink','lock-hardlink','backup-symlink','compose-symlink','env-symlink','verifier-symlink','record-symlink','docker-config-override','backup-corruption','config-drift','remote-context','no-compose','wrong-predecessor','wrong-candidate-image','pre-health','backup-fail','backup-invalid'])test(`shell ${scenario} fails before replacing any app`,()=>{
  const r=runShell(scenario);assert.notEqual(r.status,0);assert.equal(r.final.switches,0,r.stderr);
  if(scenario==='backup-corruption')assert.equal(r.final.backupCorrupted,true,'Negative case must reach post-catalog corruption');
});
test('disappearing neighbor details stay in private evidence rather than public stderr',()=>{
  const r=runShell('neighbor-disappears');assert.notEqual(r.status,0);assert.equal(r.final.switches,0);
  assert.doesNotMatch(r.stderr+r.stdout,/PRIVATE_NEIGHBOR_ID/);assert.match(r.privateErrors,/PRIVATE_NEIGHBOR_ID/);
});
test('Compose timeout stays unverified and does not launch a competing rollback',()=>{
  const r=runShell('switch-timeout');assert.equal(r.status,70);assert.equal(r.final.switches,1);assert.equal(r.resultText,null);
  assert.match(r.stderr,/COMPOSE OUTCOME UNVERIFIED/);assert.equal(r.markerExists,true);
});
test('a later invocation refuses unresolved daemon work despite a stale healthy predecessor',()=>{
  const r=runShell('switch-timeout-repeat');assert.equal(r.status,70);assert.equal(r.repeated.status,70);assert.equal(r.final.which,'predecessor');
  assert.equal(r.final.pendingDaemonOperation,true);assert.equal(r.final.switches,1);assert.equal(r.markerExists,true);assert.deepEqual(r.repeatCalls,[]);
  assert.match(r.repeated.stderr,/previous development replacement remains unresolved/);
});
test('signal immediately after clearing a verified candidate marker cannot start an unmarked rollback',()=>{
  const r=runShell('signal-after-marker-clear');assert.equal(r.status,143);assert.equal(r.final.signalAfterMarkerClear,true);
  assert.equal(r.final.switches,1);assert.equal(r.final.which,'candidate');assert.equal(r.markerExists,false);
  assert.match(r.resultText,/candidate-healthy/);assert.match(r.stderr,/Candidate health was verified; finalization was interrupted/);
});
for(const scenario of ['candidate-port-drift','candidate-config-drift','during-switch','candidate-local','candidate-public','stale-public'])test(`shell ${scenario} performs actual healthy predecessor rollback`,()=>{
  const r=runShell(scenario);assert.notEqual(r.status,0);assert.notEqual(r.status,70,r.stderr);assert.equal(r.final.which,'predecessor');assert.equal(r.final.switches,2);
  assert.match(r.resultText,/rollback-healthy/);
  assert.equal(r.markerExists,false);
  assert.ok(r.calls.some(x=>x.tool==='curl'&&x.which==='predecessor'&&x.args.at(-1)==='https://games.tri.mom/api/health'));
  for(const call of r.calls.filter(x=>x.tool==='docker'&&x.args.includes('up')))assert.deepEqual(call.args,['compose','-p','ccgh','up','-d','--no-deps','app']);
});
for(const scenario of ['rollback-unhealthy','rollback-command','neighbor-drift'])test(`shell ${scenario} refuses a false recovered claim`,()=>{
  const r=runShell(scenario);assert.equal(r.status,70,r.stderr);assert.equal(r.resultText,null);assert.match(r.stderr,/ROLLBACK FAILED OR UNVERIFIED/);
  assert.equal(r.markerExists,true);
});
test('shell has no host installation, registry login, unrelated deletion, environment dump or database restore',()=>{
  const source=readFileSync(resolve(root,'scripts/ccgh-app-development-release.sh'),'utf8');
  for(const prohibited of [/--remove-orphans/,/\bprune\b/,/apt-get/,/\byum\b/,/\breboot\b/,/\bshutdown\b/,/systemctl\s+(restart|reload|stop)/,/docker\s+(login|rm|build|pull)/,/\.Config\.Env/,/source\s+.*\.env/,/cat\s+.*\.env/])assert.doesNotMatch(source,prohibited);
  assert.match(source,/pg_restore --list/);assert.doesNotMatch(source,/pg_restore[^\n]*--clean/);
});

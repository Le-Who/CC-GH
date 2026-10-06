import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {yardReleaseCompatibility} from '../scripts/yard-release-compatibility.mjs';
import {verifyYardRollbackTarget,KNOWN_LEGACY_YARD_BUILD} from '../scripts/verify-yard-rollback-target.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),build='a'.repeat(40),previousBuild=KNOWN_LEGACY_YARD_BUILD,digest='sha256:'+'c'.repeat(64),priorDigest='sha256:'+'d'.repeat(64),previousId='sha256:'+'e'.repeat(64),repo='le-who/cc-gh';
const image=(Id,sha,revision)=>({Id,RepoDigests:[`ghcr.io/${repo}@${sha}`],Config:{Labels:{'org.opencontainers.image.revision':revision}}});
// Synthetic phase declarations exercise the verifier, not historical image proof.
// The factory's build argument labels the current code; it cannot load CLOSED code.
function closedManifest(buildId){return {format:'cc-gh-yard-release-compatibility/v1',buildId,policyRevision:'yard-player-rollout/closed-r1',playerRolloutEnabled:false,readableStorageFormats:['yard-persistent/v1'],closedQuarantineVerified:true,requiredClosedPredecessor:null,requiredLegacyPredecessor:{buildId:previousBuild,imageDigest:priorDigest}};}
function fixture(){return {candidate:closedManifest(build),previous:null,previousHealth:{status:'ok',buildId:previousBuild},candidateImage:image('sha256:'+'f'.repeat(64),digest,build),previousImage:image(previousId,priorDigest,previousBuild),repository:repo,candidateDigest:digest,candidateBuildId:build,previousImageId:previousId,previousBuildId:previousBuild,persistentYardRows:0};}
function activation(){const f=fixture(),closedBuild='b'.repeat(40);f.previousBuildId=closedBuild;f.previousHealth.buildId=closedBuild;f.previousImage=image(previousId,priorDigest,closedBuild);f.candidate={...f.candidate,policyRevision:'yard-player-rollout/active-r1',playerRolloutEnabled:true,closedQuarantineVerified:false,requiredClosedPredecessor:{buildId:closedBuild,imageDigest:priorDigest}};f.previous=closedManifest(closedBuild);f.persistentYardRows=7;return f;}
function activationFromLegacy(){return {...fixture(),candidate:activation().candidate};}
const ready=f=>({status:'ready',phase:f.candidate.playerRolloutEnabled?'activation':'closed-compatible',persistentYardRows:f.persistentYardRows});
const errors={markers:'Existing persistent Yard markers forbid rollback to an unaware image',legacy:'Unaware rollback target must pin the known non-v2-writing legacy release',digest:'Pinned repository image digest is not present',revision:'Image source revision does not match the release build',healthy:'Exact prior application must be healthy before switching',closed:'Activation rollback target must be proven closed and quarantine-aware',quarantine:'Closed image quarantine proof is missing',predecessor:'Activation requires a code-owned exact closed predecessor',build:'Prior build is not the reviewed closed predecessor',count:'Valid read-only Yard marker count required',changed:'Running prior image identity changed',capability:'Invalid image-owned Yard compatibility declaration',identity:'Exact release and rollback identities are required'};
function rejectsMutations(make,cases){for(const [mutate,message]of cases){const f=make();assert.deepEqual(verifyYardRollbackTarget(f),ready(f),'negative case must start from a valid phase');mutate(f);assert.throws(()=>verifyYardRollbackTarget(f),{message});}}
test('image-owned command derives current ACTIVE policy and its exact contract predecessor without external state',()=>{
 const manifest=yardReleaseCompatibility(build),contract=JSON.parse(fs.readFileSync(path.join(root,'game-logic/yard-v2/active-release-contract.json'),'utf8'));
 assert.equal(manifest.buildId,build);assert.equal(manifest.policyRevision,'yard-player-rollout/active-r1');assert.equal(manifest.playerRolloutEnabled,true);assert.equal(manifest.closedQuarantineVerified,false);
 assert.deepEqual(manifest.requiredClosedPredecessor,{buildId:contract.inputs.closed.buildId,imageDigest:contract.inputs.closed.imageDigest});
 assert.deepEqual(manifest.requiredLegacyPredecessor,{buildId:KNOWN_LEGACY_YARD_BUILD,imageDigest:'sha256:729955b34481c629980e5a04606a88531d9ba1691e69312c9dcd366571e4380d'});assert.deepEqual(manifest.readableStorageFormats,['yard-persistent/v1']);assert.throws(()=>yardReleaseCompatibility('latest'),{message:'Exact image build identity required'});
 const source=fs.readFileSync(path.join(root,'scripts/yard-release-compatibility.mjs'),'utf8');assert.doesNotMatch(source,/DATABASE_URL|fetch\(|getDb\(|writeFile|process\.env\.(?:YARD|ROLLOUT)/);
});
test('phase one permits an unaware rollback image only with exactly zero persistent markers',()=>{assert.deepEqual(verifyYardRollbackTarget(fixture()),{status:'ready',phase:'closed-compatible',persistentYardRows:0});rejectsMutations(fixture,[1,100].map(count=>[f=>f.persistentYardRows=count,errors.markers]));});
test('phase one rejects absent or arbitrary legacy bootstrap identities despite zero markers',()=>{rejectsMutations(fixture,[
 [f=>f.candidate.requiredLegacyPredecessor=null,errors.legacy],
 [f=>f.candidate.requiredLegacyPredecessor.buildId='8'.repeat(40),errors.legacy],
 [f=>f.candidate.requiredLegacyPredecessor.imageDigest='sha256:'+'8'.repeat(64),errors.digest],
 [f=>f.previousBuildId='8'.repeat(40),errors.healthy],
 [f=>{f.previousBuildId='8'.repeat(40);f.previousHealth.buildId=f.previousBuildId;f.previousImage.Config.Labels['org.opencontainers.image.revision']=f.previousBuildId;},errors.legacy],
 [f=>f.previousImage.RepoDigests=[],errors.digest],
 [f=>f.previousImage.Config.Labels['org.opencontainers.image.revision']='8'.repeat(40),errors.revision],
]);});
test('phase two requires the exact healthy closed and quarantine-proven predecessor',()=>{assert.deepEqual(verifyYardRollbackTarget(activation()),{status:'ready',phase:'activation',persistentYardRows:7});rejectsMutations(activation,[
 [f=>f.previous=null,errors.markers],
 [f=>f.previous.playerRolloutEnabled=true,errors.closed],
 [f=>f.previous.closedQuarantineVerified=false,errors.quarantine],
 [f=>f.candidate.requiredClosedPredecessor=null,errors.predecessor],
 [f=>f.candidate.requiredClosedPredecessor.buildId='9'.repeat(40),errors.build],
 [f=>f.candidate.requiredClosedPredecessor.imageDigest='sha256:'+'9'.repeat(64),errors.digest],
 [f=>f.previousHealth.status='degraded',errors.healthy],
 [f=>f.previousHealth.buildId='9'.repeat(40),errors.healthy],
]);});
test('current ACTIVE manifests still reject an ACTIVE rollback target',()=>{
 const f=activation();assert.deepEqual(verifyYardRollbackTarget(f),ready(f));
 f.candidate=yardReleaseCompatibility(f.candidateBuildId);f.previous=yardReleaseCompatibility(f.previousBuildId);
 assert.equal(f.candidate.playerRolloutEnabled,true);assert.equal(f.previous.playerRolloutEnabled,true);assert.equal(f.previous.closedQuarantineVerified,false);
 assert.throws(()=>verifyYardRollbackTarget(f),{message:errors.closed});
});
test('missing counts and mismatched immutable image/source identities fail closed',()=>{rejectsMutations(fixture,[
 ...[-1,'0',NaN,Number.MAX_SAFE_INTEGER+1].map(count=>[f=>f.persistentYardRows=count,errors.count]),
 [f=>f.candidateImage.RepoDigests=[],errors.digest],
 [f=>f.candidateImage.Config.Labels['org.opencontainers.image.revision']='9'.repeat(40),errors.revision],
 [f=>f.previousImage.Id='sha256:'+'9'.repeat(64),errors.changed],
 [f=>f.candidate.format='unknown',errors.capability],
 [f=>f.candidate.closedQuarantineVerified=false,errors.quarantine],
 [f=>f.repository='../../other',errors.identity],
]);});
test('deploy checks compatibility and pins rollback image strictly before any live switch',()=>{const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8'),guard=deploy.indexOf('            bash scripts/yard-pre-switch-guard.sh'),stale=deploy.indexOf('            STALE_APP_CONTAINERS='),switchAt=deploy.indexOf('            RELEASE_SWITCH_STARTED=1');assert.ok(guard>deploy.indexOf('            compose -p ccgh pull app'));assert.ok(guard<stale&&stale<switchAt);assert.ok(deploy.indexOf('flock -n 9')<deploy.indexOf('            RELEASE_SWITCH_STARTED=0'));assert.match(deploy,/yard-rollback-\$\{PREVIOUS_BUILD_ID\}/);assert.match(deploy,/source: "docker-compose.yml,scripts\/yard-pre-switch-guard.sh"/);const shell=fs.readFileSync(path.join(root,'scripts/yard-pre-switch-guard.sh'),'utf8');assert.match(shell,/timeout --foreground --kill-after=5s 30s docker/);assert.equal((shell.match(/default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000/g)||[]).length,2);assert.match(shell,/SELECT count\(\*\) FROM players WHERE data \? '_yardV2'/);assert.doesNotMatch(shell,/SELECT \* FROM|INSERT INTO|UPDATE players|DELETE FROM|pg_restore|compose.*up|DATABASE_URL|POSTGRES_PASSWORD/);});

const dockerStub=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process'),p=process.env.TEST_FIXTURES,f=JSON.parse(fs.readFileSync(p+'/input.json','utf8')),a=process.argv.slice(2);fs.appendFileSync(p+'/calls.jsonl',JSON.stringify(a)+'\n');
const out=x=>process.stdout.write(JSON.stringify(x)+'\n');
const observe=x=>fs.appendFileSync(p+'/observations.jsonl',JSON.stringify(x)+'\n');
if(a[0]==='image'&&a[1]==='inspect'){out(a[2]===f.previousImageId?f.previousImage:f.candidateImage);}
else if(a[0]==='run'&&a.includes('scripts/yard-release-compatibility.mjs'))out(f.candidate);
else if(a[0]==='run'&&a.includes('sh')){if(f.probeFailure)process.exit(125);if(!a.includes(f.previousImageId)||a.includes('--mount')||!a.includes('none'))process.exit(91);if(f.previous===null)process.exit(42);out(f.previous);}
else if(a[0]==='run'&&a.includes('scripts/verify-yard-rollback-target.mjs')){const mount=a[a.indexOf('--mount')+1],dir=mount.match(/src=([^,]+)/)[1],r=cp.spawnSync(process.execPath,[process.env.TEST_VERIFY_SCRIPT,dir],{encoding:'utf8'});observe({kind:'verify',status:r.status,stdout:r.stdout,stderr:r.stderr});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);}
else if(a[0]==='exec'&&a.includes('ccgh-postgres')){if(!a.includes('PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000'))process.exit(89);if(f.queryFailure)process.exit(7);if(a[a.indexOf('-c')+1]!=="SELECT count(*) FROM players WHERE data ? '_yardV2';")process.exit(8);const countFile=p+'/count-calls',calls=fs.existsSync(countFile)?Number(fs.readFileSync(countFile,'utf8'))+1:1;fs.writeFileSync(countFile,String(calls));const count=f.lateMarker&&calls>1?1:f.persistentYardRows;observe({kind:'markers',count});process.stdout.write(String(count)+'\n');}
else if(a[0]==='inspect'){const countFile=p+'/image-calls',calls=fs.existsSync(countFile)?Number(fs.readFileSync(countFile,'utf8'))+1:1;fs.writeFileSync(countFile,String(calls));const id=f.lateImageChange&&calls>1?'sha256:'+'0'.repeat(64):f.previousImageId;observe({kind:'image-recheck',id});process.stdout.write(id+'\n');}
else process.exit(9);
`;
const timeoutStub=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process'),f=JSON.parse(fs.readFileSync(process.env.TEST_FIXTURES+'/input.json','utf8')),a=process.argv.slice(2);if(a.slice(0,3).join(' ')!=='--foreground --kill-after=5s 30s')process.exit(88);if(f.clientTimeout)process.exit(124);const r=cp.spawnSync(a[3],a.slice(4),{stdio:'inherit'});process.exit(r.status??1);
`;
const curlStub=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),f=JSON.parse(fs.readFileSync(process.env.TEST_FIXTURES+'/input.json','utf8'));process.stdout.write(JSON.stringify(f.previousHealth)+'\n');
`;
for(const [name,make,code,reason]of [
 ['closed-zero',fixture,0],['closed-existing-marker',()=>({...fixture(),persistentYardRows:1}),1,errors.markers],['activation-exact',activation,0],
 ['activation-direct-from-legacy',activationFromLegacy,1,errors.closed],
 ['query-failure',()=>({...fixture(),queryFailure:true}),7],['probe-failure',()=>({...fixture(),probeFailure:true}),125,'Previous image compatibility probe failed'],['docker-client-timeout',()=>({...fixture(),clientTimeout:true}),124],['marker-on-recheck',()=>({...fixture(),lateMarker:true}),1,errors.markers],['late-image-replacement',()=>({...fixture(),lateImageChange:true}),1]
])test(`actual pre-switch shell is bounded and fail-closed: ${name}`,()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yard-rollback-shell-test-')),bin=path.join(directory,'bin');
 try{const input=make();
 if(input.lateMarker||input.lateImageChange)assert.deepEqual(verifyYardRollbackTarget(input),ready(input),'late failure must start from valid preflight inputs');
 fs.mkdirSync(bin);fs.writeFileSync(path.join(directory,'input.json'),JSON.stringify(input));fs.writeFileSync(path.join(bin,'docker'),dockerStub,{mode:0o700});fs.writeFileSync(path.join(bin,'timeout'),timeoutStub,{mode:0o700});fs.writeFileSync(path.join(bin,'curl'),curlStub,{mode:0o700});const result=spawnSync('bash',[path.join(root,'scripts/yard-pre-switch-guard.sh'),`ghcr.io/${repo}@${digest}`,build,previousId,input.previousBuildId,'18080','fixture-user','fixture-db',repo],{env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,TMPDIR:directory,TEST_FIXTURES:directory,TEST_VERIFY_SCRIPT:path.join(root,'scripts/verify-yard-rollback-target.mjs')},encoding:'utf8',timeout:15000});assert.ifError(result.error);assert.equal(result.status,code,result.stdout+result.stderr);
 const observationsFile=path.join(directory,'observations.jsonl'),observations=fs.existsSync(observationsFile)?fs.readFileSync(observationsFile,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[];
 const verified={kind:'verify',status:0,stdout:JSON.stringify(ready(input))+'\n',stderr:''};
 if(reason){const prefix=code===1?'Yard pre-switch guard blocked release: ':'';assert.equal(result.stderr,prefix+reason+'\n');}
 if(code===0||input.lateMarker||input.lateImageChange){
  const expected=[{kind:'markers',count:input.persistentYardRows},verified,{kind:'image-recheck',id:previousId},{kind:'markers',count:input.lateMarker?1:input.persistentYardRows},{kind:'image-recheck',id:input.lateImageChange?'sha256:'+'0'.repeat(64):previousId}];
  if(!input.lateImageChange)expected.push(input.lateMarker?{kind:'verify',status:1,stdout:'',stderr:'Yard pre-switch guard blocked release: '+errors.markers+'\n'}:verified);
  assert.deepEqual(observations,expected,'provisional verification and each intended marker/image recheck must be reached in order');
 }
 if(code===0){assert.equal(result.stdout,verified.stdout);assert.equal(result.stderr,'');assert.doesNotMatch(result.stdout,/player|username|password|receipt/);}else assert.equal(result.stdout,'');
 // The shell's image equality check is silent: its final observation must be
 // the second, changed image identity, with no final verifier invocation.
 if(input.lateImageChange)assert.equal(result.stderr,'');
 assert.equal(fs.readdirSync(directory).some(s=>s.startsWith('yard-release-preflight.')),false);const calls=fs.existsSync(path.join(directory,'calls.jsonl'))?fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8'):'';assert.doesNotMatch(calls,/"up"|"stop"|"rm"|"tag"|"pg_restore"/);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('SCP stages by exact build/run and cannot replace effective deployment files before locking',()=>{
 const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 assert.match(deploy,/target: "\/opt\/game-hub\/releases\/\$\{\{ github.sha \}\}-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}"/);
 const lock=deploy.indexOf('            flock -n 9'),compose=deploy.indexOf('            install -m 0644 "$RELEASE_STAGING_PATH/docker-compose.yml"'),helper=deploy.indexOf('            install -m 0700 "$RELEASE_STAGING_PATH/scripts/yard-pre-switch-guard.sh"');
 assert.ok(lock>0&&compose>lock&&helper>lock);assert.doesNotMatch(deploy,/target: "\/opt\/game-hub"/);
});

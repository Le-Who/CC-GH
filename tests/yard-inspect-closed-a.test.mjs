import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {A_COMMIT,A_TREE,A_DEPLOY_RUN,IMAGE_REPOSITORY,HEALTH_URL,QA_REF,validateTarget,sanitizeImage,sanitizeCompatibility,sanitizeHealth,readPublicHealth,validateExecution,probeArguments,ownedContainerId} from '../scripts/yard-inspect-closed-a.mjs';
const targetInput=()=>({format:'yard-closed-a-inspection/v1',imageDigest:'sha256:'+'a'.repeat(64),runAttempt:1});
const imageFixture=()=>({Id:'sha256:'+'b'.repeat(64),RepoDigests:[`${IMAGE_REPOSITORY}@${targetInput().imageDigest}`,'other@sha256:'+'c'.repeat(64)],Config:{Labels:{'org.opencontainers.image.revision':A_COMMIT,unrelated:'omit'},Env:[`APP_BUILD_ID=${A_COMMIT}`,'OTHER_SECRET=never-output']},Other:'never-output'});
const compatibility=()=>({format:'cc-gh-yard-release-compatibility/v1',buildId:A_COMMIT,policyRevision:'yard-player-rollout/closed-r1',playerRolloutEnabled:false,closedQuarantineVerified:true,readableStorageFormats:['yard-persistent/v1'],requiredClosedPredecessor:null,unrelated:'omit'});
const environment=()=>({GITHUB_EVENT_NAME:'push',GITHUB_REF:QA_REF,GITHUB_REPOSITORY:'Le-Who/CC-GH',GITHUB_SHA:'d'.repeat(40),GITHUB_RUN_ID:'11',GITHUB_RUN_ATTEMPT:'1'});
test('target requires actual digest and attempt and fixes the approved A source/tree/deploy run',()=>{
 const t=validateTarget(targetInput());assert.equal(t.buildId,A_COMMIT);assert.equal(t.tree,A_TREE);assert.equal(t.ciReceipt.runId,A_DEPLOY_RUN);assert.equal(t.ciReceipt.workflowPath,'.github/workflows/deploy.yml');
 for(const value of [null,{},[],{...targetInput(),imageDigest:'latest'},{...targetInput(),runAttempt:0},{...targetInput(),runAttempt:'1'},{...targetInput(),buildId:'f'.repeat(40)}])assert.throws(()=>validateTarget(value));
});
test('image selection binds all identities and outputs only allowlisted metadata',()=>{
 const image=imageFixture(),result=sanitizeImage(image,validateTarget(targetInput()));assert.deepEqual(Object.keys(result),['Id','RepoDigests','Config']);assert.equal(result.RepoDigests.length,1);assert.deepEqual(result.Config.Env,[`APP_BUILD_ID=${A_COMMIT}`]);assert.doesNotMatch(JSON.stringify(result),/OTHER_SECRET|never-output|unrelated|other@/);
 for(const change of [d=>d.Id='latest',d=>d.RepoDigests='string',d=>d.RepoDigests=[],d=>d.Config.Labels['org.opencontainers.image.revision']='f'.repeat(40),d=>d.Config.Env=[],d=>d.Config.Env.push('APP_BUILD_ID='+A_COMMIT)]){const d=imageFixture();change(d);assert.throws(()=>sanitizeImage(d,validateTarget(targetInput())));}
});
test('pristine probe must be closed and quarantine aware; no flags are manufactured',()=>{
 assert.equal(sanitizeCompatibility(compatibility()).unrelated,undefined);
 for(const change of [d=>d.buildId='f'.repeat(40),d=>d.policyRevision='yard-player-rollout/active-r1',d=>d.playerRolloutEnabled=true,d=>d.closedQuarantineVerified=false,d=>d.readableStorageFormats='yard-persistent/v1',d=>d.requiredClosedPredecessor={}]){const d=compatibility();change(d);assert.throws(()=>sanitizeCompatibility(d));}
});
test('health requires exact A, PostgreSQL and overall health, and drops unrelated public details',()=>{
 const good={status:'ok',buildId:A_COMMIT,postgres:true,other:'omit'};assert.deepEqual(sanitizeHealth(good),{status:'ok',buildId:A_COMMIT,postgres:true});
 for(const change of [d=>d.status='degraded',d=>d.postgres=false,d=>d.buildId='84d252d4bee6ed75fe8d32c07ebdef4c9270c629']){const d={...good};change(d);assert.throws(()=>sanitizeHealth(d));}
});
test('public request fixes verified HTTPS host, blocks redirects and uses no authorization',async()=>{
 const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return {status:200,text:async()=>JSON.stringify({status:'ok',buildId:A_COMMIT,postgres:true})};};
 await readPublicHealth(fetchImpl);assert.equal(calls.length,1);assert.equal(calls[0].url,HEALTH_URL);assert.equal(HEALTH_URL,'https://games.tri.mom/api/health');assert.equal(calls[0].options.redirect,'error');assert.deepEqual(calls[0].options.headers,{Accept:'application/json'});assert.ok(calls[0].options.signal instanceof AbortSignal);
 for(const status of [301,403,500])await assert.rejects(()=>readPublicHealth(async()=>({status,text:async()=>''})));
 await assert.rejects(()=>readPublicHealth(async()=>{throw Error('timeout');}),/timeout/);
 await assert.rejects(()=>readPublicHealth(async()=>({status:200,text:async()=>'x'.repeat(32769)})),/Oversized/);
});
test('execution refuses non-QA, non-push, foreign repo, TLS bypass and inherited service credentials',()=>{
 validateExecution(environment());
 for(const change of [d=>d.GITHUB_REF='refs/heads/codex/telegram-pixi-vps-migration',d=>d.GITHUB_EVENT_NAME='workflow_dispatch',d=>d.GITHUB_REPOSITORY='other/repo',d=>d.GITHUB_RUN_ID='1;echo token',d=>d.NODE_TLS_REJECT_UNAUTHORIZED='0',d=>d.NODE_OPTIONS='--import bypass',d=>d.DATABASE_URL='secret',d=>d.TELEGRAM_BOT_TOKEN='secret']){const d=environment();change(d);assert.throws(()=>validateExecution(d));}
});
test('container command has no networking, writable mounts, env injection or server startup',()=>{
 const args=probeArguments(imageFixture().Id,'ccgh-yard-inspect-11-1','/tmp/owned-private/created.cid');assert.equal(args[args.indexOf('--cidfile')+1],'/tmp/owned-private/created.cid');assert.equal(args[args.indexOf('--label')+1],'ccgh.yard-inspection-owner=ccgh-yard-inspect-11-1');assert.equal(args[args.indexOf('--network')+1],'none');assert.ok(args.includes('--read-only'));assert.equal(args[args.indexOf('--cap-drop')+1],'ALL');assert.equal(args[args.indexOf('--entrypoint')+1],'node');assert.equal(args.at(-1),'scripts/yard-release-compatibility.mjs');assert.ok(!args.some(a=>['-e','--env','--mount','-v','server.js'].includes(a)));
 assert.throws(()=>probeArguments('latest','ccgh-yard-inspect-11-1'));assert.throws(()=>probeArguments(imageFixture().Id,'ccgh-app'));
});
test('workflow stays on one QA push branch with existing read token and no build/deploy/install',()=>{
 const source=readFileSync(new URL('../.github/workflows/yard-closed-a-inspection.yml',import.meta.url),'utf8');assert.match(source,/branches: \[qa\/yard-closed-a-inspection\]/);assert.match(source,/contents: read\n  packages: read\n  actions: read/);assert.doesNotMatch(source,/packages: write|contents: write|actions: write|docker build|docker push|pnpm install|playwright|ssh-action|scp-action|VPS_/);assert.match(source,/timeout-minutes: 6/);assert.match(source,/timeout --foreground --kill-after=5s 120s docker pull/);
 assert.equal((source.match(/persist-credentials: false/g)||[]).length,2);assert.match(source,/ref: \$\{\{ steps.target.outputs.commit \}\}/);assert.match(source,/scripts\/yard-closed-ci-receipt.mjs/);assert.match(source,/if-no-files-found: error/);
});

test('cleanup requires this invocation CID plus matching image and ownership label',()=>{
 const cid='c'.repeat(64),imageId=imageFixture().Id,name='ccgh-yard-inspect-11-1';
 const metadata={Id:cid,Image:imageId,Config:{Labels:{'ccgh.yard-inspection-owner':name}}};
 assert.equal(ownedContainerId(cid,metadata,imageId,name),cid);
 for(const change of [d=>d.Id='d'.repeat(64),d=>d.Image='sha256:'+'f'.repeat(64),d=>d.Config.Labels['ccgh.yard-inspection-owner']='another-run']){const d=structuredClone(metadata);change(d);assert.throws(()=>ownedContainerId(cid,d,imageId,name));}
 const source=readFileSync(new URL('../scripts/yard-inspect-closed-a.mjs',import.meta.url),'utf8');assert.match(source,/if\(existsSync\(cidFile\)\)/);assert.match(source,/command\('docker',\['rm','-f','-v',ownedId\]\)/);assert.doesNotMatch(source,/\['rm','-f','-v',ownedName\]/);
});

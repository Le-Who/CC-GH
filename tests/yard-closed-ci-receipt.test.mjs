import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {assemblePromotion} from '../scripts/yard-active-promotion.mjs';
import {spawnSync} from 'node:child_process';
import {closedJobInventory,validateClosedRun,validateClosedJobs,verifyGithubClosedReceipt} from '../scripts/yard-closed-ci-receipt.mjs';
import {validateClosedCiReceipt} from '../scripts/yard-active-contract.mjs';
const commit='a'.repeat(40),groups=['match3','bubbo','garden','merge','yard','cross-game-motion','hud-layout','mobile-ui','navigation-input','assets-performance','auth-cache-smoke'];
function fixture(deploy=false){
 const receipt={runId:9001,runAttempt:2,workflowPath:deploy?'.github/workflows/deploy.yml':'.github/workflows/ci.yml'};
 const run={id:9001,run_attempt:2,repository:{id:1162268629,full_name:'Le-Who/CC-GH'},head_repository:{id:1162268629,full_name:'Le-Who/CC-GH'},head_sha:commit,event:'push',path:receipt.workflowPath,workflow_id:8,status:'completed',conclusion:'success',name:deploy?'VPS Deploy':'Game Hub CI',updated_at:'2026-10-04T07:00:00Z'};
 const workflow={id:8,path:receipt.workflowPath},inventory=closedJobInventory(groups),prefix=deploy?'validate / ':'';
 const jobs=[...inventory.required.map(row=>({name:row.name,conclusion:'success',steps:row.steps.map(name=>({name,status:'completed',conclusion:'success'}))})),...inventory.skipped.map(name=>({name,conclusion:'skipped',steps:[]}))].map((row,i)=>({...row,name:prefix+row.name,id:100+i,run_id:9001,run_attempt:1,head_sha:commit,status:'completed'}));
 jobs.find(job=>job.name.endsWith('Exact source release acceptance')).run_attempt=2;
 return {receipt,run,workflow,jobs,closedCommit:commit,browserGroups:groups};
}
const check=f=>validateClosedJobs(f);
test('complete exact A inventory includes every source and matrix job and separate skipped ACTIVE lanes',()=>{
 const f=fixture();assert.equal(check(f).jobs.length,23);const lowercase=structuredClone(f);lowercase.run.repository.full_name='le-who/cc-gh';lowercase.run.head_repository.full_name='le-who/cc-gh';assert.equal(check(lowercase).jobs.length,23);assert.equal(closedJobInventory(groups).skipped.length,3);
 assert.deepEqual(check(f).jobs.filter(row=>row.name.startsWith('Yard eight-player')).map(row=>row.name),['Yard eight-player / small-phone','Yard eight-player / phone','Yard eight-player / landscape','Yard eight-player / desktop']);
 const d=fixture(true);d.jobs.push({...d.jobs[0],id:999,name:'build-and-push'});assert.equal(check(d).jobs.length,23);
});
test('run and attempt identity require exact repository, workflow, commit and successful status',()=>{
 for(const change of [f=>f.run.repository.full_name='other/cc-gh',f=>{f.run.repository.id=99;f.run.head_repository.id=99;},f=>f.run.head_repository.id=99,f=>f.run.head_repository.full_name='fork/cc-gh',f=>f.run.id++,f=>f.run.run_attempt++,f=>f.run.head_sha='b'.repeat(40),f=>f.run.path='.github/workflows/other.yml',f=>f.workflow.id++,f=>f.workflow.path='.github/workflows/other.yml',f=>f.run.name='Other CI',f=>f.run.event='pull_request',f=>f.run.status='in_progress',f=>f.run.conclusion='failure']){const f=fixture();change(f);assert.throws(()=>check(f));}
});
test('receipt identities do not accept guessed paths, omitted attempts or arbitrary fields',()=>{
 for(const value of [null,{},[],{runId:1,runAttempt:0,workflowPath:'.github/workflows/ci.yml'},{runId:'1',runAttempt:1,workflowPath:'.github/workflows/ci.yml'},{runId:1,runAttempt:1,workflowPath:'https://example.invalid/ci'},{...fixture().receipt,accepted:true}])assert.throws(()=>validateClosedCiReceipt(value));
});
test('every required job must have succeeded; skipped, neutral, failed and missing matrix shards block',()=>{
 for(let i=0;i<23;i++)for(const outcome of ['skipped','neutral','failure','cancelled','timed_out']){const f=fixture();f.jobs[i].conclusion=outcome;assert.throws(()=>check(f));}
 for(const name of ['Browser / assets-performance','Yard eight-player / desktop','Exact source release acceptance']){const f=fixture();f.jobs=f.jobs.filter(j=>j.name!==name);assert.throws(()=>check(f),/inventory/);}
});
test('wrong job run, source, attempts, duplicates and unknown validation jobs fail',()=>{
 for(const change of [f=>f.jobs[0].run_id++,f=>f.jobs[0].head_sha='b'.repeat(40),f=>f.jobs[0].run_attempt=3,f=>f.jobs[0].run_attempt='1',f=>f.jobs.push({...f.jobs[0]}),f=>f.jobs.push({...f.jobs[0],id:999}),f=>f.jobs.push({...f.jobs[0],name:'Unknown validation',id:999})]){const f=fixture();change(f);assert.throws(()=>check(f));}
});
test('successful targeted retry replaces its failed earlier job without rerunning successful jobs',()=>{
 const f=fixture(),job=f.jobs.find(j=>j.name==='mochi');job.conclusion='failure';f.jobs.push({...structuredClone(job),id:998,run_attempt:2,conclusion:'success'});
 const result=check(f);assert.equal(result.jobs.find(j=>j.name==='mochi').attempt,2);assert.equal(result.jobs.find(j=>j.name==='touch').attempt,1);
 f.jobs.reverse();assert.equal(check(f).jobs.find(j=>j.name==='mochi').id,998);
 f.jobs.find(j=>j.id===998).conclusion='failure';assert.throws(()=>check(f));
});
test('skipped actual test or source verification steps cannot hide inside a green job',()=>{
 for(const name of ['Run tests','Verify and report exact CLOSED acceptance source','Genuine eight-actor API store browser PostgreSQL15 acceptance']){const f=fixture(),job=f.jobs.find(j=>j.steps.some(s=>s.name===name));job.steps.find(s=>s.name===name).conclusion='skipped';assert.throws(()=>check(f));}
 const f=fixture();f.jobs[0].steps=[];assert.throws(()=>check(f),/proof step/);
});
test('CLOSED receipt cannot come from a run that exercised ACTIVE or itself reused acceptance',()=>{
 for(const name of closedJobInventory(groups).skipped){const f=fixture();f.jobs.find(j=>j.name===name).conclusion='success';assert.throws(()=>check(f));}
});
function fakeApi(f,change=()=>{}){
 let final=0;const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});let data;
  if(url.endsWith('/workflows/8'))data=f.workflow;
  else if(url.includes('/jobs?'))data={total_count:f.jobs.length,jobs:f.jobs};
  else{data=structuredClone(f.run);if(url.endsWith('/runs/9001'))final++;}
  const response={status:200,data:structuredClone(data)};change({url,response,final});return {status:response.status,text:async()=>JSON.stringify(response.data)};
 };return {fetchImpl,calls};
}
test('read-only authoritative API sequence pins attempts, all job pages and a stable final run',async()=>{
 const f=fixture(),api=fakeApi(f),result=await verifyGithubClosedReceipt({...f,token:'ephemeral-test-token',...api});assert.equal(result.jobs.length,23);assert.equal(api.calls.length,5);
 assert.ok(api.calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'&&c.url.startsWith('https://api.github.com/repos/le-who/cc-gh/actions/')));
 assert.ok(api.calls.some(c=>c.url.includes('/attempts/2')));assert.ok(api.calls.some(c=>c.url.includes('filter=all')));
});
test('all job pages are verified while retaining successful targeted replacements',async()=>{
 const f=fixture();f.receipt.runAttempt=5;f.run.run_attempt=5;
 const latest=f.jobs.map(job=>({...job,run_attempt:5}));
 f.jobs=[...Array.from({length:4},(_,i)=>latest.map(job=>({...job,id:1000+(i*100)+job.id,run_attempt:i+1,conclusion:job.conclusion==='skipped'?'skipped':'failure'}))).flat(),...latest];
 const api=fakeApi(f,({url,response})=>{if(url.includes('/jobs?')){const page=Number(new URL(url).searchParams.get('page'));response.data.jobs=f.jobs.slice((page-1)*100,page*100);}});
 const result=await verifyGithubClosedReceipt({...f,token:'test',...api});assert.equal(result.jobs.length,23);assert.ok(result.jobs.every(row=>row.attempt===5));assert.equal(api.calls.filter(row=>row.url.includes('/jobs?')).length,2);
});
test('API unavailability, missing page data and concurrent reruns all fail closed',async()=>{
 for(const change of [({response})=>response.status=403,({url,response})=>{if(url.includes('/jobs?'))response.data.total_count++;},({url,response,final})=>{if(url.endsWith('/runs/9001')&&final===2)response.data.run_attempt++;},({url,response,final})=>{if(url.endsWith('/runs/9001')&&final===2)response.data.updated_at='later';}]){const f=fixture(),api=fakeApi(f,change);await assert.rejects(()=>verifyGithubClosedReceipt({...f,token:'test',...api}));}
 await assert.rejects(()=>verifyGithubClosedReceipt({...fixture(),token:''}),/token/);
});
const workflow=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
test('aggregate allows only CLOSED, ACTIVE fresh suites, or ACTIVE verified receipt; each required failure blocks',()=>{
 const code=workflow.slice(workflow.indexOf('  release-ready:')).match(/node --input-type=module <<'JS'\n([\s\S]*?)          JS/)[1].split('\n').map(line=>line.slice(10)).join('\n');
 const closed=['test','yard-player','yard-eight-player','browser-plan','browser','touch','mochi','docker'],active=['yard-active','yard-active-production'];
 const execute=(mode,reuse,needs)=>spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,RELEASE_MODE:mode,REUSE_CLOSED:reuse,RELEASE_RESULTS:JSON.stringify(needs)},encoding:'utf8'}).status;
 for(const [mode,reuse]of [['CLOSED','false'],['ACTIVE','false'],['ACTIVE','true']]){
  const needs=Object.fromEntries([['yard-release-mode','success'],...closed.map(id=>[id,reuse==='true'?'skipped':'success']),['yard-closed-receipt',reuse==='true'?'success':'skipped'],...active.map(id=>[id,mode==='ACTIVE'?'success':'skipped'])].map(([id,result])=>[id,{result}]));
  assert.equal(execute(mode,reuse,needs),0);
  for(const [id,{result}]of Object.entries(needs))for(const wrong of ['failure','cancelled',result==='success'?'skipped':'success'])assert.notEqual(execute(mode,reuse,{...needs,[id]:{result:wrong}}),0,`${mode}/${reuse}/${id}/${wrong}`);
  if(mode==='CLOSED')assert.notEqual(execute(mode,'true',needs),0);
 }
});

test('optional receipt survives exact promotion assembly; absence preserves original fallback inputs',()=>{
 const root=resolve(process.env.YARD_DISPATCH_TEST_SOURCE_ROOT||process.cwd());
 const git=args=>{const r=spawnSync('git',args,{cwd:root,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};
 const contractPath=resolve(root,'game-logic/yard-v2/active-release-contract.json');
 const buildId=existsSync(contractPath)?JSON.parse(readFileSync(contractPath)).inputs.closed.buildId:git(['rev-parse','HEAD']).toString().trim();
 const imageDigest='sha256:'+'1'.repeat(64),inputs={format:'yard-active-inputs/v1',repository:'le-who/cc-gh',closed:{buildId,imageDigest,
  image:{Id:'sha256:'+'2'.repeat(64),RepoDigests:['ghcr.io/le-who/cc-gh@'+imageDigest],Config:{Labels:{'org.opencontainers.image.revision':buildId}}},
  compatibility:{format:'cc-gh-yard-release-compatibility/v1',buildId,policyRevision:'yard-player-rollout/closed-r1',playerRolloutEnabled:false,readableStorageFormats:['yard-persistent/v1'],closedQuarantineVerified:true,requiredClosedPredecessor:null}},
  acceptance:{reviewReference:'test-only:review',...Object.fromEntries(['nativeDuration','eightPlayer','geometryEquivalence'].map(kind=>[kind,{reference:'test-only:'+kind,artifactSha256:'3'.repeat(64),sourceCommit:kind==='nativeDuration'?'b92c84d685a1221cf6fdbde41624c901bc8b2f8f':buildId,...(kind==='eightPlayer'?{runId:37181170572}:{})}]))}};
 const assemble=()=>assemblePromotion({inputs,closedTree:git(['rev-parse',buildId+'^{tree}']).toString().trim(),read:path=>git(['cat-file','blob',buildId+':'+path])});
 assert.equal(Object.hasOwn(assemble().contract.inputs.closed,'ciReceipt'),false);
 inputs.closed.ciReceipt=fixture().receipt;const result=assemble();assert.equal(result.files.size,21);assert.deepEqual(result.contract.inputs.closed.ciReceipt,inputs.closed.ciReceipt);
 inputs.closed.ciReceipt=null;assert.throws(assemble,/receipt identity/);
});
test('workflow keeps fresh-suite fallback and scopes Actions reads to the authoritative receipt job',()=>{
 const block=job=>workflow.match(new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9_-]*:|$(?![\\s\\S]))`,'m'))?.[1];
 for(const job of ['test','yard-player','yard-eight-player','browser-plan','browser','touch','mochi'])assert.match(block(job),/^    if: needs\.yard-release-mode\.outputs\.reuse_closed != 'true'$/m);
 assert.match(block('yard-closed-receipt'),/^    if: needs\.yard-release-mode\.outputs\.reuse_closed == 'true'$/m);
 assert.match(block('yard-closed-receipt'),/yard-ci-dispatch\.mjs --verify-active[\s\S]*ref: \$\{\{ needs.yard-release-mode.outputs.closed_ref \}\}[\s\S]*yard-ci-dispatch\.mjs --assert-closed-ref/);
 assert.match(workflow,/^permissions:\n  contents: read\n\njobs:/m);assert.equal((workflow.match(/^      actions: read$/gm)||[]).length,1);assert.match(block('yard-closed-receipt'),/^      actions: read$/m);
 for(const job of ['yard-active','yard-active-production']){assert.match(block(job),/^    if: needs\.yard-release-mode\.outputs\.mode == 'ACTIVE'$/m);assert.doesNotMatch(block(job),/reuse_closed/);}
 const dispatch=readFileSync(new URL('../scripts/yard-ci-dispatch.mjs',import.meta.url),'utf8');assert.match(dispatch,/reuse_closed:'false'/);assert.match(dispatch,/Object\.hasOwn\(closed,'ciReceipt'\)\?'true':'false'/);
});

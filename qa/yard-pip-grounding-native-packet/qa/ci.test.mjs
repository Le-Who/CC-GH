import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {assertEvent,ciPaths,allowedPath,auditPushTriggers,BASE,BASE_TREE,BRANCH,git} from './ci-contract.mjs';
import {auditPaths} from './path-audit.mjs';
import {stageVerdict,finalizeEvidence} from './evidence.mjs';
const root=process.env.YARD_GROUNDING_SOURCE_ROOT,packet=path.resolve(import.meta.dirname,'..');
const passed=Object.fromEntries(['PREFLIGHT','DEPENDENCIES','SOURCE','BUILD','BROWSER'].map(k=>[k,'success']));
const disposed={probe:{renderer:{disposed:true}},directCanvases:0};
const native={status:'TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING',samePosePassed:true,owners:[
 {status:'TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING',disposal:disposed,stability:{candidate:{passed:true},baselineRestoration:{passed:true}}},
 ...[0,1].map(()=>({status:'TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING',disposal:disposed,cleanVideo:{timeScale:1,readbackCalls:0,diagnosticBackgroundChanges:0},motion:{sample:{world:{moving:false}}}})),
]};
test('only exact first-created branch push is admitted, with no inherited backend input',()=>{
  const env={GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_SHA:'a'.repeat(40)},event={created:true,forced:false,deleted:false,after:env.GITHUB_SHA};
  assert.doesNotThrow(()=>assertEvent(env,event));for(const delta of[{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_REF:'refs/heads/main'},{DATABASE_URL:'unexpected'}])assert.throws(()=>assertEvent({...env,...delta},event));
  for(const delta of[{created:false},{forced:true},{deleted:true},{after:'b'.repeat(40)}])assert.throws(()=>assertEvent(env,{...event,...delta}));
  assert(allowedPath('qa/yard-pip-grounding-native-packet/qa/run.mjs'));for(const p of['src/game.mjs','package.json','qa/yard-pip-grounding-native-packet/new.glb','qa/yard-pip-grounding-native-packet/results/report.json'])assert.equal(allowedPath(p),false);
});
test('missing/failed/skipped stages and incomplete native reports cannot become green',()=>{
  assert.equal(stageVerdict(passed,native),'TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING');
  for(const key of Object.keys(passed))for(const outcome of['failure','skipped','cancelled','unknown',undefined])assert.equal(stageVerdict({...passed,[key]:outcome},native),'FAILED_OR_INCOMPLETE');
  assert.equal(stageVerdict({},native),'FAILED_OR_INCOMPLETE');assert.equal(stageVerdict(passed,null),'FAILED_OR_INCOMPLETE');assert.equal(stageVerdict(passed,{...native,samePosePassed:false}),'FAILED_OR_INCOMPLETE');
});
test('installed Playwright and all static CI paths audit without browser/process launch',{skip:!root},async()=>{
  assert.equal(git(root,['rev-parse',BASE+'^{tree}']),BASE_TREE);
  const result=await auditPaths(root,packet,os.tmpdir());assert.equal(result.browsers,0);assert.equal(result.listeners,0);assert.equal(result.processLaunches,0);assert.equal(result.playwrightVersion,'1.58.2');
});
async function fixture(t){const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pip-quality-ci-proof-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));const p={root,build:path.join(temp,'exclusive-build'),results:path.join(temp,'results'),packageWork:path.join(temp,'package'),upload:path.join(temp,'upload')};return p;}
test('early setup failure packages a bounded receipt without creating exclusive build directory',{skip:!root},async t=>{
  const p=await fixture(t),result=await finalizeEvidence(p,{GITHUB_SHA:'a'.repeat(40),PREFLIGHT_OUTCOME:'failure'},()=>{});
  assert.equal(result.ok,false);assert.equal(result.receipt.acceptance,'FAILED_OR_INCOMPLETE');assert.equal(result.summary.status,'PACKAGED');await assert.rejects(fs.access(p.build));
  assert.deepEqual((await fs.readdir(p.upload)).sort(),['evidence.zip','summary.json']);assert(result.uploadBytes+4096<=8388608);
});
test('all source/native originals retain exact bytes even on a failed native gate',{skip:!root},async t=>{
  const p=await fixture(t);await fs.mkdir(p.results);await fs.mkdir(path.join(p.build,'evidence'),{recursive:true});
  await fs.writeFile(path.join(p.results,'source.tap'),'one original source check\n');await fs.writeFile(path.join(p.build,'evidence','frame.png'),Buffer.from([1,3,5,7]));await fs.writeFile(path.join(p.build,'evidence','report.json'),JSON.stringify({...native,status:'FAILED_OR_INCOMPLETE'}));
  const env={GITHUB_SHA:'a'.repeat(40),...Object.fromEntries(Object.entries({...passed,BROWSER:'failure'}).map(([k,v])=>[k+'_OUTCOME',v]))},result=await finalizeEvidence(p,env,()=>{});
  assert.equal(result.ok,false);assert.equal(result.summary.status,'PACKAGED');assert.equal(result.summary.completeOriginalsStaged,true);
  const listing=JSON.parse(execFileSync('python3',['-I','-c',"import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.read('stage-source.tap') == b'one original source check\\n'; assert z.read('native-frame.png') == bytes([1,3,5,7]); print(json.dumps(z.namelist()))",result.archive],{encoding:'utf8'}));
  for(const name of['native-frame.png','native-report.json','stage-source.tap','stage-stage-outcomes.json','original-paths.json','MANIFEST.sha256.json'])assert(listing.includes(name));
});
test('unsafe collection emits bounded failure summary and never uploads a partial set',{skip:!root},async t=>{
  const p=await fixture(t);await fs.mkdir(p.results);await fs.mkdir(path.join(p.results,'unexpected-directory'));
  const result=await finalizeEvidence(p,{PREFLIGHT_OUTCOME:'failure'},()=>{});assert.equal(result.ok,false);assert.equal(result.summary.status,'PACKAGING_FAILED');assert.equal(result.summary.completeOriginalsStaged,false);assert.deepEqual(await fs.readdir(p.upload),['summary.json']);assert((await fs.stat(path.join(p.upload,'summary.json'))).size<=8192);await assert.rejects(fs.access(p.build));
});

test('oversized finalized raw video is included in originals and cannot produce a successful subset upload',{skip:!root},async t=>{
 const p=await fixture(t);await fs.mkdir(path.join(p.build,'evidence'),{recursive:true});await fs.writeFile(path.join(p.build,'evidence','baseline-motion-raw.webm'),randomBytes(8388608));await fs.writeFile(path.join(p.build,'evidence','report.json'),JSON.stringify(native));
 const env={GITHUB_SHA:'a'.repeat(40),...Object.fromEntries(Object.entries(passed).map(([k,v])=>[k+'_OUTCOME',v]))};const result=await finalizeEvidence(p,env,()=>{});
 assert.equal(result.ok,false);assert.equal(result.summary.status,'OVER_CAP');assert.equal(result.summary.completeOriginalsStaged,false);assert.deepEqual(await fs.readdir(p.upload),['summary.json']);
 assert(result.manifest.files.some(f=>f.path==='native-baseline-motion-raw.webm'&&f.bytes===8388608));
 const run=await fs.readFile(path.join(packet,'qa/run.mjs'),'utf8');assert.match(run,/recordVideo:\{dir:out/);assert.doesNotMatch(run,/raw-video-|bytes\+data.length<=/);
});

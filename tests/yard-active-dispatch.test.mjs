import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,chmodSync,symlinkSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {PROMOTED_PATHS,ACTIVE_CONTRACT_PATH} from '../scripts/yard-active-contract.mjs';
import {FULL_PROMOTION_PATHS,ADDED_PROMOTION_PATHS,parseGitTree,assertExactPromotionTree,verifyGitPromotionBoundary,verifyClosedSource,planYardRelease} from '../scripts/yard-ci-dispatch.mjs';
const ownRoot=resolve(import.meta.dirname,'..'),sourceRoot=resolve(process.env.YARD_DISPATCH_TEST_SOURCE_ROOT||ownRoot);
const run=(root,args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const put=(root,path,data)=>{mkdirSync(dirname(resolve(root,path)),{recursive:true});writeFileSync(resolve(root,path),data);};
const commit=root=>{run(root,['add','-A']);run(root,['-c','user.name=Fixture','-c','user.email=fixture@invalid','commit','-qm','owned fixture']);return run(root,['rev-parse','HEAD']);};
function fixture(){
 const root=mkdtempSync(resolve(tmpdir(),'yard-dispatch-tree-'));run(root,['init','-q']);run(root,['config','core.filemode','true']);
 for(const path of PROMOTED_PATHS)put(root,path,'closed:'+path+'\n');
 for(const path of ['routes/player.js','src/game-state/useGameHub.js','src/game-state/yardOutboxStorage.js','public/assets/yard-pip/actor.webp','.github/workflows/ci.yml'])put(root,path,'unchanged:'+path+'\n');
 const closedCommit=commit(root),closedTree=run(root,['rev-parse','HEAD^{tree}']);
 for(const path of PROMOTED_PATHS)put(root,path,'active:'+path+'\n');for(const path of ADDED_PROMOTION_PATHS)put(root,path,'owned fixture:'+path+'\n');
 const activeCommit=commit(root);return {root,closedCommit,closedTree,activeCommit};
}
function withFixture(fn){const f=fixture();try{return fn(f);}finally{rmSync(f.root,{recursive:true,force:true});}}
const verify=f=>verifyGitPromotionBoundary({rootDir:f.root,...f});
test('the complete permitted delta is exactly eight existing and thirteen new paths',()=>{
 assert.equal(FULL_PROMOTION_PATHS.length,21);assert.equal(new Set(FULL_PROMOTION_PATHS).size,21);assert.equal(ADDED_PROMOTION_PATHS.length,13);
 assert.ok(!FULL_PROMOTION_PATHS.some(path=>path.endsWith('/')));
 withFixture(f=>assert.equal(verify(f).changedFiles,21));
});
for(const path of ['routes/player.js','src/game-state/useGameHub.js','src/game-state/yardOutboxStorage.js','public/assets/yard-pip/actor.webp','.github/workflows/ci.yml'])test(`unrelated committed ${path} changes fail full-tree comparison`,()=>withFixture(f=>{
 put(f.root,path,'unreviewed drift');f.activeCommit=commit(f.root);assert.throws(()=>verify(f),/Unrelated tree change/);
}));
test('an extra file under the history prefix is not an allowed promotion',()=>withFixture(f=>{
 put(f.root,'preview/yard-persistent-candidate/history/pre-activation/unreviewed.js','bad');f.activeCommit=commit(f.root);assert.throws(()=>verify(f),/Unrelated tree change/);
}));
test('promoted-file deletion, executable-bit changes and new symlink evidence fail',()=>{
 for(const change of [f=>unlinkSync(resolve(f.root,PROMOTED_PATHS[0])),f=>chmodSync(resolve(f.root,PROMOTED_PATHS[0]),0o755),f=>{const p=resolve(f.root,ADDED_PROMOTION_PATHS[0]);unlinkSync(p);symlinkSync('../outside',p);}])withFixture(f=>{change(f);f.activeCommit=commit(f.root);assert.throws(()=>verify(f),/remain present|mode changed|Regular new evidence/);});
});
test('dirty tracked bytes and untracked source files fail before tree reuse',()=>{
 for(const path of ['routes/player.js','src/untracked-promotion-bypass.js'])withFixture(f=>{put(f.root,path,'uncommitted');assert.throws(()=>verify(f),/dirty or untracked/);});
});
test('wrong A tree, wrong checked B, identical A/B and nonancestor A fail',()=>{
 withFixture(f=>assert.throws(()=>verify({...f,closedTree:'0'.repeat(40)})));
 withFixture(f=>assert.throws(()=>verify({...f,activeCommit:f.closedCommit}),/working tree must be B/));
 withFixture(f=>{run(f.root,['checkout','--detach',f.closedCommit]);assert.throws(()=>verify({...f,activeCommit:f.closedCommit}),/later commit/);});
 withFixture(f=>{run(f.root,['checkout','--orphan','unrelated']);f.activeCommit=commit(f.root);assert.throws(()=>verify(f),/ancestor/);});
});
test('missing one required promotion and pre-existing added evidence fail',()=>withFixture(f=>{
 const tree=ref=>parseGitTree(run(f.root,['ls-tree','-rz','--full-tree',ref]));const a=tree(f.closedCommit),b=tree(f.activeCommit);
 const missing=new Map(b);missing.set(PROMOTED_PATHS[0],a.get(PROMOTED_PATHS[0]));assert.throws(()=>assertExactPromotionTree(a,missing),/Every exact promotion/);
 const preexisting=new Map(a);preexisting.set(ADDED_PROMOTION_PATHS[0],{mode:'100644',type:'blob',objectId:'f'.repeat(40)});assert.throws(()=>assertExactPromotionTree(preexisting,b),/newly added/);
}));
test('actual checkout verifies its exact mode and never relabels ACTIVE as CLOSED',async()=>{
 const head=run(sourceRoot,['rev-parse','HEAD']);
 if(existsSync(resolve(sourceRoot,ACTIVE_CONTRACT_PATH))){
  assert.throws(()=>verifyClosedSource(sourceRoot,head),/cannot contain an ACTIVE contract/);
  const plan=await planYardRelease(sourceRoot);assert.equal(plan.mode,'ACTIVE');assert.equal(plan.active_ref,head);assert.notEqual(plan.closed_ref,head);assert.equal(plan.boundary.changedFiles,21);
 }else{
  const closed=verifyClosedSource(sourceRoot,head);assert.equal(closed.mode,'CLOSED');assert.ok(closed.fullContract.boundary.reviewedProductionTransitions>=9);
  const plan=await planYardRelease(sourceRoot);assert.equal(plan.mode,'CLOSED');assert.equal(plan.closed_ref,head);assert.equal(plan.active_ref,head);
 }
});
const workflow=readFileSync(resolve(ownRoot,'.github/workflows/ci.yml'),'utf8');
const block=job=>workflow.match(new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9_-]*:|$(?![\\s\\S]))`,'m'))?.[1];
// Parse the workflow's explicit block indentation: nested step/artifact fields
// must never satisfy job-level metadata checks. No dependency install is needed.
function metadata(text){
 const jobs={};let inJobs=false,job=null,step=null,permissions=false,withFields=false;
 for(const line of text.split('\n')){
  if(line==='jobs:'){inJobs=true;continue;}if(!inJobs)continue;
  let m=/^  ([a-z][a-z0-9_-]*):$/.exec(line);if(m){job=jobs[m[1]]={permissions:{},steps:[]};step=null;permissions=false;withFields=false;continue;}
  if(!job)continue;
  m=/^    ([a-z][a-z_-]*):\s*(.*)$/.exec(line);if(m){permissions=m[1]==='permissions';withFields=false;if(['name','uses'].includes(m[1]))job[m[1]]=m[2];continue;}
  if(permissions){m=/^      ([a-z-]+):\s*(\S+)$/.exec(line);if(m){job.permissions[m[1]]=m[2];continue;}}
  m=/^      - ([a-z]+):\s*(.*)$/.exec(line);if(m){permissions=false;withFields=false;step={[m[1]]:m[2],with:{}};job.steps.push(step);continue;}
  if(!step)continue;
  m=/^        ([a-z-]+):\s*(.*)$/.exec(line);if(m){withFields=m[1]==='with';if(m[1]==='uses')step.uses=m[2];continue;}
  m=/^          ([a-z-]+):\s*(.*)$/.exec(line);if(m&&withFields)step.with[m[1]]=m[2];
 }
 return jobs;
}
function validateArtifactNames(jobs){
 let count=0;for(const job of Object.values(jobs))for(const step of job.steps.filter(s=>/^actions\/upload-artifact@/.test(s.uses||''))){
  const name=step.with.name;assert.equal(typeof name,'string');assert.ok(name.length>0);const literal=name.replace(/\$\{\{[^}]+\}\}/g,'EXPRESSION');assert.doesNotMatch(literal,/[\\/":<>|*?\r\n]/,`Illegal artifact name: ${name}`);count++;
 }assert.ok(count>0);return count;
}
const STABLE_CLOSED_NAMES={test:undefined,'yard-player':undefined,'yard-eight-player':'Yard eight-player / ${{ matrix.group }}','browser-plan':undefined,browser:'Browser / ${{ matrix.group }}',touch:undefined,mochi:undefined};
function assertStableJobNames(jobs){for(const [job,name]of Object.entries(STABLE_CLOSED_NAMES))assert.equal(jobs[job].name,name,`Existing check identity must remain stable: ${job}`);assert.equal(jobs['yard-active'].name,'ACTIVE ordinary imports');assert.equal(jobs['yard-active-production'].name,'ACTIVE production image and rollback');assert.equal(jobs['release-ready'].name,'Exact source release acceptance');}
test('unchanged CLOSED jobs check out and disclose exact A, never silently use B',()=>{
 const jobs=metadata(workflow);assertStableJobNames(jobs);
 for(const job of ['test','yard-player','yard-eight-player','browser-plan','browser','touch','mochi']){
  const text=block(job);assert.ok(text,job);assert.match(text,/needs: \[yard-release-mode/);assert.match(text,/ref: \$\{\{ needs.yard-release-mode.outputs.closed_ref \}\}/);
  assert.match(text,/yard-ci-dispatch\.mjs --assert-closed-ref/);assert.match(text,/CLOSED suites source:.*workflow candidate:/);
 }
 for(const required of ['pnpm test','preview/yard-persistent-candidate/run-checks.mjs','preview/yard-persistent-candidate/compile-check.mjs','tests/yard-player-api-contract.test.mjs','tests/yard-eight-player-contract.test.mjs','playwright.yard-eight-player.config.js','tests/yard-mika-supported-pairs.test.mjs'])assert.ok(workflow.includes(required),required);
 assert.match(workflow,/needs: \[test, browser, touch, mochi, yard-eight-player, yard-player\]/);
});
test('parsed job identities stay stable and every upload name is filename-safe',()=>{
 const jobs=metadata(workflow);assert.ok(validateArtifactNames(jobs)>=20);
 assert.equal(jobs.test.name,undefined);assert.ok(jobs.test.steps.some(s=>(s.with.name||'').startsWith('CLOSED-')),'Nested artifact identity does not become a check name');
 const renamed=structuredClone(jobs);renamed.test.name='CLOSED '+ 'a'.repeat(40);assert.throws(()=>assertStableJobNames(renamed),/check identity/);
 const missing=metadata(workflow.replace(/^    name: Browser.*\n/m,''));assert.equal(missing.browser.name,undefined);assert.throws(()=>assertStableJobNames(missing),/check identity/);
 const malformed=structuredClone(jobs),upload=malformed.test.steps.find(s=>/^actions\/upload-artifact@/.test(s.uses||''));upload.with.name='CLOSED / forbidden';assert.throws(()=>validateArtifactNames(malformed),/Illegal artifact name/);
});
test('reusable deploy caller grants only the same read permissions required for exact GHCR A',()=>{
 const caller=metadata(readFileSync(resolve(ownRoot,'.github/workflows/deploy.yml'),'utf8')).validate,callee=metadata(workflow)['yard-active-production'];
 assert.equal(caller.uses,'./.github/workflows/ci.yml');assert.deepEqual(caller.permissions,{contents:'read',packages:'read'});assert.deepEqual(callee.permissions,caller.permissions);
 const production=block('yard-active-production');assert.match(production,/YARD_IMAGE_REPOSITORY: ghcr.io\/le-who\/cc-gh/);assert.match(production,/docker pull "\$\{YARD_IMAGE_REPOSITORY\}@\$\{YARD_CLOSED_DIGEST\}"/);assert.doesNotMatch(production,/packages: write|docker push/);
 const withoutRead=structuredClone(caller);delete withoutRead.permissions.packages;assert.notDeepEqual(withoutRead.permissions,callee.permissions);
});
test('ACTIVE build and production image lanes consume B and are mandatory only in ACTIVE mode',()=>{
 const ordinary=block('yard-active'),production=block('yard-active-production'),aggregate=block('release-ready');
 for(const text of [ordinary,production]){assert.match(text,/if: needs.yard-release-mode.outputs.mode == 'ACTIVE'/);assert.match(text,/ref: \$\{\{ needs.yard-release-mode.outputs.active_ref \}\}/);assert.match(text,/yard-ci-dispatch\.mjs --verify-active/);assert.doesNotMatch(text,/continue-on-error|yard-eight-player-loader|vite.yard-eight-player-candidate/);}
 assert.match(ordinary,/run: pnpm run build/);assert.match(ordinary,/yard-active-runtime-checks\.mjs/);assert.match(ordinary,/perf:guard:build/);
 assert.match(production,/BUILD_ID=\$\{YARD_ACTIVE_COMMIT\}/);assert.match(production,/org.opencontainers.image.revision=\$\{YARD_ACTIVE_COMMIT\}/);assert.match(production,/yard-production-acceptance\.mjs/);assert.match(production,/timeout-minutes: 18/);
 assert.match(aggregate,/if: always\(\)/);assert.match(aggregate,/mode==='ACTIVE'\?'success':'skipped'/);assert.match(aggregate,/yard-active-production/);
});
test('ACTIVE ordinary-import checks contain no policy substitution or candidate options',()=>{
 const source=readFileSync(resolve(ownRoot,'scripts/yard-active-runtime-checks.mjs'),'utf8');
 assert.doesNotMatch(source,/registerHooks|candidateSource|createEightAcceptanceOptions|sourceCatalogActionPolicy/);
 for(const term of ['initializeReleasedPlayerYard','executeReleasedYardAction','createMochiActorMediaEntry','createFamilyActorMediaEntry','renderCompatible','replayed'])assert.ok(source.includes(term));
});

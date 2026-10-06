/** No package, server, database, browser, or network import before these gates. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertCanonicalPgEnvironment,canonicalTestSource} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/qa/yard-canonical-cancel-boundary-20261006');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,process.env.GITHUB_SHA);
assertCanonicalPgEnvironment();
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.equal(process.cwd(),root);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),event.after);
await assert.rejects(fs.access('.env'),'No local dotenv file permitted');
canonicalTestSource(await fs.readFile('game-logic/yard-v2/canonical-locations.mjs','utf8'));
const manifest=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/reviewed-source.json','utf8'));
assert.equal(manifest.base,'cc23a6f2f0f58eda6b21f7950f285e30dde3656e');
assert.equal(execFileSync('git',['rev-parse','HEAD^'],{encoding:'utf8'}).trim(),manifest.base,'One reviewed commit on the specified base required');
assert.equal(execFileSync('git',['rev-parse',`${manifest.base}^{tree}`],{encoding:'utf8'}).trim(),'a7f917a2e7c3d68cf665174df1fc6a97f67df047','Exact published parent tree required');
for(const row of manifest.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));let b;if(row.deleted){await assert.rejects(fs.access(row.path));b=execFileSync('git',['show',`${manifest.base}:${row.path}`]);}else b=await fs.readFile(row.path);assert.equal(b.length,row.bytes,row.path);assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256,row.path);}
const changed=execFileSync('git',['diff','--name-only',manifest.base,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed,[...manifest.files.map(row=>row.path),'qa/yard-canonical-acceptance/reviewed-source.json'].sort());
const expectedWorkflow='.github/workflows/yard-canonical-dynamic.yml';
assert.deepEqual(changed.filter(p=>p.startsWith('.github/workflows/')),[expectedWorkflow],'Only one new workflow may change');
await fs.mkdir('qa/yard-canonical-acceptance/results',{recursive:true});
await fs.writeFile('qa/yard-canonical-acceptance/results/source.json',JSON.stringify({head:event.after,...manifest,qualification:'Exact reviewed integrated source; acceptance not yet run'},null,2)+'\n');

const proof=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/clock-reused-proof.json','utf8'));
assert.equal(proof.base,'17fc659a45b3ffe8559020019cf7453b6e222a11');assert.equal(proof.baseTree,'e1d11bd7eeb50079eeed4dc2e59247cefc42dcd0');assert.equal(proof.runId,'37498940977');assert.equal(proof.receipt.head,proof.base);
const clockPaths=['src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs','tests/yard-canonical-real-renderer.test.mjs'];
assert.deepEqual(Object.keys(proof.allowedClockFiles),clockPaths);
for(const p of clockPaths)assert.equal(createHash('sha256').update(await fs.readFile(p)).digest('hex'),proof.allowedClockFiles[p],'Exact reviewed clock fix required');
const protectedRows=execFileSync('git',['ls-tree','-rz','--full-tree','HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(row=>{const p=row.split('\t')[1];return !clockPaths.includes(p)&&!p.startsWith('qa/yard-canonical-acceptance/')&&p!=='.github/workflows/yard-canonical-dynamic.yml';});
assert.equal(protectedRows.length,proof.protectedEntryCount);assert.equal(createHash('sha256').update(protectedRows.join('\0')+'\0').digest('hex'),proof.protectedGitEntriesSha256,'Every backend/dependency/default-build input outside the reviewed optional scene must stay identical');
assert.equal(proof.receipt.stages.DATABASE,'success');assert.equal(proof.receipt.stages.BUILD,'success');assert.equal(proof.receipt.stages.BROWSER,'failure');assert.deepEqual(proof.postgres,{tests:9,pass:9,fail:0,skipped:0});
assert.equal(proof.defaultBuild.mode,'default');assert.equal(proof.defaultBuild.assetGuard.passed,true);assert.equal(proof.defaultBuild.pipClosure.complete,true);assert.equal(proof.defaultBuild.pipClosure.mode,'off');assert.equal(proof.defaultBuild.pipClosure.optionalModuleCount,0);assert.equal(proof.defaultBuild.pipClosure.vendor.included,false);assert.deepEqual(proof.defaultBuild.pipClosure.optionalAssets,[]);assert.equal(proof.browserReused,false);
await fs.writeFile('qa/yard-canonical-acceptance/results/reused.json',JSON.stringify({verified:true,...proof,freshRequired:['clock/scene/renderer checks','preview production build and every closure/cap','actual auth/API/disposable-PostgreSQL full browser']},null,2)+'\n');

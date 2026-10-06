/** No package, server, database, browser, or network import before these gates. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertCanonicalPgEnvironment,canonicalTestSource} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/qa/yard-canonical-ready-check-20261006');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,process.env.GITHUB_SHA);
assertCanonicalPgEnvironment();
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.equal(process.cwd(),root);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),event.after);
await assert.rejects(fs.access('.env'),'No local dotenv file permitted');
canonicalTestSource(await fs.readFile('game-logic/yard-v2/canonical-locations.mjs','utf8'));
const manifest=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/reviewed-source.json','utf8'));
assert.equal(manifest.base,'4591a151a22503374999dfd5b207b38c4bf631e5');
assert.equal(execFileSync('git',['rev-parse','HEAD^'],{encoding:'utf8'}).trim(),manifest.base,'One reviewed commit on the specified base required');
assert.equal(execFileSync('git',['rev-parse',`${manifest.base}^{tree}`],{encoding:'utf8'}).trim(),'6e8fcefa68a12f364f2d4ab0c39377547887e225','Exact published parent tree required');
for(const row of manifest.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));let b;if(row.deleted){await assert.rejects(fs.access(row.path));b=execFileSync('git',['show',`${manifest.base}:${row.path}`]);}else b=await fs.readFile(row.path);assert.equal(b.length,row.bytes,row.path);assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256,row.path);}
const changed=execFileSync('git',['diff','--name-only',manifest.base,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed,[...manifest.files.map(row=>row.path),'qa/yard-canonical-acceptance/reviewed-source.json'].sort());
assert(changed.every(p=>p==='.github/workflows/yard-canonical-dynamic.yml'||p.startsWith('qa/yard-canonical-acceptance/')),'The corrective commit may change only this acceptance harness and its workflow');
const expectedWorkflow='.github/workflows/yard-canonical-dynamic.yml';
assert.deepEqual(changed.filter(p=>p.startsWith('.github/workflows/')),[expectedWorkflow],'Only one new workflow may change');
await fs.mkdir('qa/yard-canonical-acceptance/results',{recursive:true});
await fs.writeFile('qa/yard-canonical-acceptance/results/source.json',JSON.stringify({head:event.after,...manifest,qualification:'Exact reviewed integrated source; acceptance not yet run'},null,2)+'\n');

const reused=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/reused-proof.json','utf8'));
assert.equal(reused.base,manifest.base);assert.equal(reused.baseTree,'6e8fcefa68a12f364f2d4ab0c39377547887e225');
const inventory=execFileSync('git',['ls-tree','-rz','--full-tree','HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(row=>{const p=row.split('\t')[1];return !p.startsWith('qa/yard-canonical-acceptance/')&&p!=='.github/workflows/yard-canonical-dynamic.yml';});
assert.equal(inventory.length,reused.protectedEntryCount);assert.equal(createHash('sha256').update(inventory.join('\0')+'\0').digest('hex'),reused.protectedGitEntriesSha256,'Reused source/PG/default-build proof requires exact unchanged protected files');
assert.deepEqual(reused.runs.map(r=>r.runId),['37487170407','37489937106']);
for(const r of reused.runs){assert.equal(r.receipt.stages.SOURCE,'success');assert.equal(r.receipt.stages.DATABASE,'success');assert.equal(r.receipt.stages.BUILD,'success');assert.equal(r.receipt.stages.BROWSER,'failure');assert.deepEqual(r.source,{tests:190,pass:190,fail:0,skipped:0});assert.deepEqual(r.postgres,{tests:9,pass:9,fail:0,skipped:0});assert.equal(r.defaultBuild.mode,'default');assert.equal(r.defaultBuild.assetGuard.passed,true);assert.equal(r.defaultBuild.pipClosure.complete,true);assert.equal(r.browserReused,false);}
await fs.writeFile('qa/yard-canonical-acceptance/results/reused.json',JSON.stringify({verified:true,...reused,scope:['190 unchanged source tests','9 unchanged PostgreSQL tests','default off production build'],freshRequired:['preview production build and all current closure/budget gates','real auth/API/disposable-PostgreSQL browser flow']},null,2)+'\n');

/** No package, server, database, browser, or network import before these gates. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertCanonicalPgEnvironment,canonicalTestSource} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/qa/yard-canonical-wrap-evidence-20261006');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,process.env.GITHUB_SHA);
assertCanonicalPgEnvironment();
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.equal(process.cwd(),root);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),event.after);
await assert.rejects(fs.access('.env'),'No local dotenv file permitted');
canonicalTestSource(await fs.readFile('game-logic/yard-v2/canonical-locations.mjs','utf8'));
const manifest=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/reviewed-source.json','utf8'));
assert.equal(manifest.base,'cf8457110c5e1395b2635ff960bd50b38400be3d');
assert.equal(execFileSync('git',['rev-parse','HEAD^'],{encoding:'utf8'}).trim(),manifest.base,'One reviewed commit on the specified base required');
assert.equal(execFileSync('git',['rev-parse',`${manifest.base}^{tree}`],{encoding:'utf8'}).trim(),'dab9c17cc8a3932497fd5e2013a49b8e817ed126','Exact published parent tree required');
for(const row of manifest.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));let b;if(row.deleted){await assert.rejects(fs.access(row.path));b=execFileSync('git',['show',`${manifest.base}:${row.path}`]);}else b=await fs.readFile(row.path);assert.equal(b.length,row.bytes,row.path);assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256,row.path);}
const changed=execFileSync('git',['diff','--name-only',manifest.base,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed,[...manifest.files.map(row=>row.path),'qa/yard-canonical-acceptance/reviewed-source.json'].sort());
const expectedWorkflow='.github/workflows/yard-canonical-dynamic.yml';
assert.deepEqual(changed.filter(p=>p.startsWith('.github/workflows/')),[expectedWorkflow],'Only one new workflow may change');
await fs.mkdir('qa/yard-canonical-acceptance/results',{recursive:true});
await fs.writeFile('qa/yard-canonical-acceptance/results/source.json',JSON.stringify({head:event.after,...manifest,qualification:'Exact reviewed integrated source; acceptance not yet run'},null,2)+'\n');

const proof=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/hud-reused-proof.json','utf8'));
assert.equal(proof.base,'770a560a78d8e011d582411a8ae8569783b83116');assert.equal(proof.runId,'37513128014');assert.equal(proof.receipt.head,proof.base);
const reviewedPaths=Object.keys(proof.allowedReviewedFiles);assert.equal(reviewedPaths.length,4);
for(const p of reviewedPaths)assert.equal(createHash('sha256').update(await fs.readFile(p)).digest('hex'),proof.allowedReviewedFiles[p],'Exact reviewed layout fix required: '+p);
const protectedRows=execFileSync('git',['ls-tree','-rz','--full-tree','HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(row=>{const p=row.split('\t')[1];return !reviewedPaths.includes(p)&&!p.startsWith('qa/yard-canonical-acceptance/')&&p!=='.github/workflows/yard-canonical-dynamic.yml';});
assert.equal(protectedRows.length,proof.protectedEntryCount);assert.equal(createHash('sha256').update(protectedRows.join('\0')+'\0').digest('hex'),proof.protectedGitEntriesSha256,'All acquisition/UI handlers, backend, dependency and asset inputs must remain identical');
assert.equal(proof.receipt.stages.SOURCE,'success');assert.equal(proof.receipt.stages.BUILD,'success');assert.equal(proof.receipt.stages.BROWSER,'failure');assert.equal(proof.acquisition.sections.actions,'passed');assert.equal(proof.acquisition.sections.hud,'failed');assert.equal(proof.acquisition.cases.length,4);assert.equal(proof.defaultBuildReused,false);
assert.equal(proof.domain.runId,'37498940977');assert.equal(proof.domain.verifiedInPriorRun,true);assert.deepEqual(proof.domain.postgres,{tests:9,pass:9,fail:0,skipped:0});
await fs.writeFile('qa/yard-canonical-acceptance/results/reused.json',JSON.stringify({verified:true,...proof,freshRequired:['scroll reachability and compact layout source checks','default and preview production builds, all closure and caps','native HUD controls on the real current auth/API/disposable PostgreSQL']},null,2)+'\n');

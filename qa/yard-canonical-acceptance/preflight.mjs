/** No package, server, database, browser, or network import before these gates. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertCanonicalPgEnvironment,canonicalTestSource} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/qa/yard-canonical-render-diagnostics-20261006');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,process.env.GITHUB_SHA);
assertCanonicalPgEnvironment();
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.equal(process.cwd(),root);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),event.after);
await assert.rejects(fs.access('.env'),'No local dotenv file permitted');
canonicalTestSource(await fs.readFile('game-logic/yard-v2/canonical-locations.mjs','utf8'));
const manifest=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/reviewed-source.json','utf8'));
assert.equal(manifest.base,'720dd25ec1e326a5cd50ce986c4bb48373a796c8');
assert.equal(execFileSync('git',['rev-parse','HEAD^'],{encoding:'utf8'}).trim(),manifest.base,'One reviewed commit on the specified base required');
assert.equal(execFileSync('git',['rev-parse',`${manifest.base}^{tree}`],{encoding:'utf8'}).trim(),'9f41d167920bcfc57af9a17b4d144bed8ccb3a0d','Exact published parent tree required');
for(const row of manifest.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));let b;if(row.deleted){await assert.rejects(fs.access(row.path));b=execFileSync('git',['show',`${manifest.base}:${row.path}`]);}else b=await fs.readFile(row.path);assert.equal(b.length,row.bytes,row.path);assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256,row.path);}
const changed=execFileSync('git',['diff','--name-only',manifest.base,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed,[...manifest.files.map(row=>row.path),'qa/yard-canonical-acceptance/reviewed-source.json'].sort());
const expectedWorkflow='.github/workflows/yard-canonical-dynamic.yml';
assert.deepEqual(changed.filter(p=>p.startsWith('.github/workflows/')),[expectedWorkflow],'Only one new workflow may change');
await fs.mkdir('qa/yard-canonical-acceptance/results',{recursive:true});
await fs.writeFile('qa/yard-canonical-acceptance/results/source.json',JSON.stringify({head:event.after,...manifest,qualification:'Exact reviewed integrated source; acceptance not yet run'},null,2)+'\n');

/** Pure admission checks run before dependencies, database imports or browser launch. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertCanonicalPgEnvironment,canonicalTestSource} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
const base='67d68fec4b750c5ead5b759ebbfec3239d6f3da5',dir='qa/yard-placement-redraw',out='qa/yard-canonical-acceptance/results';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/qa/yard-placement-redraw-20261006');
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,process.env.GITHUB_SHA);assert.equal(git('rev-parse','HEAD'),event.after);assert.equal(git('rev-parse','HEAD^'),base);assert.equal(process.cwd(),git('rev-parse','--show-toplevel'));
assertCanonicalPgEnvironment();await assert.rejects(fs.access('.env'));canonicalTestSource(await fs.readFile('game-logic/yard-v2/canonical-locations.mjs','utf8'));
const manifest=JSON.parse(await fs.readFile(dir+'/reviewed-source.json','utf8'));assert.equal(manifest.base,base);assert.equal(git('rev-parse',base+'^{tree}'),manifest.baseTree);
const allowlist=JSON.parse(await fs.readFile(dir+'/allowed-files.json','utf8'));assert.deepEqual(manifest.files.map(r=>r.path).sort(),allowlist.files.filter(p=>p!==dir+'/reviewed-source.json').sort());
for(const row of manifest.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));const b=await fs.readFile(row.path);assert.equal(b.length,row.bytes,row.path);assert.equal(sha(b),row.sha256,row.path);}
const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean).sort();assert.deepEqual(changed,allowlist.files.slice().sort(),'Exact reviewed finite allowlist only');assert.deepEqual(changed.filter(p=>p.startsWith('.github/workflows/')),['.github/workflows/yard-placement-redraw.yml']);assert(!changed.some(p=>/^(public\/|game-logic\/|package|pnpm-lock|server\.|db\.|account|socket)/.test(p)),'No assets, dependencies, API, economy, policy or database changes permitted');
const failure=JSON.parse(await fs.readFile(dir+'/original-failure.json','utf8'));assert.equal(failure.original.sha256,'ff54410518a69cebcdeda4d8b25d38e41ec5cd209825cd7f148bbd39103959d6');assert.deepEqual(failure.flatFrames.map(r=>r.frame),[117,124]);assert.equal(failure.expectedFailure,true);assert.equal(failure.passed,false);
await fs.mkdir(out,{recursive:true});await fs.copyFile(dir+'/original-failure.json',out+'/original-failure.json');await fs.writeFile(out+'/source.json',JSON.stringify({head:event.after,...manifest,qualification:'Exact reviewed source; fresh compositor evidence required'},null,2)+'\n');
// Preserve the existing honest acquisition provenance needed by the unchanged HUD
// runner. Fresh actions and video below do not inherit a prior browser pass.
const proof=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/hud-reused-proof.json','utf8'));assert.equal(proof.base,'770a560a78d8e011d582411a8ae8569783b83116');assert.equal(proof.runId,'37513128014');assert.equal(proof.acquisition.sections.actions,'passed');assert.equal(proof.acquisition.sections.hud,'failed');
await fs.writeFile(out+'/reused.json',JSON.stringify({...proof,verified:true,scope:'Historical acquisition provenance only. Fresh redraw transitions, encoded-frame gate, full11HUD and default/preview builds are required.',freshRequired:['encoded continuous transition proof','full11HUD','default and preview production builds']},null,2)+'\n');
console.log(JSON.stringify({head:event.after,base,files:changed.length,sourceAdmission:'passed',browser:'NOT_RUN'}));

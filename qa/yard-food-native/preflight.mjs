/** No dependencies, DB or listener imported until exact source and branch admission. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
import {BASE,BRANCH,DIR,FOOD_SOURCE,FOOD_SHA,FOOD_BYTES,LIMITS} from './identity.mjs';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(process.env.GITHUB_REF,'refs/heads/'+BRANCH);
const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,process.env.GITHUB_SHA);assert.equal(git('rev-parse','HEAD'),event.after);assert.equal(git('rev-parse','HEAD^'),BASE);assert.equal(process.cwd(),git('rev-parse','--show-toplevel'));
assertCanonicalPgEnvironment();await assert.rejects(fs.access('.env'));
const manifest=JSON.parse(await fs.readFile(DIR+'/reviewed-source.json','utf8')),allow=JSON.parse(await fs.readFile(DIR+'/allowed-files.json','utf8'));
assert.equal(allow.finalized,true);assert.equal(manifest.base,BASE);assert.equal(git('rev-parse',BASE+'^{tree}'),manifest.baseTree);assert.deepEqual(manifest.limits,LIMITS);
assert.deepEqual(manifest.files.map(r=>r.path).sort(),allow.files.filter(p=>p!==DIR+'/reviewed-source.json').sort());
for(const row of manifest.files){assert(!row.path.startsWith('/')&&!row.path.split('/').includes('..'));const b=await fs.readFile(row.path);assert.equal(b.length,row.bytes,row.path);assert.equal(sha(b),row.sha256,row.path);}
const changed=git('diff','--name-only',BASE,'HEAD').split('\n').filter(Boolean).sort();assert.deepEqual(changed,allow.files.slice().sort());assert.deepEqual(changed.filter(p=>p.startsWith('.github/workflows/')),['.github/workflows/yard-food-native.yml']);
assert(!changed.some(p=>/^(public\/|package|pnpm-lock|server\.|db\.|account|socket)/.test(p)),'No public assets, dependencies, database, auth, socket or server changes');assert(!changed.some(p=>/\.(blend|blend1|fbx|obj)$/i.test(p)||/(^|\/)(private|secrets)(\/|\.)/i.test(p)),'No native source/private metadata');
for(const protectedPath of ['.github/workflows/deploy.yml','.github/workflows/ci.yml','game-logic/yard-catalog.js','src/games/companion-yard-v2/pip-prototype/resources.mjs'])assert.equal(sha(await fs.readFile(protectedPath)),sha(execFileSync('git',['show',BASE+':'+protectedPath])),'Unchanged deployment, catalog prices and strict caps required: '+protectedPath);
const deployment=await fs.readFile('.github/workflows/deploy.yml','utf8');assert(deployment.includes('branches:\n      - codex/telegram-pixi-vps-migration'));assert(!deployment.includes(BRANCH));
const food=await fs.readFile(FOOD_SOURCE);assert.equal(food.length,FOOD_BYTES);assert.equal(sha(food),FOOD_SHA);
for(const[path,token]of[['game-logic/yard-v2/canonical-locations.mjs','export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;'],['game-logic/yard-v2/canonical-food-protocol.mjs','export const CANONICAL_FOOD_LOCATION_ENABLED=false;']])assert.equal((await fs.readFile(path,'utf8')).split(token).length,2,'Product default must stay closed');
const contract=JSON.parse(await fs.readFile('game-logic/yard-v2/canonical-food-contract.json','utf8'));for(const key of ['presentationReady','runtimeActivated','visitAdmission'])assert.equal(contract[key],false);
const out='qa/yard-canonical-acceptance/results',work='qa/yard-canonical-acceptance/work';await fs.mkdir(out,{recursive:true});await fs.mkdir(work,{recursive:true});await fs.writeFile(work+'/food-fixtures.json','[]\n');
await fs.writeFile(out+'/source.json',JSON.stringify({head:event.after,...manifest,qualification:'Exact reviewed inactive source. Native execution and visual acceptance pending.'},null,2)+'\n');
const proof=JSON.parse(await fs.readFile('qa/yard-canonical-acceptance/hud-reused-proof.json','utf8'));assert.equal(proof.runId,'37513128014');assert.equal(proof.acquisition.sections.actions,'passed');assert.equal(proof.acquisition.sections.hud,'failed');
await fs.writeFile(out+'/reused.json',JSON.stringify({...proof,verified:true,scope:'Historical acquisition only. Run37535423734 separately established prior full11HUD/redraw. This new food pass requires fresh normal builds, all11HUD, food actions and encoded evidence.'},null,2)+'\n');
console.log(JSON.stringify({sourceAdmission:'passed',base:BASE,head:event.after,files:changed.length,limits:LIMITS,browser:'NOT_RUN'}));

/** Test-only old domain / HTTP fixture. Not an old Express deployment.
 * Reads actual guarded DB rows; never writes them or grants inventory. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pins from './old-domain-pins.json' with {type:'json'};
const root=new URL('../../',import.meta.url),overrides=['game-logic/yard-v2/service.mjs','game-logic/yard-v2/actions.mjs'];
export async function oldDomain(){
 const texts={};
 for(const [p,sha]of Object.entries(pins.files)){
  const old=execFileSync('git',['show',`${pins.revision}:${p}`],{cwd:root,env:{...process.env,GIT_NO_LAZY_FETCH:'1'},timeout:10000,maxBuffer:16*1024*1024});
  assert.equal(createHash('sha256').update(old).digest('hex'),sha,p+' historical source');
  if(overrides.includes(p))texts[p]=old.toString();else assert.equal(createHash('sha256').update(await fs.readFile(new URL(p,root))).digest('hex'),sha,p+' required dependency must match old source');
 }
 const moduleURL=(p,text)=>'data:text/javascript;base64,'+Buffer.from(text.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,q,rel)=>`from '${new URL(rel,new URL(p,root)).href}'`)).toString('base64');
 const actions=moduleURL(overrides[1],texts[overrides[1]]),old=await import(moduleURL(overrides[0],texts[overrides[0]].replace("'./actions.mjs'",`'${actions}'`)));
 return{
  revision:pins.revision,dependencyCount:Object.keys(pins.files).length,
  reject(saved,command){assert.equal(saved.id,command.accountId);assert.equal(saved._yardV2.version,2);const copy=structuredClone(saved),before=structuredClone(copy);const r=old.executePersistentYardAction(copy,command.action,command.payload,{actionId:command.clientActionId,now:Date.now()});assert.equal(r.status,409);assert.equal(r.error,'UNSUPPORTED_YARD_STORAGE_VERSION');assert.deepEqual(copy,before,'Old service must not mutate the copied PostgreSQL row');return{status:r.status,body:{error:r.error}};},
  public(saved){const copy=structuredClone(saved),before=structuredClone(copy);const r=old.publicPersistentYard(copy,{now:Date.now()});assert.equal(r.error,'UNSUPPORTED_YARD_STORAGE_VERSION');assert.equal(r.mutable,false);assert.deepEqual(copy,before,'Old read must preserve the copied PostgreSQL row');return r;}
 };
}

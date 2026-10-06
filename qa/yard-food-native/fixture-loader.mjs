/** Source-pinned option seam in this disposable process only. Original defaults stay false. */
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
import {BRANCH} from './identity.mjs';
assertCanonicalPgEnvironment(process.env,{api:true});
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(process.env.GITHUB_REF,'refs/heads/'+BRANCH);assert.equal(process.env.YARD_FOOD_NATIVE_API,'1');
assert.equal(process.argv.length,2);assert.equal(resolve(process.argv[1]),fileURLToPath(new URL('./api-server.mjs',import.meta.url)));assert.equal(resolve(process.cwd()),fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,''));
assert(!existsSync(new URL('../../.env',import.meta.url)));
const file='game-logic/yard-v2/service.mjs',url=new URL('../../'+file,import.meta.url).href;
const source=readFileSync(new URL(url),'utf8'),manifest=JSON.parse(readFileSync(new URL('./reviewed-source.json',import.meta.url),'utf8')),row=manifest.files.find(r=>r.path===file);
assert(row);assert.equal(createHash('sha256').update(source).digest('hex'),row.sha256);
const {fixtureServiceSource}=await import('./source-gate.mjs');
const patched=fixtureServiceSource(source,row.sha256,new URL('./fixture-options.mjs',import.meta.url).href);
registerHooks({load(candidate,context,next){return candidate===url?{shortCircuit:true,format:'module',source:patched}:next(candidate,context);}});

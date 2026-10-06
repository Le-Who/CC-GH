/** Enable one pinned closed capability only in this explicitly guarded test process.
 * No DB/Express/Redis substitutes, actor overrides, or product source writes. */
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertCanonicalPgEnvironment,canonicalTestSource,assertCanonicalPgData,CANONICAL_PG_DATA_SHA256} from './yard-canonical-pg-guard.mjs';
const api=process.env.YARD_CANONICAL_API_TEST==='1';
assertCanonicalPgEnvironment(process.env,{api});
const root=new URL('../../',import.meta.url);
if(existsSync(new URL('.env',root)))throw Error('Canonical CI must not load a local dotenv credentials file');
if(api&&(resolve(process.cwd())!==resolve(fileURLToPath(root))||resolve(process.argv[1]||'')!==fileURLToPath(new URL('./yard-canonical-api-server.mjs',import.meta.url))||process.argv.length!==2))throw Error('Only the finite canonical API server from the checkout root may use this preload');
const url=new URL('../../game-logic/yard-v2/canonical-locations.mjs',import.meta.url).href;
// Validate immediately, including when a process never gets as far as importing the module.
const source=canonicalTestSource(readFileSync(new URL(url),'utf8'));
for(const name of Object.keys(CANONICAL_PG_DATA_SHA256))assertCanonicalPgData(name,readFileSync(new URL(name,url),'utf8'));
registerHooks({load(candidate,context,next){
  return candidate===url?{shortCircuit:true,format:'module',source}:next(candidate,context);
}});

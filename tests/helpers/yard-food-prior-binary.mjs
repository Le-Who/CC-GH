/** Exact pre-food domain boundary, rehydrated read-only from repository history.
 * Other imports are shared unchanged utility/catalog/orchestration modules. */
import {execFileSync} from 'node:child_process';
export const PRIOR_REVISION='32981e328fbfc7993eb08c3bfcf6eb7634dceb53';
const root=new URL('../../',import.meta.url);
const source=path=>execFileSync('git',['show',`${PRIOR_REVISION}:${path}`],{cwd:root,encoding:'utf8'});
const url=(path,text)=>'data:text/javascript;base64,'+Buffer.from(text.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,q,relative)=>`from '${new URL(relative,new URL(path,root)).href}'`)).toString('base64');
const locations=url('game-logic/yard-v2/canonical-locations.mjs',source('game-logic/yard-v2/canonical-locations.mjs'));
const actions=url('game-logic/yard-v2/actions.mjs',source('game-logic/yard-v2/actions.mjs').replace("'./canonical-locations.mjs'",`'${locations}'`));
export const prior=await import(url('game-logic/yard-v2/service.mjs',source('game-logic/yard-v2/service.mjs').replace("'./actions.mjs'",`'${actions}'`).replace("'./canonical-locations.mjs'",`'${locations}'`)));

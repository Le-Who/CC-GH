/** Explicit test-only substitution of one immutable policy module. No production
 * environment switch exists. Actor/media acceptance and economics stay untouched. */
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const url=new URL('../../game-logic/yard-v2/release-policy.mjs',import.meta.url).href;
if(process.env.NODE_ENV!=='test'||process.env.YARD_PLAYER_WIRING_TEST!=='1')throw Error('Explicit isolated Yard player wiring test required');
registerHooks({load(candidate,context,next){
 if(candidate!==url)return next(candidate,context);
 const source=readFileSync(new URL(url),'utf8');
 if((source.match(/enabled: false/g)||[]).length!==1)throw Error('Exact closed rollout policy required');
 return {shortCircuit:true,format:'module',source:source.replace('enabled: false','enabled: true')};
}});

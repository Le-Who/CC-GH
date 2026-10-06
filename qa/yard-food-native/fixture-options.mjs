/** Read-only trusted fixture enrollment, never derived from HTTP input or production state. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=new URL('../yard-canonical-acceptance/work/food-fixtures.json',import.meta.url);
export function fixtureOptions(player,options={}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.YARD_FOOD_NATIVE_API,'1');
 const entries=JSON.parse(readFileSync(file,'utf8'));
 assert(Array.isArray(entries)&&entries.length<=8);assert(entries.every(e=>/^acct:[a-f0-9-]{36}$/.test(e.id)&&typeof e.food==='boolean'));
 assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
 return {...options,canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:entries.find(e=>e.id===player?.id)?.food===true};
}

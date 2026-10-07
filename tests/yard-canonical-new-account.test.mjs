import test from 'node:test';
import assert from 'node:assert/strict';
import {withPlayerLock} from '../playerManager.js';
import {closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
test('new account enters the enabled saved Yard with unchanged source starter economy and no placed prop',async()=>{
 const id='fresh-saved-account-'+process.pid;
 const first=await withPlayerLock(id,p=>({version:p._yardV2?.version,yard:structuredClone(p.yard),runtime:structuredClone(p._yardV2?.runtime)}));
 assert.equal(first.version,3);assert.equal(first.yard.currencies.treats,80);
 assert.deepEqual(first.runtime.canonicalPlacements,[]);assert.deepEqual(first.yard.goodieInventory,{yarn_mouse:1,sun_cushion:1});
 await withPlayerLock(id,p=>{p.yard.currencies.treats=79;});
 const later=await withPlayerLock(id,p=>p.yard.currencies.treats);assert.equal(later,79);
 await closeCanonicalRuntime();
});

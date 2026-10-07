import test from 'node:test';
import assert from 'node:assert/strict';
import {captureCanonicalRevision,stampCanonicalRevision,newCanonicalRevision} from '../game-logic/yard-v2/canonical-revision.mjs';
const fixture=()=>({id:'revision-owner',_version:'account-1',resources:{gold:5},yard:{bowls:[{id:'bowl-1',servings:4}],lastSimulatedAt:1000},_yardV2:{format:'yard-persistent/v1',version:3,runtime:{version:1,canonicalRevision:newCanonicalRevision(),cursorMs:1000,nextOpportunityAt:3601000,canonicalPlacements:[],canonicalVisits:{},canonicalPending:null,events:[],commandReceipts:{},actionReceipts:{}}}});
test('unrelated account changes and no-event watermarks preserve the Yard fence',()=>{
 const p=fixture(),before=captureCanonicalRevision(p);p._version='account-2';p.resources.gold+=1;p.yard.lastSimulatedAt=2000;p._yardV2.runtime.cursorMs=2000;p._yardV2.runtime.events.push({type:'diagnostic'});p._yardV2.runtime.commandReceipts.nonce={status:400};
 assert.equal(stampCanonicalRevision(p,before),false);assert.equal(p._yardV2.runtime.canonicalRevision,before.revision);
});
test('stock ABA, layout, reservation and opportunity changes each get a new generation',()=>{
 const p=fixture(),generations=new Set([p._yardV2.runtime.canonicalRevision]);
 for(const change of [()=>p.yard.bowls[0].servings--,()=>p.yard.bowls[0].servings++,()=>p._yardV2.runtime.canonicalPlacements.push({slotId:'a'}),()=>p._yardV2.runtime.canonicalVisits.a={status:'active'},()=>p._yardV2.runtime.nextOpportunityAt+=3600000]){
  const before=captureCanonicalRevision(p);change();assert.equal(stampCanonicalRevision(p,before),true);assert(!generations.has(p._yardV2.runtime.canonicalRevision));generations.add(p._yardV2.runtime.canonicalRevision);
 }
});
test('callback cannot replace a fence without a domain change; old/future containers stay untouched',()=>{
 const p=fixture(),before=captureCanonicalRevision(p);p._yardV2.runtime.canonicalRevision='callback-chosen';stampCanonicalRevision(p,before);assert.equal(p._yardV2.runtime.canonicalRevision,before.revision);
 for(const version of [1,2,4]){const x=fixture();x._yardV2.version=version;const original=structuredClone(x);assert.equal(captureCanonicalRevision(x),null);assert.equal(stampCanonicalRevision(x,null),false);assert.deepEqual(x,original);}
});

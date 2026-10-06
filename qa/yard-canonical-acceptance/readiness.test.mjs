import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assertReadySnapshot} from './browser-helpers.mjs';
const ready=()=>({player:{id:'fixture'},yardRuntime:{version:1,status:'ready',mutable:true,itemPlacementCapabilities:{enabled:true,locationId:'pip-garden'},canonicalPlacements:[]}});
test('readiness accepts an authenticated known canonical snapshot independently of indicator visibility',()=>assert.equal(assertReadySnapshot(ready(),'fixture').player.id,'fixture'));
test('foreign, missing, read-only and unknown snapshots cannot satisfy readiness',()=>{
 for(const change of[s=>s.player.id='other',s=>delete s.player,s=>s.yardRuntime.status='review-required',s=>s.yardRuntime.mutable=false,s=>s.yardRuntime.itemPlacementCapabilities.enabled=false,s=>delete s.yardRuntime.canonicalPlacements]){const s=ready();change(s);assert.throws(()=>assertReadySnapshot(s,'fixture'));}
});
test('boot and reload share authenticated readiness; hidden ready indicator never requires visibility',async()=>{
 const helper=await fs.readFile(new URL('./browser-helpers.mjs',import.meta.url),'utf8'),spec=await fs.readFile(new URL('./acceptance.spec.mjs',import.meta.url),'utf8');
 assert.match(helper,/status-dot\.ready'\)\)\.toHaveCount\(1/);assert.doesNotMatch(helper+spec,/status-dot\.ready'\)\)\.toBeVisible/);
 assert.match(helper,/waitForYardReady\(page,f,/);assert.match(spec,/waitForYardReady\(p,fixture,\(\)=>p\.reload\(\)\)/);
 assert.match(spec,/startup-failure/);assert.match(spec,/new-hud-initial/);
});

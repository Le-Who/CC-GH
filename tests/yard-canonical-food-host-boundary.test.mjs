import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isCanonicalFoodPreviewAllowed} from '../src/games/companion-yard-v2/pip-preview-gate.mjs';
import {createSceneOwner} from '../src/games/companion-yard-v2/scene-owner.mjs';
import {OPTIONAL_PIP_MEDIA_BYTES,OTHER_NON_FAMILY_ASSET_CEILING} from '../scripts/yard-ui-media-budget.mjs';
import policy from '../scripts/yard-ui-media-budget.json' with {type:'json'};
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('canonical food needs the preview build and two exact independent per-page opt-ins',()=>{
 const valid='?yardPipPreview=1&yardCanonicalFood=1';assert.equal(isCanonicalFoodPreviewAllowed({enabled:true,search:valid}),true);
 for(const options of[{}, {enabled:false,search:valid},{enabled:'true',search:valid},{enabled:true,search:'?yardCanonicalFood=1'},{enabled:true,search:'?yardPipPreview=1'}, {enabled:true,search:valid+'&yardCanonicalFood=0'},{enabled:true,search:valid+'&yardPipPreview=1'}])assert.equal(isCanonicalFoodPreviewAllowed(options),false);
});
test('source food payload earns only its exact optional bytes; default gate and lazy source ownership remain intact',async()=>{
 const row=policy.optionalMedia.find(r=>r.source.endsWith('/food-r2/yard-food-source-r2.glb'));assert.ok(row);assert.equal(row.bytes,251996);assert.equal(row.path,'assets/yard-food-source-r2-ed618ed41d65.glb');
 const bytes=await fs.readFile(new URL('../'+row.source,import.meta.url));assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.equal(OPTIONAL_PIP_MEDIA_BYTES,5565935+251996);assert.equal(OTHER_NON_FAMILY_ASSET_CEILING,73470314);
 const entry=await fs.readFile(new URL('../src/games/companion-yard-v2/scene-entry.mjs',import.meta.url),'utf8');assert.match(entry,/VITE_YARD_PIP_PREVIEW==='true'\s*\?import\('\.\/pip-prototype\/yard-pip-scene.mjs'\)/);
 const source=await fs.readFile(new URL('../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/new URL\([^\n]*food-r2/);
});
test('account A-B-A and context restart retire the previous owner before creating another',async()=>{
 globalThis.window=new EventTarget();const created=[],retire=deferred(),canvas={width:1,height:1};let first=true;
 const owner=createSceneOwner(canvas,{prototypeAllowed:true,canonicalFoodPreview:true,uiImageOwner:{setAdmissionCheck(){}},createLegacy:()=>({update(){},dispose(){}}),loadPrototype:async()=>({createPipYardScene:(_canvas,options)=>{const item={options,updates:[],disposeCount:0};created.push(item);return{update:s=>item.updates.push(s?.player?.id),dispose(){item.disposeCount++;if(first){first=false;return retire.promise;}},diagnostics:()=>({})};}})});
 const sessionA={};owner.update({player:{id:'A'}},{accountSession:sessionA});await owner.ready;await owner.setCanonicalItemsEnabled(true);assert.equal(created.length,1);
 owner.update({player:{id:'B'}},{accountSession:{}});owner.update({player:{id:'A'}},{accountSession:{}});await flush();assert.equal(created.length,1);assert.equal(created[0].disposeCount,1);
 retire.resolve();await flush();assert.equal(created.length,2);assert.deepEqual(created[1].updates,['A']);assert.notEqual(created[0].options.ownerKey,created[1].options.ownerKey);assert.equal(created[1].options.canonicalFoodPreview,true);
 created[0].options.onRestartRequired();await flush();assert.equal(created.length,2,'stale context callback is fenced');created[1].options.onRestartRequired();await flush();assert.equal(created.length,3);assert.equal(created[1].disposeCount,1);await owner.dispose();delete globalThis.window;
});

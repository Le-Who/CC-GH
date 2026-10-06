import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalCapability,canonicalPlacements,canonicalItemState,checkCanonicalPlacement,CANONICAL_LOCATION,CANONICAL_ITEM} from '../src/game-state/canonicalYardItems.mjs';
import {canonicalItemCapabilities,canonicalFootprintValid} from '../game-logic/yard-v2/canonical-locations.mjs';
import {canonicalItemCatalog} from '../src/games/companion-yard-v2/pip-prototype/item-catalog.mjs';
import {catalogPreview,sceneCatalogPreview} from '../src/games/companion-yard-v2/catalog-ui.mjs';
import {uiImageLifetimeLedger} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {createCleanProjection} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import {createPipYardScene} from '../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {createUiImageReserve} from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import {admitPipResources} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
import {makePlanterInspection,samplePlanterInspection} from '../src/games/companion-yard-v2/pip-prototype/planter-interaction.mjs';
const base=new URL('../src/games/companion-yard-v2/pip-prototype/',import.meta.url);
const descriptor=JSON.parse(await fs.readFile(new URL('data/location.json',base))),setup=JSON.parse(await fs.readFile(new URL('data/fixture.json',base)));
const record=(x=98,y=118)=>({...CANONICAL_LOCATION,slotId:'canonical:owned',goodieId:'leaf_pot',itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision,x,y,condition:'new',uses:0,placedAt:1000});
const snap=(rows=[],enabled=true)=>({player:{id:'owner'},serverTime:1000,yard:{goodieInventory:{leaf_pot:Math.max(0,2-rows.length)}},yardRuntime:{version:1,status:'ready',mutable:true,actionProtocol:'yard-v2:',serverNow:1000,itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:enabled}),canonicalPlacements:rows}});
const legal=[];for(let x=0;x<=200;x+=2)for(let y=0;y<=220;y+=2)if(canonicalFootprintValid(x,y))legal.push({x,y});
const extremes=[legal.reduce((a,b)=>a.x<b.x?a:b),legal.reduce((a,b)=>a.x>b.x?a:b),legal.reduce((a,b)=>a.y<b.y?a:b),legal.reduce((a,b)=>a.y>b.y?a:b),{x:98,y:118}];

test('only the exact enabled location and T2 capability permits item actions',()=>{
 assert.ok(canonicalCapability(snap()));assert.equal(canonicalCapability(snap([],false)),null);
 for(const change of[ s=>delete s.yardRuntime.itemPlacementCapabilities,s=>s.yardRuntime.version=2,s=>s.yardRuntime.mutable=false,s=>s.yardRuntime.error='error',s=>s.yardRuntime.itemPlacementCapabilities.locationVersion=2,s=>s.yardRuntime.itemPlacementCapabilities.geometryRevision='future',s=>s.yardRuntime.itemPlacementCapabilities.maxPlacements=3,s=>s.yardRuntime.itemPlacementCapabilities.items.leaf_pot.assetSha256='different',s=>s.yardRuntime.itemPlacementCapabilities.items.leaf_pot.move=false,s=>s.yardRuntime.itemPlacementCapabilities.visitAdmission=true]){
  const s=snap();change(s);assert.equal(canonicalCapability(s),null);
 }
 assert.equal(canonicalCapability(snap(),'yard.setFood'),null);
 assert.deepEqual(canonicalPlacements(snap()),[]);assert.deepEqual(canonicalPlacements(snap([record()])),[record()]);
 for(const changed of[{locationVersion:2},{itemGeometryRevision:'future'},{goodieId:'sun_cushion'},{x:NaN},{uses:1}])assert.deepEqual(canonicalPlacements(snap([{...record(),...changed}])),[]);
 assert.equal(canonicalPlacements(snap([record(),{...record(72,145),slotId:'canonical:two'}])).length,2);
 assert.deepEqual(canonicalPlacements(snap([record(),{...record(72,145),slotId:'canonical:two'},{...record(120,90),slotId:'canonical:three'}])),[]);
});
test('preview validity uses owned inventory and shared authoritative geometry, never old 0–100 coordinates',()=>{
 const g={...record(),placing:true};assert.equal(checkCanonicalPlacement(snap(),g).ok,true);
 const empty=snap();empty.yard.goodieInventory={};assert.equal(checkCanonicalPlacement(empty,g).errors[0].code,'CANONICAL_GOODIE_NOT_OWNED');
 assert.equal(checkCanonicalPlacement(snap([record()]),{...g,slotId:'canonical:other',x:72,y:145}).ok,true);
 assert.equal(checkCanonicalPlacement(snap([record(),{...record(72,145),slotId:'canonical:two'}]),{...g,slotId:'canonical:other'}).errors[0].code,'CANONICAL_LOCATION_CAPACITY_REACHED');
 assert.equal(checkCanonicalPlacement(snap([record()]),{...g,placing:false,x:72,y:145}).ok,true);
 assert.equal(checkCanonicalPlacement(snap([record()]),{...g,placing:false,x:0,y:0}).ok,false);
});
test('ground inverse is exact across crop, resize and saved-item focus including legal extremes',()=>{
 for(const [width,height]of[[320,274],[360,450],[390,549],[414,600],[478,192],[754,230],[768,780],[934,568],[1190,500]])for(const focus of[null,...extremes]){
  const p=createCleanProjection(descriptor,width,height,{focus});
  for(const point of extremes){const back=p.unprojectGround(p.project(point));assert.ok(Math.abs(back.x-point.x)<1e-10);assert.ok(Math.abs(back.y-point.y)<1e-10);}
  if(focus){const center=p.project({...focus,z:5.5});assert.ok(center.y>=20&&center.y<=height-20,'legal saved item stays visible after narrow-height resize');}
  assert.equal(p.unprojectGround({x:NaN,y:0}),null);
 }
});
function environment({planner=null}={}){
 const win=new EventTarget(),doc=new EventTarget(),frames=new Map(),renders=[],placements=[],views=[],errors=[];let id=0,width=390,height=549,observer,interruptions=0,at=0,workerCreates=0,workerDisposals=0;
 doc.hidden=false;doc.hasFocus=()=>true;globalThis.window=win;globalThis.document=doc;globalThis.devicePixelRatio=2;
 globalThis.ResizeObserver=class{constructor(fn){observer=fn;}observe(){}disconnect(){}};
 const ctx={setTransform(a,b,c,d,e,f){this.t={a,b,c,d,e,f};},getTransform(){return this.t;},clearRect(){},fillRect(){},drawImage(){}};
 const rect=()=>({left:11,top:23,width,height}),canvas={width:0,height:0,style:{},getContext:()=>ctx,getBoundingClientRect:rect},host={style:{},appendChild(){},getBoundingClientRect:rect};
 const fetchImpl=async url=>{const bytes=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),json:async()=>JSON.parse(bytes),text:async()=>bytes.toString()};};
 const scene=createPipYardScene(canvas,{canonicalItems:true,onPointerInterrupt:()=>interruptions++,directHost:host,uiImageOwner:createUiImageReserve(),onView:v=>views.push(v),onFailure:e=>errors.push(e.message),now:()=>at,...(planner?{plannerWorkerFactory:()=>{workerCreates++;return{plan:planner,dispose(){workerDisposals++;}};}}:{}),requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:n=>frames.delete(n),fetchImpl,decodeImage:async()=>({width:973,height:1616,close(){}}),
  rendererFactory:async()=>({renderDirect:o=>{renders.push(structuredClone(o));return true;},setPlanterPlacement:p=>placements.push(p),setCanonicalPlacements:(rows,{ghost,selectedSlotId}={})=>{const row=ghost||rows.find(row=>row.slotId===selectedSlotId)||rows[0];if(row)placements.push([row.x,row.y,0]);},setPaused(){},resize(){},dispose(){},diagnostics:{}})});
 return{scene,renders,placements,views,errors,frames,win,doc,get interruptions(){return interruptions;},get workerCreates(){return workerCreates;},get workerDisposals(){return workerDisposals;},tick(ms=0){at+=ms;const calls=[...frames.values()];frames.clear();calls.forEach(fn=>fn(at));},resize(w,h){width=w;height=h;observer();}};
}
test('item scene preserves committed rows and ghost recovery when the planner is unavailable',async()=>{
 const e=environment();try{
  e.scene.update(snap());await e.scene.ready;e.tick();assert.equal(e.renders.at(-1).visibility,'empty');assert.equal(e.views.at(-1).mutable,false);assert.equal(e.views.at(-1).itemMutable,true);
  const root=structuredClone(e.renders.at(-1).sample.world.root);e.scene.setGhost({...record(),placing:true,valid:true});e.tick();assert.equal(e.renders.at(-1).visibility,'planter');assert.equal(e.scene.diagnostics().lastFrame.committed,false);
  e.scene.setGhost(null);e.tick();assert.equal(e.renders.at(-1).visibility,'empty');
  e.scene.update(snap([record()]));e.tick();assert.deepEqual(e.placements.at(-1),[98,118,0]);assert.equal(e.scene.diagnostics().lastFrame.committed,true);
  e.scene.setGhost({...record(72,145),placing:false,valid:true});e.tick();assert.deepEqual(e.placements.at(-1),[72,145,0]);e.scene.setGhost(null);e.tick();assert.deepEqual(e.placements.at(-1),[98,118,0]);
  e.scene.update(snap([record(72,145)]));e.tick();assert.deepEqual(e.placements.at(-1),[72,145,0]);e.resize(478,192);e.tick();
  const projected=e.renders.at(-1).point,ground=e.scene.point({clientX:projected.x+11,clientY:projected.y+23});assert.ok(Math.abs(ground.x-72)<1e-10);assert.ok(Math.abs(ground.y-145)<1e-10);
  e.scene.update(snap([record(72,145)],false));e.tick();assert.equal(e.views.at(-1).itemMutable,false);assert.equal(e.scene.hit({clientX:0,clientY:0}),null);
  e.scene.update(snap());e.tick();assert.equal(e.renders.at(-1).visibility,'empty');assert.ok(e.renders.every(r=>['planter','empty'].includes(r.visibility)));assert.ok(e.renders.every(r=>JSON.stringify(r.sample.world.root)===JSON.stringify(root)));assert.equal(e.frames.size,0);
  assert.throws(()=>e.scene.inspectAgain());assert.throws(()=>e.scene.moveTo(1));assert.equal(e.scene.diagnostics().savedVisitor,false);assert.deepEqual(e.errors,[]);
 }finally{await e.scene.dispose();}
});

test('drag uses a frozen camera; orientation interruption ends it before recentering',async()=>{
 const e=environment();try{
  e.scene.update(snap([record()]));await e.scene.ready;e.tick();const start=e.scene.diagnostics().projection.art;
  e.scene.beginPointer();e.scene.setGhost({...record(72,145),placing:false,valid:true});e.tick();assert.deepEqual(e.scene.diagnostics().projection.art,start);
  e.scene.setGhost({...record(110,90),placing:false,valid:true});e.tick();assert.deepEqual(e.scene.diagnostics().projection.art,start);
  e.resize(478,192);e.tick();assert.equal(e.interruptions,1);assert.deepEqual(e.placements.at(-1),[98,118,0]);assert.equal(e.scene.diagnostics().lastFrame.committed,true);
  e.scene.endPointer();assert.equal(e.frames.size,0);assert.deepEqual(e.errors,[]);
 }finally{await e.scene.dispose();}
});

test('actual T2 vertices stay inside fixed garden raster at legal extremes without moving hidden Pip',async()=>{
 const calibration=JSON.parse(await fs.readFile(new URL('data/calibration.json',base))),fragmentHelper=await fs.readFile(new URL('source/pip-rest-coat.glsl',base),'utf8'),pip=await fs.readFile(new URL('assets/pip.glb',base)),pot=await fs.readFile(new URL('assets/planter-t2.glb',base));
 assert.equal(createHash('sha256').update(pot).digest('hex'),CANONICAL_ITEM.assetSha256);
 const canvas=new EventTarget();canvas.style={};canvas.dataset={};canvas.remove=()=>{};const host={appendChild:c=>{c.parentNode=host;}};
 let renderCount=0,meshWorldVertices=[];
 const api=await createOptionalPipRenderer({enabled:true,actorUnitsPerSource:16,calibration,fragmentHelper,planter:{descriptor:setup.planter,placement:setup.placements[0]},presentationMode:'direct',directHost:host,canvasFactory:()=>canvas,viewport:createCleanProjection(descriptor,390,300).renderViewport,
  loadAssetBytes:async()=>pip.buffer.slice(pip.byteOffset,pip.byteOffset+pip.byteLength),loadPlanterAssetBytes:async()=>pot.buffer.slice(pot.byteOffset,pot.byteOffset+pot.byteLength),admitResources:admitPipResources,setupLighting:()=>()=>{},
  rendererFactory:({THREE})=>({shadowMap:{},setClearColor(){},setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},dispose(){},forceContextLoss(){},render(scene,camera){
   renderCount++;scene.updateMatrixWorld(true);assert.equal(scene.children[0].children[0].visible,false);assert.equal(scene.children[1].visible,true);meshWorldVertices=[];
   scene.children[1].traverseVisible(o=>{if(!o.isMesh)return;const v=new THREE.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);const world=v.clone(),projected=v.project(camera),x=(projected.x+1)*195,y=(1-projected.y)*324;assert.ok(x>=0&&x<=390&&y>=0&&y<=648);meshWorldVertices.push({world,x,y});}});
  }})});
 try{
  const sample=samplePlanterInspection(setup,makePlanterInspection(setup),0);let root;
  for(const target of extremes){const p=createCleanProjection(descriptor,390,300,{focus:target});api.resize({viewport:p.renderViewport});api.setPlanterPlacement([target.x,target.y,0]);api.resize({viewport:p.renderViewport});api.renderDirect({sample,point:p.project(target),visibility:'planter'});const d=api.diagnostics.lastFrame;
   root??=d.rootGLTF;assert.deepEqual(d.rootGLTF,root);assert.deepEqual(d.presentationRoot,[target.x/12,0,-target.y/12]);
   for(const v of meshWorldVertices){const expected=p.project({x:v.world.x*12,y:-v.world.z*12,z:v.world.y*12});assert.ok(Math.abs(expected.x-(v.x+d.rect.x))<.00003);assert.ok(Math.abs(expected.y-(v.y+d.rect.y))<.00003);}
  }
  assert.equal(renderCount,extremes.length);assert.equal(canvas.width,390);assert.equal(canvas.height,648);
 }finally{api.dispose();}
});

test('T2 thumbnail is lazy, source matched and charged before DOM exposure without changing legacy aliases',async()=>{
 const row=canonicalItemCatalog.goodies.leaf_pot.new,url=sceneCatalogPreview(canonicalItemCatalog,'goodie','leaf_pot');
 const bytes=await fs.readFile(new URL(url));assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.deepEqual(row.canvas,[128,128]);assert.notEqual(url,catalogPreview('goodie','leaf_pot'));
 assert.equal(sceneCatalogPreview({kind:'legacy-m2'},'goodie','leaf_pot'),catalogPreview('goodie','leaf_pot'));
 assert.equal(uiImageLifetimeLedger(canonicalItemCatalog).bytes-uiImageLifetimeLedger().bytes,65536);
 const owner=createUiImageReserve();assert.throws(()=>owner.admit([url]),/Unregistered/);owner.registerCatalog(canonicalItemCatalog);const before=owner.snapshot().bytes;
 assert.equal(owner.admit([url]),true);assert.equal(owner.snapshot().bytes-before,65536);assert.equal(owner.admit([url]),true);assert.equal(owner.snapshot().bytes-before,65536);owner.dispose();
});

test('unsupported saved state is unavailable, never a confirmed empty layout',()=>{
 const empty=canonicalItemState(snap());assert.equal(empty.available,true);assert.deepEqual(empty.records,[]);
 for(const change of[s=>delete s.yardRuntime.itemPlacementCapabilities,s=>delete s.yardRuntime.canonicalPlacements,s=>s.yardRuntime.version=2,s=>s.yardRuntime.error='UNSUPPORTED_YARD_STORAGE_VERSION',s=>s.yardRuntime.itemPlacementCapabilities.geometryRevision='unknown']){
  const s=snap([record()]);change(s);assert.deepEqual(canonicalItemState(s),{available:false,records:null,status:'unavailable'});
 }
 assert.deepEqual(canonicalItemState(snap([record()],false)),{available:true,records:[record()],status:'read-only'});
});

test('both committed canonical rows stay visible; either target can be selected, edited and restored',async()=>{
 const e=environment();try{
  const rows=[record(),{...record(72,145),slotId:'canonical:second'}];e.scene.update(snap(rows));await e.scene.ready;e.tick();assert.deepEqual(e.scene.diagnostics().lastFrame.records,rows);
  assert.equal(e.scene.selectCanonicalSlot('canonical:second'),true);e.tick();assert.equal(e.scene.diagnostics().selectedCanonicalSlotId,'canonical:second');assert.deepEqual(e.placements.at(-1),[72,145,0]);
  e.scene.setGhost({...rows[1],x:110,y:90,placing:false,valid:true});e.tick();assert.equal(e.scene.diagnostics().lastFrame.records.length,2);assert.equal(e.scene.diagnostics().lastFrame.ghost.slotId,'canonical:second');
  e.scene.setGhost(null);e.tick();assert.deepEqual(e.scene.diagnostics().lastFrame.records,rows);assert.deepEqual(e.placements.at(-1),[72,145,0]);assert.deepEqual(e.errors,[]);
 }finally{await e.scene.dispose();}
});

test('actual UI proposal shape gets its registered item revision locally before actor clearance',async()=>{
 const e=environment({planner:()=>Promise.resolve({ok:false,code:'TEST_NO_PATH'})});try{
  e.scene.update(snap());await e.scene.ready;e.tick();assert.equal(e.scene.diagnostics().plannerWorkerActive,true);assert.equal(e.scene.diagnostics().interaction.spawned,true);
  const proposal={...CANONICAL_LOCATION,slotId:'canonical:ui-proposal',goodieId:'leaf_pot',x:98,y:118,placing:true};
  assert.equal(Object.hasOwn(proposal,'itemGeometryRevision'),false);assert.equal(e.scene.checkPlacement(proposal).ok,true);
  assert.equal(e.scene.checkPlacement({...proposal,x:79,y:129.5}).errors[0].code,'CANONICAL_ACTOR_OCCUPIED');
  e.scene.update(snap([record()]));assert.equal(e.scene.checkPlacement({...proposal,slotId:record().slotId,placing:false,x:72,y:145}).ok,true);
 }finally{await e.scene.dispose();}
});

test('dynamic scene freezes actor through ghost and pending response, then updates only committed layout',async()=>{
 const {planCanonicalInspection}=await import('../src/games/companion-yard-v2/pip-prototype/dynamic-prop-planner.mjs');const admissions=[];
 const e=environment({planner:args=>{admissions.push(structuredClone(args));return Promise.resolve(planCanonicalInspection(args));}});
 try{
  e.scene.update(snap([record()]));await e.scene.ready;e.tick();assert.equal(e.scene.inspectCanonicalSlot(record().slotId),true);await Promise.resolve();e.tick(600);
  const held=structuredClone(e.scene.diagnostics().dynamicSample.world);assert.equal(e.scene.diagnostics().interaction.active,true);
  e.scene.setGhost({...record(72,145),placing:false,valid:true});e.tick(600);assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);assert.equal(e.renders.at(-1).visibility,'planter');assert.equal(admissions[0].rows[0].x,98);
  e.scene.setCanonicalActionPending(true);e.scene.setGhost(null);e.tick(1500);assert.deepEqual(e.scene.diagnostics().dynamicSample.world,held);assert.equal(e.scene.diagnostics().itemActionPending,true);assert.equal(e.renders.at(-1).visibility,'planter');
  e.scene.update(snap([record(72,145)]));e.tick();assert.equal(e.scene.diagnostics().interaction.phase,'recovering');assert.equal(e.scene.diagnostics().canonicalRecords[0].x,72);
  e.scene.setCanonicalActionPending(false);e.tick(200);assert.deepEqual(e.scene.diagnostics().dynamicSample.world.root,held.root);assert.equal(e.renders.at(-1).visibility,'both');
  const unknown=snap([record(72,145)]);delete unknown.yardRuntime.canonicalPlacements;e.scene.update(unknown);e.tick(1000);assert.equal(e.scene.diagnostics().lastFrame.canonicalState,'unavailable');assert.equal(e.renders.at(-1).visibility,'empty');
  const other=snap([record()]);other.player.id='other-owner';e.scene.update(other);e.tick();assert.equal(e.workerDisposals,1);assert.equal(e.workerCreates,2);assert.deepEqual(e.errors,[]);
 }finally{await e.scene.dispose();assert.equal(e.workerDisposals,2);}
});

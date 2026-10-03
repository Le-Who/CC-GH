import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMochiCombinedCandidate} from '../recovery-tools/yard-mochi-combined-qa/source/game-logic/yard-v2/media/mochi-combined-binding.mjs';
import {createMochiCandidatePresenter} from '../recovery-tools/yard-mochi-combined-qa/source/src/games/companion-yard-v2/mochi-candidate-presentation.mjs';
import {createProjection,BASIS} from '../recovery-tools/yard-mochi-combined-qa/source/src/games/companion-yard-v2/projection.mjs';
import {fitPreviewProjection,spriteVisibleBounds} from '../recovery-tools/yard-mochi-combined-qa/preview-framing.mjs';
import {createHash} from 'node:crypto';
const root=new URL('../recovery-tools/yard-mochi-combined-qa/',import.meta.url);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const [clip,strideContract,motionContract,combinedMedia,cardinalMedia]=await Promise.all([
 'contracts/clip.json','contracts/stride.json','contracts/ground.json','media/combined/candidate-media.json','media/cardinal/candidate-media.json'].map(read));
const scene={entry:{x:90,y:68},entryClearance:4,footprints:{yarn_mouse:{width:8.8,height:3.2}},exclusions:[]};
const binding=createMochiCombinedCandidate({clip,strideContract,motionContract,scene});
const props=[{slotId:'target',goodieId:'yarn_mouse',x:50,y:45,condition:'new',rotationZ:0,drawStandalone:true},
 {slotId:'other',goodieId:'yarn_mouse',x:76,y:42,condition:'new',rotationZ:0,drawStandalone:true,opaque:{keep:1}}];
const candidate={at:100000,leavesAt:2800000,placement:props[0],yard:{remodel:'meadow',expansion:{level:1},placedGoodies:props},active:[],reserved:[]};
const planned=binding.preflightCandidate(candidate);assert.equal(planned.ok,true,planned.code);const plan=planned.plan;
const options={binding,combinedMedia,cardinalMedia,strideContract,motionContract,combinedBaseURL:'https://qa.invalid/combined/',cardinalBaseURL:'https://qa.invalid/cardinal/'};
const make=()=>createMochiCandidatePresenter(options),ready={frame:()=>({image:'decoded'})};

test('inactive source presenter validates and freezes all source identities without registering an actor',()=>{
 const media=structuredClone(combinedMedia),p=createMochiCandidatePresenter({...options,combinedMedia:media});
 assert.equal(p.runtimeActivated,false);assert.equal(binding.binding.playbackReady,false);assert.equal(Object.keys(p.walk).length,4);assert.equal(Object.keys(p.turns).length,12);
 assert.equal(p.active.assetBaseURL,options.combinedBaseURL);assert.equal(p.walk[0].assetBaseURL,options.cardinalBaseURL);
 assert.equal(p.active.assetRevision,combinedMedia.manifestRevision);assert.ok(Object.isFrozen(p.active.pages));media.pages[0].src='tamper.webp';assert.notEqual(p.active.pages[0].src,media.pages[0].src);
});
test('manifest mismatch fails closed for identity, root timing, camera, seam and atlas coverage',()=>{
 const edits=[o=>o.combinedMedia.visitorId='mika',o=>o.combinedMedia.sourceRigSha256='wrong',o=>o.combinedMedia.frameCount--,
  o=>o.combinedMedia.runtimeActivated=true,o=>o.cardinalMedia.walk.facings[0].rootDistanceSamples[1]=0,
  o=>o.cardinalMedia.turns['0:1:2'].sourceSamplesSha256='wrong',o=>o.cardinalMedia.turns['0:1:4'].compositionSeamFrame=39,
  o=>o.combinedMedia.cameraDirection[0]=0,o=>o.combinedMedia.pivotPx[0]++,o=>o.combinedMedia.pages[0].count--,
  o=>o.combinedMedia.pages[0].src='../other.webp',o=>o.cardinalMedia.walk.facings[6].groundContacts.pop()];
 for(const edit of edits){const o={...options,combinedMedia:structuredClone(combinedMedia),cardinalMedia:structuredClone(cardinalMedia)};edit(o);assert.throws(()=>createMochiCandidatePresenter(o),TypeError);}
});
test('every native-rate route and composite frame is addressable, including real 45-minute rest cycles',()=>{
 const p=make();let count=0;const ids=new Set();
 for(let at=plan.schedule.enterAt;at<plan.schedule.leavesAt;at+=50){const s=p.select(plan,at);assert.ok(s.pose,s.issue);assert.ok(s.clip.pages.some(pg=>s.index>=pg.first&&s.index<pg.first+pg.count));ids.add(s.clip.id);count++;}
 assert.ok(count>50000);assert.ok(ids.has(clip.id));assert.ok(ids.has('hop-0'));assert.equal(p.select(plan,plan.schedule.enterAt-1).pose,null);assert.equal(p.select(plan,plan.schedule.leavesAt).pose,null);
});
test('entry, native rest loop and exit preserve authored roots, pixels and one exact target owner',()=>{
 const p=make(),start=plan.schedule.combinedStart,end=plan.schedule.combinedEnd,loop=plan.schedule.segments.find(s=>s.kind==='loop');
 const points=[start-50,start,start+4200,loop.startAt,loop.startAt+1150,loop.startAt+1200,end-50,end,end+50];
 for(const at of points){const before=JSON.stringify(props),v=p.compose(plan,at,props,ready),inside=at>=start&&at<end;
  assert.equal(v.requiresCoherentFrameHold,false);assert.equal(v.targetSlotHidden,inside?'target':null);assert.deepEqual(v.props[1],props[1]);assert.equal(JSON.stringify(props),before);
  assert.deepEqual(v.anchor,inside?v.pose.clipOrigin:v.pose.position);assert.equal(v.clip.id,inside?clip.id:'hop-0');
 }
 assert.equal(p.select(plan,loop.startAt).index,200);assert.equal(p.select(plan,loop.startAt+1150).index,223);assert.equal(p.select(plan,loop.startAt+1200).index,200);
 // Blender-saved root rows retain float32 precision relative to canonical roots.
 for(const [at,root]of [[start,plan.startRoot],[end,plan.endRoot]])for(const axis of ['x','y'])assert.ok(Math.abs(p.select(plan,at).pose.position[axis]-root[axis])<1e-6);
});
test('pending decode and changed or duplicated targets request whole-frame hold before hiding any prop',()=>{
 const p=make(),at=plan.schedule.combinedStart+4200,pending=p.compose(plan,at,props,{frame:()=>null});
 assert.equal(pending.requiresCoherentFrameHold,true);assert.equal(pending.targetSlotHidden,null);assert.deepEqual(pending.props,props);
 for(const changed of [[{...props[0],x:51},props[1]],[{...props[0],condition:'worn'},props[1]],[...props,props[0]]]){
  const v=p.compose(plan,at,changed,ready);assert.equal(v.requiresCoherentFrameHold,true);assert.equal(v.targetSlotHidden,null);assert.equal(v.issue,'TARGET_PROP_CHANGED');assert.equal(v.pose,null);
 }
 const routePending=p.compose(plan,plan.schedule.combinedEnd,props,{frame:()=>null});assert.equal(routePending.requiresCoherentFrameHold,true);assert.deepEqual(routePending.props,props);
});
test('requests are scene-owned, unmutated and never replace another actor cache working set',()=>{
 const p=make(),at=plan.schedule.combinedStart-50,r=p.requests(plan,at);assert.equal(r.required[0].clip.id,'hop-0');assert.equal(r.lookahead[0].clip.id,clip.id);
 const calls=[];p.compose(plan,at,props,{prepare:()=>assert.fail('must aggregate in scene owner'),frame:(c,i)=>{calls.push([c.id,i]);return {};}});assert.equal(calls.length,1);
 const invalid={...plan,visitorId:'mika'};assert.equal(p.select(invalid,at).issue,'CANDIDATE_PLAN_MISMATCH');assert.deepEqual(p.requests(invalid,at).required,[]);
 assert.equal(p.compose(invalid,at,props,ready).requiresCoherentFrameHold,true);assert.throws(()=>p.requests(plan,at,-1),TypeError);
});
test('measured preview fitting retains every actor and prop pixel across all source rows and viewport floors',async()=>{
 const framing=await read('preview-framing.json'),p=make();
 for(const [file,sha]of Object.entries(framing.mediaSha256))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),sha);
 assert.equal(framing.sampleCount,425);
 const propPivot=[p.active.pivotPx[0]+50*BASIS.right.reduce((s,n,i)=>s+n*clip.propRoot[i],0),p.active.pivotPx[1]+50*BASIS.down.reduce((s,n,i)=>s+n*clip.propRoot[i],0)];
 for(const [width,height]of [[320,80],[320,299],[360,530],[390,594],[414,646],[568,170],[844,240],[768,837],[1024,581],[1280,533],[393,623]]){
  const projection=fitPreviewProjection(createProjection(width,height),framing);
  const check=b=>{assert.ok(b.left>=8-1e-8);assert.ok(b.top>=8-1e-8);assert.ok(b.right<=width-8+1e-8);assert.ok(b.bottom<=height-8+1e-8);};
  for(let sourceMs=-1000;sourceMs<=20200;sourceMs+=50){
   const at=sourceMs<clip.restLoop.endMs?plan.schedule.combinedStart+sourceMs:plan.schedule.combinedEnd-(clip.durationMs-sourceMs),s=p.select(plan,at);
   check(spriteVisibleBounds(framing.clipBoundsPx[s.clip.id][s.index],s.clip.pivotPx,s.clip.pixelsPerWorld,s.anchor,projection));
  }
  for(const prop of props){check(spriteVisibleBounds(framing.targetPropBoundsPx,propPivot,50,prop,projection));const restored=projection.unproject(projection.project(prop));assert.ok(Math.abs(restored.x-prop.x)<1e-9);assert.ok(Math.abs(restored.y-prop.y)<1e-9);}
 }
});

import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {getMikaServerOptions,MIKA_SCENE} from '../game-logic/yard-v2/mika-media.mjs';
import {createMotionGroundGuard} from '../game-logic/yard-v2/motion-ground-guard.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {courtyardPresentation} from '../src/games/companion-yard-v2/presentation.mjs';
import clips from '../game-logic/yard-v2/media/clip-contracts.json' with {type:'json'};
import {digest} from '../game-logic/yard-v2/util.mjs';
const NOW=Date.UTC(2026,9,2,12),H=3600000;
function admitted(options={}) {
  const p=createDefaultPlayer('bounded-cushion-0','Fixture',NOW);
  p.yard.placedGoodies=[{goodieId:'sun_cushion',slotId:'cushion',x:54,y:66,uses:0,condition:'new',placedAt:NOW}];
  p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:99,placedAt:NOW,expiresAt:NOW+24*H};
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...options}).status,200);
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW+4*H,simulate:true,...options}).status,200);
  assert.equal(Object.values(p._yardV2.runtime.visits).length,1);
  return p;
}
const record=p=>Object.values(p._yardV2.runtime.visits)[0];
const projected=(p,now,options={})=>({yard:structuredClone(p.yard),yardRuntime:publicPersistentYard(p,{now,...options})});
const reload=p=>JSON.parse(JSON.stringify(p));

test('a current admitted plan remains render-compatible after actual player serialization and pure projection',()=>{
  const p=admitted(),r=record(p),plan=r.mediaAdmission.plan,time=plan.schedule.segments.find(s=>s.kind==='loop').startAt+350;
  const before=digest(p),a=projected(p,time),b=projected(reload(p),time);
  assert.equal(a.yardRuntime.visits[0].renderCompatible,true);
  assert.equal(a.yardRuntime.visits[0].presentationStatus,'calibrated-plan-available');
  assert.deepEqual(a.yardRuntime.visits[0].presentationIssues,[]);
  assert.deepEqual(courtyardPresentation(a,time,clips),courtyardPresentation(b,time,clips));
  assert.equal(courtyardPresentation(a,time,clips).pets.length,1);assert.equal(digest(p),before);
});

test('ground, calibration and binding mismatches each preserve the active visit but disable animation',()=>{
  const baseline=admitted();
  const cases=[
    ['GROUND_FOOTPRINT_REVISION_MISMATCH',r=>delete r.mediaAdmission.plan.groundFootprintRevision],
    ['GROUND_FOOTPRINT_REVISION_MISMATCH',r=>r.mediaAdmission.plan.groundFootprintRevision='future'],
    ['MEDIA_CALIBRATION_MISMATCH',r=>r.mediaAdmission.bindingCalibrationHash='previous-calibration'],
    ['MEDIA_CALIBRATION_MISMATCH',r=>r.mediaAdmission.bindingCalibrationHash=null],
    ['MEDIA_BINDING_REVISION_MISMATCH',r=>r.mediaAdmission.bindingRevision='previous-binding'],
    ['MEDIA_BINDING_REVISION_MISMATCH',r=>r.mediaAdmission.bindingId='missing-binding'],
  ];
  for(const [issue,mutate] of cases){
    const p=reload(baseline),r=record(p);mutate(r);const before=digest(p),time=r.arrivedAt+1000;
    const snapshot=projected(p,time),out=snapshot.yardRuntime.visits[0];
    assert.equal(out.renderCompatible,false,issue);assert.equal(out.presentationStatus,'preserved-presentation-unavailable');
    assert.ok(out.presentationIssues.includes(issue),issue);assert.deepEqual(out.mediaAdmission,r.mediaAdmission);
    assert.equal(out.arrivedAt,r.arrivedAt);assert.equal(out.releaseAt,r.releaseAt);assert.equal(out.leavesAt,r.leavesAt);
    assert.equal(snapshot.yardRuntime.reservations.length,1);
    const view=courtyardPresentation(snapshot,time,clips);assert.equal(view.pets.length,0);assert.equal(view.legacy.length,1);
    assert.equal(view.props[0].reserved,true);assert.equal(view.props[0].drawStandalone,true);
    assert.equal(view.props[0].transform.x,p.yard.placedGoodies[0].x);assert.equal(digest(p),before);
  }
});

test('current binding readiness must still pass even if a stored record claims its exact registry hash',()=>{
  const p=admitted(),r=record(p),registry=structuredClone(getMikaServerOptions().mediaRegistry);
  registry.bindings.find(b=>b.id===r.mediaAdmission.bindingId).playbackReady=false;
  r.mediaAdmission.registryHash=digest(registry);
  const result=projected(p,r.arrivedAt+1000,{mediaRegistry:registry});
  assert.equal(result.yardRuntime.visits[0].renderCompatible,false);
  assert.ok(result.yardRuntime.visits[0].presentationIssues.includes('INTERACTION_MEDIA_NOT_READY'));
});

test('a serialized known-unsafe pre-guard route is never sampled; original endpoint/gift commits still run exactly once',()=>{
  let p=admitted(),r=record(p);delete r.mediaAdmission.plan.groundFootprintRevision;
  // Representative pre-guard saved route: this leg was admitted by the old coarse
  // root-only gate, and is specifically rejected by the new measured-sole guard.
  const from={x:80.12,y:47.12},to={x:85.24,y:47.12};
  assert.equal(createMotionGroundGuard(p.yard,{scene:MIKA_SCENE}).walkSegment(from,to,0),false);
  const segment=r.mediaAdmission.plan.schedule.segments.find(s=>s.role==='depart');
  segment.route={ok:true,durationMs:1200,distance:5.12,points:[from,to],legs:[{
    kind:'walk',from,to,facing:0,distance:5.12,durationMs:1200,startMs:0,endMs:1200,phaseStart:0,phaseEnd:0,
    rampInDistance:0,rampOutDistance:0,rampInMs:0,rampOutMs:0,cruiseDistance:5.12,cruiseMs:1200,
  }]};
  p=reload(p);r=record(p);const planBefore=digest(r.mediaAdmission.plan),backupBefore=digest(p._yardV2.migration);
  const time=segment.startAt+1190,snapshot=projected(p,time),view=courtyardPresentation(snapshot,time,clips);
  assert.equal(view.pets.length,0);assert.equal(view.legacy[0].presentationStatus,'preserved-presentation-unavailable');
  assert.equal(digest(record(p).mediaAdmission.plan),planBefore);assert.equal(p.yard.pendingGifts.length,0);
  assert.equal(ensurePersistentPlayerYard(p,{now:r.releaseAt,simulate:true}).status,200);
  assert.equal(Object.keys(p._yardV2.runtime.propCommitReceipts).length,1);assert.equal(p.yard.pendingGifts.length,0);
  assert.equal(ensurePersistentPlayerYard(p,{now:r.leavesAt,simulate:true}).status,200);
  assert.equal(p.yard.pendingGifts.length,1);assert.equal(digest(record(p).mediaAdmission.plan),planBefore);
  const completed=digest(p);assert.equal(ensurePersistentPlayerYard(p,{now:r.leavesAt,simulate:true}).status,200);assert.equal(digest(p),completed);
  const options={now:r.leavesAt,actionId:'yard-v2:stale-plan-gift'};
  const first=executePersistentYardAction(p,'yard.collectGifts',{},options);assert.equal(first.status,200);
  assert.equal(p.yard.pendingGifts.length,0);assert.equal(Object.values(p._yardV2.runtime.giftLedger).filter(g=>g.status==='claimed').length,1);
  p=reload(p);const claimed=digest(p),second=executePersistentYardAction(p,'yard.collectGifts',{},options);
  assert.equal(second.replayed,true);assert.equal(digest(p),claimed);assert.equal(digest(p._yardV2.migration),backupBefore);
  assert.equal(digest(record(p).mediaAdmission.plan),planBefore);
});

test('the browser never guesses compatibility for a plan lacking the server projection flag',()=>{
  const p=admitted(),r=record(p),time=r.arrivedAt+1000,snapshot=projected(p,time);
  delete snapshot.yardRuntime.visits[0].renderCompatible;
  const view=courtyardPresentation(snapshot,time,clips);assert.equal(view.pets.length,0);assert.equal(view.legacy.length,1);
});

test('new admission pins calibration and survives unrelated registry content and revision changes after reload',()=>{
  const p=admitted(),r=record(p),original=getMikaServerOptions().mediaRegistry;
  assert.equal(r.mediaAdmission.bindingCalibrationHash,original.calibrationHash);
  const registry=structuredClone(original);registry.revision+=':append-unrelated';
  registry.bindings.push({id:'future-dog-binding',revision:'future-dog/v1',visitorId:'future_dog',goodieId:'future_prop'});
  assert.notEqual(digest(registry),r.mediaAdmission.registryHash);
  const restored=reload(p),before=digest(restored),time=r.arrivedAt+1000;
  const base=projected(restored,time),after=projected(restored,time,{mediaRegistry:registry});
  assert.equal(after.yardRuntime.visits[0].renderCompatible,true);
  assert.deepEqual(after.yardRuntime.visits[0].mediaAdmission,r.mediaAdmission);
  assert.deepEqual(courtyardPresentation(after,time,clips).pets,courtyardPresentation(base,time,clips).pets);
  assert.equal(digest(restored),before);
});

test('a binding-specific calibration takes precedence over global metadata but rejects changes to its own calibration',()=>{
  const registry=structuredClone(getMikaServerOptions().mediaRegistry);
  const binding=registry.bindings.find(b=>b.goodieId==='sun_cushion');binding.calibrationHash=digest({scene:'cushion-own-calibration-v1'});
  const p=admitted({mediaRegistry:registry}),r=record(p),time=r.arrivedAt+1000,before=digest(p);
  assert.equal(r.mediaAdmission.bindingCalibrationHash,binding.calibrationHash);
  registry.revision+=':unrelated';registry.calibrationHash=digest({unrelated:'new-global-input'});
  registry.bindings.push({id:'future-dog-binding',revision:'future-dog/v1'});
  assert.equal(projected(p,time,{mediaRegistry:registry}).yardRuntime.visits[0].renderCompatible,true);
  binding.calibrationHash=digest({scene:'cushion-own-calibration-v2'});
  const rejected=projected(p,time,{mediaRegistry:registry}).yardRuntime.visits[0];
  assert.equal(rejected.renderCompatible,false);assert.ok(rejected.presentationIssues.includes('MEDIA_CALIBRATION_MISMATCH'));
  assert.equal(digest(p),before);
});

test('a new record using registry calibration rejects a changed shared calibration without changing saved state',()=>{
  const registry=structuredClone(getMikaServerOptions().mediaRegistry);
  for(const b of registry.bindings)delete b.calibrationHash;
  const p=admitted({mediaRegistry:registry}),r=record(p),before=digest(p);
  registry.calibrationHash=digest({scene:'changed-ground-or-camera'});
  const result=projected(p,r.arrivedAt+1000,{mediaRegistry:registry}).yardRuntime.visits[0];
  assert.equal(result.renderCompatible,false);assert.ok(result.presentationIssues.includes('MEDIA_CALIBRATION_MISMATCH'));assert.equal(digest(p),before);
});

test('legacy records keep strict whole-registry fallback and stale-ground refusal without metadata backfill',()=>{
  const p=admitted(),r=record(p);delete r.mediaAdmission.bindingCalibrationHash;
  const original=getMikaServerOptions().mediaRegistry,before=digest(p),time=r.arrivedAt+1000;
  assert.equal(projected(p,time).yardRuntime.visits[0].renderCompatible,true);
  const appended=structuredClone(original);appended.bindings.push({id:'unrelated-binding',revision:'v1'});
  const noLongerExact=projected(p,time,{mediaRegistry:appended}).yardRuntime.visits[0];
  assert.equal(noLongerExact.renderCompatible,false);assert.ok(noLongerExact.presentationIssues.includes('MEDIA_CALIBRATION_MISMATCH'));
  assert.equal(Object.hasOwn(r.mediaAdmission,'bindingCalibrationHash'),false);assert.equal(digest(p),before);
  delete r.mediaAdmission.plan.groundFootprintRevision;
  const stale=projected(reload(p),time).yardRuntime.visits[0];
  assert.equal(stale.renderCompatible,false);assert.ok(stale.presentationIssues.includes('GROUND_FOOTPRINT_REVISION_MISMATCH'));
  assert.equal(stale.mediaAdmission.registryHash,digest(original));
});

test('an explicitly malformed new calibration field cannot downgrade to the legacy hash fallback',()=>{
  const baseline=admitted();
  for(const value of [null,'',false,{},0]){
    const p=reload(baseline),r=record(p);r.mediaAdmission.bindingCalibrationHash=value;const before=digest(p);
    const result=projected(p,r.arrivedAt+1000).yardRuntime.visits[0];
    assert.equal(result.renderCompatible,false);assert.ok(result.presentationIssues.includes('MEDIA_CALIBRATION_MISMATCH'));assert.equal(digest(p),before);
  }
});

test('unannotated legacy configurations keep whole-registry receipts without inventing calibration metadata',()=>{
  const registry=structuredClone(getMikaServerOptions().mediaRegistry);delete registry.calibrationHash;
  for(const binding of registry.bindings)delete binding.calibrationHash;
  const p=admitted({mediaRegistry:registry}),r=record(p);
  assert.equal(Object.hasOwn(r.mediaAdmission,'bindingCalibrationHash'),false);
  assert.equal(r.mediaAdmission.registryHash,digest(registry));
  assert.equal(projected(p,r.arrivedAt+1000,{mediaRegistry:registry}).yardRuntime.visits[0].renderCompatible,true);
});

test('explicit invalid binding calibration fails before admission preflight instead of silently falling back',()=>{
  for(const invalid of [null,'',false,{},0]){
    const registry=structuredClone(getMikaServerOptions().mediaRegistry),binding=registry.bindings.find(b=>b.goodieId==='sun_cushion');
    binding.calibrationHash=invalid;let called=false;
    const policy=createAdmissionPolicy({mediaRegistry:registry,preflight:()=>{called=true;return{ok:true,plan:null};}});
    const result=policy({visitor:{id:binding.visitorId},goodie:{id:binding.goodieId},activity:{id:binding.activityIds[0]},placement:{condition:'new'},reserved:[]});
    assert.equal(result.ok,false);assert.equal(result.code,'MEDIA_CALIBRATION_HASH_REQUIRED');assert.equal(called,false);
  }
});

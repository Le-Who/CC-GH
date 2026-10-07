import {PresentationClock} from '../presentation-clock.mjs';
import {sampleR1SavedStay,r1SavedStayGeometry,R1_SAVED_STAY_PROFILE} from './canonical-saved-stay.mjs';
import {canonicalVisitPlacementRowsValid,CANONICAL_VISIT_PRESENTATION_PROTOCOL} from '../../../../game-logic/yard-v2/canonical-visit-placement-contract.mjs';
import {selectCanonicalFoodState} from '../../../../game-logic/yard-v2/canonical-food-contract.mjs';
import {PIP_PRIVATE_GLB_SHA256} from './source/pip-analytical-coat.mjs';
const geometry=r1SavedStayGeometry();
const unavailable=code=>({available:false,status:'unavailable',code,rows:[],plan:null});
/** This validates a normal server projection, not its network authentication.
 * The caller owns authenticated snapshot delivery; no browser plan admission,
 * local storage, fixture route, economy, or mutation capability is created. */
export function selectCanonicalSavedVisit(snapshot){
 const r=snapshot?.yardRuntime;
 if(r?.storageVersion!==3||r.canonicalVisitProtocol!==CANONICAL_VISIT_PRESENTATION_PROTOCOL||r.version!==1)return unavailable('CANONICAL_SAVED_PROTOCOL_UNAVAILABLE');
 if(r.status==='reconciliation-pending')return {...unavailable('CANONICAL_SAVED_RECONCILIATION_PENDING'),status:r.status};
 if(r.status!=='ready'||r.error||!Number.isSafeInteger(r.serverNow)||r.serverNow<0)return unavailable('CANONICAL_SAVED_SNAPSHOT_UNAVAILABLE');
 if(!canonicalVisitPlacementRowsValid(r.canonicalPlacements,snapshot?.yard?.placedGoodies||[])||!selectCanonicalFoodState(snapshot).available)return unavailable('CANONICAL_SAVED_LAYOUT_UNAVAILABLE');
 if(!Array.isArray(r.canonicalVisits)||r.canonicalVisits.length>1||!Array.isArray(r.visits)||r.visits.length!==0||r.canonicalVisits.length===1&&(!r.canonicalVisits[0]||typeof r.canonicalVisits[0]!=='object'||Array.isArray(r.canonicalVisits[0])))return unavailable('CANONICAL_SAVED_RENDERER_CAPACITY');
 const record=r.canonicalVisits[0],plan=record?.plan;
 if(record){
  if(typeof record.visitId!=='string'||record.visitId!==plan?.visitId||plan.format!=='yard-canonical-stay/v3'||plan.profile!==R1_SAVED_STAY_PROFILE
   ||plan.source?.modelSha256!==PIP_PRIVATE_GLB_SHA256||plan.source?.unitsPerSource!==16||plan.source?.movementRevision!=='r1-supported-baseline-v1'
   ||![plan.arrivedAt,plan.retreatAt,plan.releaseAt,plan.departureAt,plan.leavesAt].every(Number.isSafeInteger)
   ||!(plan.arrivedAt<plan.retreatAt&&plan.retreatAt<plan.releaseAt&&plan.releaseAt<plan.departureAt&&plan.departureAt<plan.leavesAt))return unavailable('CANONICAL_SAVED_PLAN_UNAVAILABLE');
  try{const result=sampleR1SavedStay(plan,r.serverNow,{rows:r.canonicalPlacements,geometry});if(result.code)return unavailable(result.code);}catch{return unavailable('CANONICAL_SAVED_PLAN_UNAVAILABLE');}
 }
 return {available:true,status:'ready',code:null,rows:structuredClone(r.canonicalPlacements),plan:plan?structuredClone(plan):null,serverNow:r.serverNow};
}
/** One future wake for quiet/rest phases. Rendering pauses never pause this
 * authoritative clock; hosts preserve it across renderer/context replacement. */
export function createCanonicalSavedVisitClient({clock=new PresentationClock(),onWake=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let selected=unavailable('CANONICAL_SAVED_SNAPSHOT_UNAVAILABLE'),timer=null,epoch=0,disposed=false,drawingEnabled=false;
 function cancel(){epoch++;if(timer!==null){clearTimer(timer);timer=null;}}
 function sample(){
  if(disposed||!selected.available)return {phase:'unavailable',code:selected.code,sample:null,nextChangeAt:null,needsAnimationFrame:false,serverNow:clock.read()};
  const at=clock.read();
  if(!selected.plan)return {phase:'empty',sample:null,nextChangeAt:null,needsAnimationFrame:false,serverNow:at};
  try{return sampleR1SavedStay(selected.plan,at,{rows:selected.rows,geometry});}catch{return {phase:'unavailable',code:'CANONICAL_SAVED_SAMPLE_UNAVAILABLE',sample:null,nextChangeAt:null,needsAnimationFrame:false,serverNow:at};}
 }
 return {
  update(snapshot){cancel();selected=selectCanonicalSavedVisit(snapshot);if(selected.available)clock.update(selected.serverNow);return this.state;},
  sample,
  afterDraw(result){cancel();if(disposed||!drawingEnabled||!selected.available||result.needsAnimationFrame||!Number.isFinite(result.nextChangeAt))return;
   const token=epoch,delay=Math.max(1,Math.ceil(result.nextChangeAt-clock.read()));timer=setTimer(()=>{if(disposed||token!==epoch)return;timer=null;onWake();},Math.min(delay,2147483647));
  },
  setDrawingEnabled(value){drawingEnabled=Boolean(value);if(!drawingEnabled)cancel();},
  cancelWake:cancel,
  dispose(){if(disposed)return;disposed=true;cancel();selected=unavailable('CANONICAL_SAVED_DISPOSED');},
  get state(){return {available:selected.available,status:selected.status,code:selected.code,rows:selected.rows,plan:selected.plan,serverNow:clock.read(),wakePending:timer!==null,drawingEnabled,disposed};}
 };
}

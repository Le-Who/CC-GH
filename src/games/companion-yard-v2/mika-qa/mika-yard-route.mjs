import {createMikaLocomotionRoute,sampleMikaLocomotion} from './mika-locomotion.mjs';
import {boundMikaPose} from './mika-envelope.mjs';
import {prepareMikaArrival} from './mika-arrival.mjs';
import {prepareMikaDepartureSteps} from './mika-departure.mjs';
import {prepareMikaTurnAway} from './mika-turn-away.mjs';
const EPS=1e-8,U=8,DURATION=4;
const internals=new WeakMap(),templates=new WeakMap();
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points){
 const p=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lo=[],hi=[];
 for(const v of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=0)lo.pop();lo.push(v);}
 for(const v of p.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=0)hi.pop();hi.push(v);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function clipY(poly,y,above){
 const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],insideA=above?a.y>=y-EPS:a.y<=y+EPS,insideB=above?b.y>=y-EPS:b.y<=y+EPS;
  if(insideA)out.push(a);if(insideA!==insideB){const u=(y-a.y)/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*u,y});}}
 return out;
}
/** Conservative released mask strips intersect both adjacent source rows. */
export function polygonWithinMask(poly,rows){
 if(!Array.isArray(rows)||rows.length!==51||poly.length<3||poly.some(p=>![p.x,p.y].every(Number.isFinite)||p.x<0||p.x>100||p.y<0||p.y>100))return false;
 for(let i=0;i<50;i++){
  const clipped=clipY(clipY(poly,i*2,true),i*2+2,false);if(!clipped.length)continue;
  const min=Math.min(...clipped.map(p=>p.x)),max=Math.max(...clipped.map(p=>p.x));
  if(!rows[i].some(a=>rows[i+1].some(b=>min>=Math.max(a[0],b[0])-EPS&&max<=Math.min(a[1],b[1])+EPS)))return false;
 }
 return true;
}
export function polygonHitsBox(poly,box){
 const rect=[{x:box.x,y:box.y},{x:box.x+box.width,y:box.y},{x:box.x+box.width,y:box.y+box.height},{x:box.x,y:box.y+box.height}],axes=[{x:1,y:0},{x:0,y:1},...poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return{x:a.y-b.y,y:b.x-a.x};})];
 return axes.every(a=>{const p=poly.map(p=>p.x*a.x+p.y*a.y),q=rect.map(p=>p.x*a.x+p.y*a.y);return Math.max(...p)>=Math.min(...q)-EPS&&Math.max(...q)>=Math.min(...p)-EPS;});
}
const contains=(poly,p)=>poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>=-1e-6);
const transform=(p,angle,scale=1,origin={x:0,y:0})=>({x:origin.x+scale*(Math.cos(angle)*p.x-Math.sin(angle)*p.y),y:origin.y+scale*(Math.sin(angle)*p.x+Math.cos(angle)*p.y)});
function relativeRoot(turn){
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);},heading=t=>turn*smooth((t-.55)/2.85),points=[{x:0,y:0}];
 for(let i=1;i<=8000;i++){const a=heading(-2+(i-1)*.001),b=heading(-2+i*.001),p=points.at(-1);points.push({x:p.x+.74*.0005*(Math.cos(a)+Math.cos(b)),y:p.y+.74*.0005*(Math.sin(a)+Math.sin(b))});}
 const zero=points[2000];return t=>{if(t<-2-EPS||t>6+EPS)throw Error('QA_ROUTE_HISTORY_EXHAUSTED');const x=(t+2)*1000,i=Math.max(0,Math.min(7999,Math.floor(x))),u=Math.max(0,Math.min(1,x-i)),a=points[i],b=points[i+1];return{position:[a.x+(b.x-a.x)*u-zero.x,a.y+(b.y-a.y)*u-zero.y,0],heading:heading(t)};};
}
function worldCorners(sample,envelope,units=1){
 const b=boundMikaPose(sample,envelope,{includeCorners:true}),origin={x:sample.root.position[0]*units,y:sample.root.position[1]*units};
 return b.points.map(p=>transform({x:p[0],y:p[1]},sample.root.heading,units,origin));
}
function prepareTemplates(calibration,envelope,withArrival=false,selectedTurn=null){
 const key=(withArrival?'arrival:':'cruise:')+selectedTurn+':'+canonical(envelope);let cached=templates.get(calibration);if(!cached){cached=new Map();templates.set(calibration,cached);}if(cached.has(key))return cached.get(key);
 const rows=[];
 for(const turn of [-Math.PI/12,Math.PI/12]){
  if(selectedTurn!==null&&turn!==selectedTurn)continue;
  const rootAt=relativeRoot(turn),route=createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase:turn>0,activeEnd:withArrival?4.5:DURATION});
  const arrival=withArrival?prepareMikaArrival(calibration,t=>sampleMikaLocomotion(route,calibration,t)):null;
  const duration=arrival?.durationSeconds??DURATION,sampleAt=t=>arrival&&t>DURATION?arrival.sample(t):sampleMikaLocomotion(route,calibration,t);
  let points=[],minZ=0,maxZ=0;
  for(let i=0;i<=Math.ceil(duration*40);i++){
   const sample=sampleAt(Math.min(duration,i/40)),box=boundMikaPose(sample,envelope);minZ=Math.min(minZ,box.min[2]);maxZ=Math.max(maxZ,box.max[2]);
   points.push(...worldCorners(sample,envelope));if(i%10===0)points=hull(points);
  }
  // Fixed reserve surrounds sampled extrema. Every actual frame is separately
  // bounded against this admitted hull before drawing; an escape aborts QA.
  const padded=hull(hull(points).flatMap(p=>[-.08,.08].flatMap(x=>[-.08,.08].map(y=>({x:p.x+x,y:p.y+y})))));
  const end=sampleAt(duration);
  rows.push({turn,rootAt,sampleAt,duration,endRoot:end.root,endBody:hull(worldCorners(end,envelope)),sweep:padded,vertical:{min:minZ-.08,max:maxZ+.08}});
 }
 cached.set(key,rows);return rows;
}
function validLayout(layout){
 return layout?.remodel==='meadow'&&Array.isArray(layout.maskRows)&&layout.maskRows.length===51&&Array.isArray(layout.obstacles)&&layout.obstacles.length<=32&&layout.obstacles.every(b=>typeof b.id==='string'&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0);
}
/** A finite QA cruise selector, not a general path planner or replan system. */
export function planMikaYardQaCruise(layout,calibration,envelope,options={}){
 return planMikaYardQaPassage(layout,calibration,envelope,{...options,withArrival:false});
}
/** Candidate arrival extension. It cannot be selected through the accepted
 * four-second replay API; all added body motion is included in admission. */
export function planMikaYardQaArrival(layout,calibration,envelope,options={}){
 return planMikaYardQaPassage(layout,calibration,envelope,{...options,withArrival:true});
}
function placeSample(sample,heading,start){
 const world=p=>{const q=transform({x:p[0],y:p[1]},heading,1,{x:start.x/U,y:start.y/U});return[q.x,q.y,p[2]];};
 return {...sample,root:{position:world(sample.root.position),heading:sample.root.heading+heading},
  contacts:Object.fromEntries(Object.entries(sample.contacts).map(([id,foot])=>[id,{...foot,yaw:foot.yaw+heading,
   ...Object.fromEntries(['paw','hip','knee','ankle'].filter(key=>Array.isArray(foot[key])).map(key=>[key,world(foot[key])]))}]))};
}
function planMikaYardQaPassage(layout,calibration,envelope,{acceptSweep=()=>true,acceptCandidate=()=>true,candidateStarts=null,withArrival=false,selectedCandidate=null}={}){
 if(!validLayout(layout))return {ok:false,reason:'UNSUPPORTED_QA_LAYOUT'};
 if(candidateStarts!==null&&(!Array.isArray(candidateStarts)||candidateStarts.length>70||candidateStarts.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=100))))return{ok:false,reason:'INVALID_QA_CANDIDATE_STARTS'};
 if(selectedCandidate!==null&&(!selectedCandidate||![-Math.PI/12,Math.PI/12].includes(selectedCandidate.turnRadians)||![0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4].includes(selectedCandidate.heading)||![selectedCandidate.start?.x,selectedCandidate.start?.y].every(Number.isFinite)))return{ok:false,reason:'INVALID_MIKA_SELECTED_CANDIDATE'};
 const frozen=structuredClone(layout),layoutKey=canonical(frozen),rows=prepareTemplates(calibration,envelope,withArrival,selectedCandidate?.turnRadians??null),starts=[];
 if(candidateStarts!==null)starts.push(...candidateStarts.map(p=>({x:p.x,y:p.y})));
 else for(let y=42;y<=78;y+=6)for(let x=26;x<=80;x+=6)starts.push({x,y});
 starts.sort((a,b)=>Math.hypot(a.x-50,a.y-60)-Math.hypot(b.x-50,b.y-60));let candidates=0;
 for(const start of starts)for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4])for(const template of rows){
  candidates+=selectedCandidate?2:1;if(selectedCandidate&&(start.x!==selectedCandidate.start.x||start.y!==selectedCandidate.start.y||heading!==selectedCandidate.heading||template.turn!==selectedCandidate.turnRadians))continue;
  const sweep=template.sweep.map(p=>transform(p,heading,U,start));
  if(!polygonWithinMask(sweep,frozen.maskRows)||frozen.obstacles.some(b=>polygonHitsBox(sweep,b)))continue;
  // Optional finite-action selection only narrows the existing clear set. It
  // cannot change the root, pose, duration, collision sweep or per-frame guard.
  const end=template.endRoot,position=transform({x:end.position[0],y:end.position[1]},heading,U,start);
  if(acceptCandidate({start:{...start},end:{...position},heading:end.heading+heading,endBody:template.endBody.map(p=>transform(p,heading,U,start))})!==true||acceptSweep(sweep,template.vertical)!==true)continue;
  const rootAt=t=>{const r=template.rootAt(t),p=transform({x:r.position[0],y:r.position[1]},heading,1,{x:start.x/U,y:start.y/U});return{position:[p.x,p.y,0],heading:r.heading+heading};};
  const route=withArrival?null:createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase:template.turn>0});
  const plan=Object.freeze({ok:true,format:withArrival?'mika-normal-yard-qa-arrival/v1':'mika-normal-yard-qa-cruise/v1',unitsPerSource:U,duration:template.duration,start:Object.freeze(start),heading,turnRadians:template.turn,sweep:Object.freeze(sweep.map(Object.freeze)),candidates:selectedCandidate&&template.turn<0?candidates-1:candidates,scope:withArrival?'finite item approach, contact-aware arrival and idle; full-sweep and per-frame guard; no saved visit/interaction':'finite visual-only cruise; sampled pose-envelope with per-frame fail-closed guard; no saved identity/replan/action entry'});
  internals.set(plan,{layoutKey,calibration:structuredClone(calibration),envelope:structuredClone(envelope),route,sampleAt:withArrival?t=>placeSample(template.sampleAt(t),heading,start):null,aborted:false});return plan;
 }
 return {ok:false,reason:'NO_CLEAR_QA_CRUISE',candidates};
}
// A shorter passage retains the same linear speed; only the bounded turn
// interval ends earlier so the existing arrival receives a straight lead-in.
function continuationRoot(turn,duration){
 if(duration===4)return relativeRoot(turn);
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
 const begins=duration===2?.25:.4,ends=duration-.6,heading=t=>turn*smooth((t-begins)/(ends-begins));
 const points=[{x:0,y:0}];
 for(let i=1;i<=6000;i++){const a=heading((i-1)*.001),b=heading(i*.001),p=points.at(-1);points.push({x:p.x+.74*.0005*(Math.cos(a)+Math.cos(b)),y:p.y+.74*.0005*(Math.sin(a)+Math.sin(b))});}
 return t=>{if(t<0)return{position:[.74*t,0,0],heading:0};if(t>6)throw Error('QA_ROUTE_HISTORY_EXHAUSTED');const i=Math.min(5999,Math.floor(t*1000)),u=Math.max(0,Math.min(1,t*1000-i)),a=points[i],b=points[i+1];return{position:[a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,0],heading:heading(t)};};
}
function rebaseContactTime(sample,offset,time){
 return{...sample,time,contacts:Object.fromEntries(Object.entries(sample.contacts).map(([id,foot])=>[id,{...foot,
  ...Object.fromEntries(['swingStart','swingEnd','nextSwingStart'].map(key=>[key,Number.isFinite(foot[key])?foot[key]+offset:foot[key]]))}]))};
}
/** Finite forward continuation from an actual settled pose. No start or heading
 * search is permitted: refusal preserves the caller's current actor unchanged.
 * A separately qualified stepped quarter-turn may redirect departure; there
 * is no general navigation or arbitrary-time emergency stop.
 */
export function planMikaYardQaContinuation(layout,calibration,envelope,stoppedSample,options={}){
 const job=iterateMikaContinuation(layout,calibration,envelope,stoppedSample,options);let step;
 do{step=job.next();}while(!step.done);return step.value;
}
const planningTask=signal=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(signal.reason);return;}
 const aborted=()=>{clearTimeout(timer);signal.removeEventListener('abort',aborted);reject(signal.reason);};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve();},0);
 signal?.addEventListener('abort',aborted,{once:true});
});
/** Same candidate iterator as the synchronous geometry oracle. Yield actual
 * tasks so normal Yard rendering and cancellation can run between small batches.
 */
export async function planMikaYardQaContinuationAsync(layout,calibration,envelope,stoppedSample,{signal,yieldTask=planningTask,onSlice=()=>{},onBatch=()=>{},...options}={}){
 const job=iterateMikaContinuation(layout,calibration,envelope,stoppedSample,options);
 try{for(;;){
  const batchStart=performance.now();let steps=0;
  for(;;){signal?.throwIfAborted();const start=performance.now(),step=job.next();steps++;onSlice(performance.now()-start,step.value?.stage??'result');
   if(step.done){onBatch(performance.now()-batchStart,steps);return step.value;}
   // A single immutable preparation step can exceed this scheduling budget.
   // Preserve that measured tail rather than claiming a hard wall-clock cap.
   if(performance.now()-batchStart>=8){onBatch(performance.now()-batchStart,steps);break;}
  }
  await yieldTask(signal);
 }}finally{job.return();}
}
function* iterateMikaContinuation(layout,calibration,envelope,stoppedSample,{acceptSweep=()=>true,acceptCandidate=()=>true,acceptEndpoint=()=>true,selectedCandidate=null}={}){
 calibration=structuredClone(calibration);envelope=structuredClone(envelope);
 if(!validLayout(layout))return{ok:false,reason:'UNSUPPORTED_QA_LAYOUT'};
 if(selectedCandidate!==null&&(!selectedCandidate||![0,-Math.PI/2,Math.PI/2].includes(selectedCandidate.turnAwayRadians)||![2,3,4].includes(selectedCandidate.cruiseSeconds)||![-Math.PI/12,Math.PI/12].includes(selectedCandidate.turnRadians)))return{ok:false,reason:'INVALID_MIKA_SELECTED_CANDIDATE'};
 const initial=structuredClone(stoppedSample),position=initial?.root?.position,initialHeading=initial?.root?.heading;
 if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(initialHeading))return{ok:false,reason:'UNQUALIFIED_MIKA_STOPPED_POSE'};
 const frozen=structuredClone(layout),start={x:position[0]*U,y:position[1]*U},departureSeconds=2;
 let candidates=0;const rootProfiles=new Map();
 for(const turnAway of [0,-Math.PI/2,Math.PI/2])for(const cruiseSeconds of [2,3,4])for(const turn of [-Math.PI/12,Math.PI/12]){
  if(selectedCandidate&&(turnAway!==selectedCandidate.turnAwayRadians||cruiseSeconds!==selectedCandidate.cruiseSeconds||turn!==selectedCandidate.turnRadians)){candidates++;continue;}
  yield {stage:'candidate-start'}; // Refused candidates yield as well.
  let pivot;try{pivot=turnAway?prepareMikaTurnAway(calibration,initial,turnAway):null;}catch(error){return{ok:false,reason:String(error.message)};}
  const pivotSeconds=pivot?.durationSeconds??0,duration=pivotSeconds+departureSeconds+cruiseSeconds+2,launchPose=pivot?pivot.sample(pivotSeconds):initial,heading=launchPose.root.heading;
  candidates++;const profileKey=turn+':'+cruiseSeconds;
  if(!rootProfiles.has(profileKey))rootProfiles.set(profileKey,continuationRoot(turn,cruiseSeconds));
  const relative=rootProfiles.get(profileKey),rootAt=continuationWorldRoot(calibration,position,heading,relative);
  const endCruise=rootAt(cruiseSeconds),arrivalTravel=calibration.gait.referenceSpeed*.9/2;
  const estimatedEnd={x:U*(endCruise.position[0]+arrivalTravel*Math.cos(endCruise.heading)),y:U*(endCruise.position[1]+arrivalTravel*Math.sin(endCruise.heading))};
  // Necessary heading/progress predicates only. Full final-body and swept
  // geometry still decide admission after contact preparation.
  if(acceptEndpoint({start:{...start},end:estimatedEnd,heading:endCruise.heading})!==true)continue;
  let sampleAt;
  yield {stage:'root-profile'};
  try{
   const cruise=createMikaLocomotionRoute(rootAt,calibration,{historyStart:-4,historyEnd:6,activeStart:-2,activeEnd:cruiseSeconds+.5,mirrorPhase:turn>0});
   yield {stage:'route-table'};
   const sampleCruise=t=>sampleMikaLocomotion(cruise,calibration,t),departure=yield* prepareMikaDepartureSteps(calibration,launchPose,sampleCruise);
   yield {stage:'departure-contacts'};
   const arrival=prepareMikaArrival(calibration,t=>rebaseContactTime(sampleCruise(t+cruiseSeconds-4),4-cruiseSeconds,t));
   yield {stage:'arrival-contacts'};
   sampleAt=t=>pivot&&t<=pivotSeconds?pivot.sample(t):t<=pivotSeconds+departureSeconds?departure.sample(t-pivotSeconds):t<=pivotSeconds+departureSeconds+cruiseSeconds?sampleCruise(t-pivotSeconds-departureSeconds):arrival.sample(Math.max(4,Math.min(6,t-pivotSeconds-departureSeconds-cruiseSeconds+4)));
  }catch(error){return{ok:false,reason:String(error.message)};}
  const terminal=sampleAt(duration),end={x:terminal.root.position[0]*U,y:terminal.root.position[1]*U};
  // Reject the wrong destination before the expensive full skin sweep. This
  // only narrows candidates; collision/camera admission is still mandatory.
  if(acceptCandidate({start:{...start},end,cruiseSeconds,pivotSeconds,heading:terminal.root.heading,endBody:hull(worldCorners(terminal,envelope,U))})!==true)continue;
  let points=[],minZ=0,maxZ=0;
  for(let i=0;i<=duration*40;i++){
   const sample=sampleAt(i/40),box=boundMikaPose(sample,envelope);minZ=Math.min(minZ,box.min[2]);maxZ=Math.max(maxZ,box.max[2]);
   points.push(...worldCorners(sample,envelope,U));if(i%10===0)points=hull(points);
   if(i%4===3)yield {stage:'skin-envelope'}; // Four exact poses per task.
  }
  const sweep=hull(hull(points).flatMap(p=>[-.08*U,.08*U].flatMap(x=>[-.08*U,.08*U].map(y=>({x:p.x+x,y:p.y+y}))))),vertical={min:minZ-.08,max:maxZ+.08};
  if(!polygonWithinMask(sweep,frozen.maskRows)||frozen.obstacles.some(box=>polygonHitsBox(sweep,box)))continue;
  if(acceptSweep(sweep,vertical)!==true)continue;
  const plan=Object.freeze({ok:true,format:'mika-normal-yard-current-pose/v1',unitsPerSource:U,duration,departureSeconds,pivotSeconds,cruiseSeconds,start:Object.freeze(start),heading:initialHeading,cruiseHeading:heading,turnAwayRadians:turnAway,turnRadians:turn,sweep:Object.freeze(sweep.map(Object.freeze)),candidates,scope:'finite current-pose stepped turn-away/departure/cruise/arrival; no general navigation, saved visit or interaction'});
  internals.set(plan,{layoutKey:canonical(frozen),calibration:structuredClone(calibration),envelope:structuredClone(envelope),sampleAt,aborted:false});return plan;
 }
 return{ok:false,reason:'NO_CLEAR_MIKA_CONTINUATION',candidates};
}
function continuationWorldRoot(calibration,position,heading,relative){
 const offset=calibration.gait.referenceSpeed*(2-.9/2);
 // Earlier straight history belongs to the unchanged constant-speed scheduler.
 return t=>{const r=t<0?{position:[calibration.gait.referenceSpeed*t,0,0],heading:0}:relative(t);
  const p=transform({x:offset+r.position[0],y:r.position[1]},heading,1,{x:position[0],y:position[1]});return{position:[p.x,p.y,0],heading:heading+r.heading};};
}
/** Reconstruct only the final arrival from an already server-validated finite
 * descriptor. This low-level sampler does not admit client origins or routes.
 * Departure/pivot history cannot affect the fresh cruise's final contacts, so
 * the descriptor stays constant-size across any number of accepted actions. */
export function sampleMikaYardQaSettledDescriptor(calibration,descriptor){
 const {selection}=descriptor;
 if(selection.kind==='arrival'){
  const route=createMikaLocomotionRoute(relativeRoot(selection.turnRadians),calibration,{mirrorPhase:selection.turnRadians>0,activeEnd:4.5});
  const arrival=prepareMikaArrival(calibration,t=>sampleMikaLocomotion(route,calibration,t));
  return placeSample(arrival.sample(6),selection.heading,selection.start);
 }
 const {position,heading:initialHeading}=descriptor.origin;
 const heading=selection.turnAwayRadians?initialHeading+selection.turnAwayRadians:initialHeading;
 const rootAt=continuationWorldRoot(calibration,position,heading,continuationRoot(selection.turnRadians,selection.cruiseSeconds));
 const route=createMikaLocomotionRoute(rootAt,calibration,{historyStart:-4,historyEnd:6,activeStart:-2,activeEnd:selection.cruiseSeconds+.5,mirrorPhase:selection.turnRadians>0});
 const arrival=prepareMikaArrival(calibration,t=>rebaseContactTime(sampleMikaLocomotion(route,calibration,t+selection.cruiseSeconds-4),4-selection.cruiseSeconds,t));
 return arrival.sample(6);
}
export function sampleMikaYardQaCruise(plan,layout,time){
 const state=internals.get(plan);if(!state)return {status:'aborted',reason:'UNPREPARED_QA_CRUISE'};
 if(state.aborted||canonical(layout)!==state.layoutKey){state.aborted=true;return{status:'aborted',reason:'LAYOUT_CHANGED'};}
 if(!Number.isFinite(time)||time<0||time>plan.duration)return{status:'complete'};
 const sample=state.sampleAt?state.sampleAt(time):sampleMikaLocomotion(state.route,state.calibration,time);
 if(worldCorners(sample,state.envelope,U).some(p=>!contains(plan.sweep,p))){state.aborted=true;return{status:'aborted',reason:'POSE_ENVELOPE_ESCAPE'};}
 return{status:'ready',sample,position:{x:sample.root.position[0]*U,y:sample.root.position[1]*U},envelope:boundMikaPose(sample,state.envelope)};
}

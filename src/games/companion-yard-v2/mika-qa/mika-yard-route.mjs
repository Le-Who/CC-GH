import {createMikaLocomotionRoute,sampleMikaLocomotion} from './mika-locomotion.mjs';
import {boundMikaPose} from './mika-envelope.mjs';
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
function prepareTemplates(calibration,envelope){
 const key=canonical(envelope);let cached=templates.get(calibration);if(cached?.key===key)return cached.rows;
 const rows=[];
 for(const turn of [-Math.PI/12,Math.PI/12]){
  const rootAt=relativeRoot(turn),route=createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase:turn>0});let points=[],minZ=0,maxZ=0;
  for(let i=0;i<=160;i++){
   const sample=sampleMikaLocomotion(route,calibration,i/40),box=boundMikaPose(sample,envelope);minZ=Math.min(minZ,box.min[2]);maxZ=Math.max(maxZ,box.max[2]);
   points.push(...worldCorners(sample,envelope));if(i%10===0)points=hull(points);
  }
  // Fixed reserve surrounds sampled extrema. Every actual frame is separately
  // bounded against this admitted hull before drawing; an escape aborts QA.
  const padded=hull(hull(points).flatMap(p=>[-.08,.08].flatMap(x=>[-.08,.08].map(y=>({x:p.x+x,y:p.y+y})))));
  rows.push({turn,rootAt,endBody:hull(worldCorners(sampleMikaLocomotion(route,calibration,DURATION),envelope)),sweep:padded,vertical:{min:minZ-.08,max:maxZ+.08}});
 }
 templates.set(calibration,{key,rows});return rows;
}
function validLayout(layout){
 return layout?.remodel==='meadow'&&Array.isArray(layout.maskRows)&&layout.maskRows.length===51&&Array.isArray(layout.obstacles)&&layout.obstacles.length<=32&&layout.obstacles.every(b=>typeof b.id==='string'&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0);
}
/** A finite QA cruise selector, not a general path planner or replan system. */
export function planMikaYardQaCruise(layout,calibration,envelope,{acceptSweep=()=>true,acceptCandidate=()=>true,candidateStarts=null}={}){
 if(!validLayout(layout))return {ok:false,reason:'UNSUPPORTED_QA_LAYOUT'};
 if(candidateStarts!==null&&(!Array.isArray(candidateStarts)||candidateStarts.length>70||candidateStarts.some(p=>!p||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=100))))return{ok:false,reason:'INVALID_QA_CANDIDATE_STARTS'};
 const frozen=structuredClone(layout),layoutKey=canonical(frozen),rows=prepareTemplates(calibration,envelope),starts=[];
 if(candidateStarts!==null)starts.push(...candidateStarts.map(p=>({x:p.x,y:p.y})));
 else for(let y=42;y<=78;y+=6)for(let x=26;x<=80;x+=6)starts.push({x,y});
 starts.sort((a,b)=>Math.hypot(a.x-50,a.y-60)-Math.hypot(b.x-50,b.y-60));let candidates=0;
 for(const start of starts)for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4])for(const template of rows){
  candidates++;const sweep=template.sweep.map(p=>transform(p,heading,U,start));
  if(!polygonWithinMask(sweep,frozen.maskRows)||frozen.obstacles.some(b=>polygonHitsBox(sweep,b)))continue;
  // Optional finite-action selection only narrows the existing clear set. It
  // cannot change the root, pose, duration, collision sweep or per-frame guard.
  const end=template.rootAt(DURATION),position=transform({x:end.position[0],y:end.position[1]},heading,U,start);
  if(acceptCandidate({start:{...start},end:{...position},heading:end.heading+heading,endBody:template.endBody.map(p=>transform(p,heading,U,start))})!==true||acceptSweep(sweep,template.vertical)!==true)continue;
  const rootAt=t=>{const r=template.rootAt(t),p=transform({x:r.position[0],y:r.position[1]},heading,1,{x:start.x/U,y:start.y/U});return{position:[p.x,p.y,0],heading:r.heading+heading};};
  const route=createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase:template.turn>0});
  const plan=Object.freeze({ok:true,format:'mika-normal-yard-qa-cruise/v1',unitsPerSource:U,duration:DURATION,start:Object.freeze(start),heading,turnRadians:template.turn,sweep:Object.freeze(sweep.map(Object.freeze)),candidates,scope:'finite visual-only cruise; sampled pose-envelope with per-frame fail-closed guard; no saved identity/replan/action entry'});
  internals.set(plan,{layoutKey,calibration:structuredClone(calibration),envelope:structuredClone(envelope),route,aborted:false});return plan;
 }
 return {ok:false,reason:'NO_CLEAR_QA_CRUISE',candidates};
}
export function sampleMikaYardQaCruise(plan,layout,time){
 const state=internals.get(plan);if(!state)return {status:'aborted',reason:'UNPREPARED_QA_CRUISE'};
 if(state.aborted||canonical(layout)!==state.layoutKey){state.aborted=true;return{status:'aborted',reason:'LAYOUT_CHANGED'};}
 if(!Number.isFinite(time)||time<0||time>plan.duration)return{status:'complete'};
 const sample=sampleMikaLocomotion(state.route,state.calibration,time);
 if(worldCorners(sample,state.envelope,U).some(p=>!contains(plan.sweep,p))){state.aborted=true;return{status:'aborted',reason:'POSE_ENVELOPE_ESCAPE'};}
 return{status:'ready',sample,position:{x:sample.root.position[0]*U,y:sample.root.position[1]*U},envelope:boundMikaPose(sample,state.envelope)};
}

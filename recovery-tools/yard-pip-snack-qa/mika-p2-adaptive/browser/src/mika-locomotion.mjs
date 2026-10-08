/** P2-only flat-ground pose adapter. No renderer, navigation writes, or game state.
 * Matrices are row-major source-axis transforms. boneMatrices are absolute
 * armature-space transforms beneath ONE navigation translation/heading frame.
 * This is a fixed-route deterministic query; it does not certify replanning.
 */
const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
const smooth5 = x => {x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const scale = (a,s) => a.map(v=>v*s);
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const norm = a => Math.hypot(...a);
const unit = a => {const n=norm(a);if(n<1e-12)throw Error('DEGENERATE_POSE_AXIS');return scale(a,1/n);};
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const identity = () => [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const multiply = (a,b) => a.map(row=>b[0].map((_,j)=>row.reduce((v,x,k)=>v+x*b[k][j],0)));
const point = (m,p) => m.slice(0,3).map(row=>row[0]*p[0]+row[1]*p[1]+row[2]*p[2]+row[3]);
const rz = a => {const c=Math.cos(a),s=Math.sin(a);return [[c,-s,0,0],[s,c,0,0],[0,0,1,0],[0,0,0,1]];};
const rot = (y=0,p=0,r=0) => {
  const cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
  return multiply(multiply(rz(y),[[cp,0,sp,0],[0,1,0,0],[-sp,0,cp,0],[0,0,0,1]]),[[1,0,0,0],[0,cr,-sr,0],[0,sr,cr,0],[0,0,0,1]]);
};
const at = (r,p) => r.map((row,i)=>i<3?[...row.slice(0,3),p[i]]:[0,0,0,1]);
function inverse(m) {
  const a=m.map((row,i)=>[...row,...identity()[i]]);
  for(let i=0;i<4;i++) {
    let pivot=i;for(let j=i+1;j<4;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;
    [a[i],a[pivot]]=[a[pivot],a[i]];const divisor=a[i][i];
    if(Math.abs(divisor)<1e-12)throw Error('SINGULAR_BIND_MATRIX');
    a[i]=a[i].map(v=>v/divisor);
    for(let j=0;j<4;j++)if(i!==j){const factor=a[j][i];a[j]=a[j].map((v,k)=>v-factor*a[i][k]);}
  }
  return a.map(row=>row.slice(4));
}
function between(a,b) {
  a=unit(a);b=unit(b);const c=dot(a,b);
  if(c>1-1e-10)return identity();
  if(c<-1+1e-8)throw Error('ANTIPARALLEL_LIMB_AXIS');
  const [x,y,z,w]=unit([...cross(a,b),1+c]);
  return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]];
}
function interpolate(xs,ys,x) {
  if(x<xs[0]-1e-9||x>xs.at(-1)+1e-9)throw Error('ROUTE_HISTORY_EXHAUSTED');
  let lo=0,hi=xs.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(xs[mid]<=x)lo=mid;else hi=mid;}
  const u=clamp((x-xs[lo])/(xs[hi]-xs[lo]));return ys[lo]+(ys[hi]-ys[lo])*u;
}
const referenceCache = new WeakMap();
const preparedCalibrations = new WeakMap();
function freezeTree(value) {
  if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}
  return value;
}
function validateCalibration(c) {
  const fail=()=>{throw Error('INVALID_MIKA_CALIBRATION');};
  const positive=x=>Number.isFinite(x)&&x>0,finite=x=>Number.isFinite(x),vector=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
  if(c?.format!=='mika-p2-locomotion/v1'||!c.gait||!c.bones||Object.keys(c.bones).length!==22||!c.limbs||!c.hipBindings||!c.neutralPaws)fail();
  const g=c.gait;
  for(const key of ['referenceSpeed','straightPeriod','referencePeakYawRate','loadRampSeconds','leadAheadSeconds','leadBehindSeconds'])if(!positive(g[key]))fail();
  if(!finite(g.turnPeriodReduction)||g.turnPeriodReduction<0||g.turnPeriodReduction>=g.straightPeriod||!finite(g.lower)||!finite(g.rollPerLead))fail();
  for(const family of ['fore','hind']) {
    if(!positive(g.swingSeconds?.[family])||g.swingSeconds[family]>=g.straightPeriod-g.turnPeriodReduction||!positive(g.swingHeight?.[family])||!positive(g.airbornePitch?.[family])||!positive(g.swingPeakFraction?.[family])||g.swingPeakFraction[family]>=1)fail();
  }
  const expected=['foreNear','hindFar','foreFar','hindNear'];
  if(!Array.isArray(c.phaseOrder)||c.phaseOrder.length!==4||expected.some((f,i)=>c.phaseOrder[i]!==f))fail();
  for(const b of Object.values(c.bones))if(!vector(b.head)||!vector(b.tail)||!Array.isArray(b.matrix)||b.matrix.length!==4||!b.matrix.every(row=>Array.isArray(row)&&row.length===4&&row.every(finite)))fail();
  for(const f of expected) {
    const l=c.limbs[f];if(!l||!['fore','hind'].includes(l.family)||!positive(l.upperLength)||!positive(l.lowerLength)||!vector(l.hip)||!vector(l.ankleOffset)||!finite(l.bend)||!vector(c.neutralPaws[f])||!c.bones[c.hipBindings[f]?.anchor])fail();
    for(const suffix of ['upper','lower','paw'])if(!c.bones[f+'_'+suffix])fail();
  }
  for(const n of ['root','body','pelvis','lumbar','chest','neck','head','tail_0','tail_1','tail_2'])if(!c.bones[n])fail();
}
function referenceRoute(calibration,mirror) {
  let cache=referenceCache.get(calibration);if(!cache){cache={};referenceCache.set(calibration,cache);}
  if(cache[mirror])return cache[mirror];
  const times=Array.from({length:8001},(_,i)=>-2+i*.001),heading=t=>-Math.PI*.5*smooth5((t-.55)/2.85);
  const yaws=times.map(heading),xs=[0],ys=[0],v=calibration.gait.referenceSpeed;
  for(let i=1;i<times.length;i++) {
    xs.push(xs[i-1]+(Math.cos(yaws[i-1])+Math.cos(yaws[i]))*v*.0005);
    ys.push(ys[i-1]+(Math.sin(yaws[i-1])+Math.sin(yaws[i]))*v*.0005);
  }
  const x0=interpolate(times,xs,0),y0=interpolate(times,ys,0),sign=mirror?-1:1;
  const rootAt=t=>({position:[interpolate(times,xs,t)-x0,sign*(interpolate(times,ys,t)-y0),0],heading:sign*heading(t)});
  return cache[mirror]=createMikaLocomotionRoute(rootAt,calibration,{mirrorPhase:mirror});
}

/** Fixed-route timeline with explicit bounded cadence calibration.
 * Heading must be continuously unwrapped. Input is source units/seconds.
 * The first calibration admits only P2's original cruising speed. Arrival,
 * acceleration and other speed envelopes need their own contact scheduler.
 */
export function createMikaLocomotionRoute(rootAt,calibration,{historyStart=-2,historyEnd=6,activeStart=0,activeEnd=4,phaseOriginTime=0,phaseOffset=0,mirrorPhase=false,stepSeconds=.001}={}) {
  validateCalibration(calibration);
  const calibrationSignature=JSON.stringify(calibration);
  calibration=freezeTree(structuredClone(calibration));
  if(typeof rootAt!=='function'||![historyStart,historyEnd,activeStart,activeEnd,phaseOriginTime,phaseOffset,stepSeconds].every(Number.isFinite)||stepSeconds<=0||stepSeconds>.001||historyEnd<=historyStart||activeStart<historyStart||activeEnd>historyEnd||activeEnd<activeStart||phaseOriginTime<historyStart||phaseOriginTime>historyEnd||typeof mirrorPhase!=='boolean')throw Error('INVALID_ROUTE_TIMELINE');
  const count=Math.round((historyEnd-historyStart)/stepSeconds);
  if(count>100000||count<2)throw Error('ROUTE_SAMPLE_BUDGET');
  const times=Array.from({length:count+1},(_,i)=>historyStart+i*(historyEnd-historyStart)/count),roots=times.map(t=>{
    const r=rootAt(t);return {position:Array.isArray(r?.position)?[...r.position]:null,heading:r?.heading};
  });
  for(const r of roots)if(r.position?.length!==3||!r.position.every(Number.isFinite)||!Number.isFinite(r.heading)||Math.abs(r.position[2])>1e-9)throw Error('INVALID_FLAT_ROOT_SAMPLE');
  for(let i=1;i<roots.length;i++) {
    const speed=norm(sub(roots[i].position,roots[i-1].position))/(times[i]-times[i-1]);
    if(Math.abs(speed-calibration.gait.referenceSpeed)>1e-5)throw Error('UNQUALIFIED_ROOT_SPEED');
  }
  const g=calibration.gait,derivatives=roots.map((r,i)=>{
    const a=Math.max(0,i-1),b=Math.min(count,i+1);return (roots[b].heading-roots[a].heading)/(times[b]-times[a]);
  }),frequencies=derivatives.map(derivative=>{
    const rate=Math.abs(derivative);
    if(rate>g.referencePeakYawRate+1e-6)throw Error('UNQUALIFIED_ROOT_YAW_RATE');
    return 1/(g.straightPeriod-g.turnPeriodReduction*clamp(rate/g.referencePeakYawRate));
  });
  // A Hermite derivative is quadratic. Check its endpoints and interior
  // extremum, not merely the finite-difference rates at table nodes.
  for(let i=0;i<count;i++) {
    const dt=times[i+1]-times[i],y0=roots[i].heading,y1=roots[i+1].heading,d0=derivatives[i],d1=derivatives[i+1];
    const a=2*y0-2*y1+dt*(d0+d1),b=-3*y0+3*y1-dt*(2*d0+d1),c=dt*d0;
    const extrema=[0,1],u=Math.abs(a)>1e-15?-b/(3*a):-1;if(u>0&&u<1)extrema.push(u);
    if(extrema.some(u=>Math.abs((3*a*u*u+2*b*u+c)/dt)>g.referencePeakYawRate+1e-6))throw Error('UNQUALIFIED_ROOT_YAW_RATE');
  }
  const phases=[0];for(let i=1;i<=count;i++)phases.push(phases[i-1]+(frequencies[i-1]+frequencies[i])*(times[i]-times[i-1])*.5);
  const origin=interpolate(times,phases,phaseOriginTime);for(let i=0;i<=count;i++)phases[i]+=phaseOffset-origin;
  const coordinates=[0,1,2].map(j=>roots.map(r=>r.position[j]));
  function snapshotRoot(t) {
    if(!Number.isFinite(t)||t<historyStart-1e-9||t>historyEnd+1e-9)throw Error('ROUTE_HISTORY_EXHAUSTED');
    const index=clamp(Math.floor((t-historyStart)/(historyEnd-historyStart)*count),0,count-1),dt=times[index+1]-times[index],u=clamp((t-times[index])/dt),u2=u*u,u3=u2*u;
    const heading=(2*u3-3*u2+1)*roots[index].heading+(u3-2*u2+u)*dt*derivatives[index]+(-2*u3+3*u2)*roots[index+1].heading+(u3-u2)*dt*derivatives[index+1];
    return {position:coordinates.map(axis=>interpolate(times,axis,t)),heading};
  }
  const route=Object.freeze({format:'mika-fixed-route/v1',rootAt:snapshotRoot,phaseAt:t=>interpolate(times,phases,t),timeAtPhase:p=>interpolate(phases,times,p),activeStart,activeEnd,historyStart,historyEnd,mirrorPhase,interpolation:'linear position/phase; cubic-Hermite heading with fixed central derivatives'});
  preparedCalibrations.set(route,{calibration,signature:calibrationSignature});
  return route;
}

export function sampleMikaLocomotion(route,calibration,time) {
  validateCalibration(calibration);
  if(route.kind==='accepted-p2-reference')route=referenceRoute(calibration,Boolean(route.mirror));
  if(route.format!=='mika-fixed-route/v1'||!Number.isFinite(time)||time<route.activeStart||time>route.activeEnd)throw Error('INVALID_MIKA_SAMPLE_TIME');
  const bound=preparedCalibrations.get(route);
  if(!bound)throw Error('UNPREPARED_MIKA_ROUTE');
  if(JSON.stringify(calibration)!==bound.signature)throw Error('MIKA_ROUTE_CALIBRATION_MISMATCH');
  calibration=bound.calibration;
  const g=calibration.gait,B=calibration.bones,root=route.rootAt(time),yaw=root.heading,ph=route.phaseAt(time),feet={};
  const swapped={foreNear:'foreFar',foreFar:'foreNear',hindNear:'hindFar',hindFar:'hindNear'};
  const target=(f,t)=>{const r=route.rootAt(t);return add(r.position,point(rz(r.heading),calibration.neutralPaws[f]));};
  for(const f of calibration.phaseOrder) {
    const family=calibration.limbs[f].family,off=calibration.phaseOrder.indexOf(route.mirrorPhase?swapped[f]:f)/4,k=Math.floor(ph-off);
    const a=route.timeAtPhase(k+off),b=a+g.swingSeconds[family],next=route.timeAtPhase(k+1+off),prev=route.timeAtPhase(k-1+off);
    const pm=(prev+g.swingSeconds[family]+a)/2,nm=(b+next)/2,pa=target(f,pm),pb=target(f,nm),ya=route.rootAt(pm).heading,yb=route.rootAt(nm).heading;
    const u=(time-a)/g.swingSeconds[family];let paw,pawYaw,curl,contact,load;
    if(u<1) {
      const s=smooth5(u),peak=g.swingPeakFraction[family],q=u<=peak?u/peak:(1-u)/(1-peak);
      paw=add(scale(pa,1-s),scale(pb,s));paw[2]+=g.swingHeight[family]*Math.sin(Math.PI*.5*q)**2;
      pawYaw=ya+(yb-ya)*s;curl=g.airbornePitch[family]*smooth5(u/.30)*(1-smooth5((u-.30)/.70));contact=false;load=0;
    }else {paw=pb;pawYaw=yb;curl=0;contact=true;load=smooth5((time-b)/g.loadRampSeconds)*(1-smooth5((time-(next-g.loadRampSeconds))/g.loadRampSeconds));}
    feet[f]={paw,yaw:pawYaw,curl,contact,load,stage:contact?'support':'swing',surface:'ground',terrainZ:0,stanceId:`${f}:${k}`,swingStart:a,swingEnd:b,nextSwingStart:next};
  }
  const lead=route.rootAt(time+g.leadAheadSeconds).heading-route.rootAt(time-g.leadBehindSeconds).heading;
  const roll=lead*g.rollPerLead,lower=g.lower,bones=Object.fromEntries(Object.entries(B).map(([n,b])=>[n,multiply(rz(yaw),b.matrix)])),trans={};
  const put=(n,p,r)=>{bones[n]=at(multiply(r,B[n].matrix),p);trans[n]=multiply(bones[n],inverse(B[n].matrix));};
  const totalLoad=Math.max(1e-9,Object.values(feet).reduce((s,f)=>s+f.load,0));
  const supportSide=Object.values(feet).reduce((s,f)=>s+point(rz(-yaw),sub(f.paw,root.position))[1]*f.load,0)/totalLoad;
  const side=point(rz(yaw),[0,clamp(supportSide*.27,-.065,.065),0]);
  let p=add(add(point(rz(yaw),B.pelvis.head),side),[0,0,-lower]);
  for(const [n,ang,pitch,r] of [['pelvis',yaw-lead*.20,-.08*lower,roll*.6],['lumbar',yaw+lead*.33,.10*lower,roll*.8],['chest',yaw+lead*.70,.28*lower,roll],['neck',yaw+lead*.83,.40*lower,roll*.4]]) {
    const R=rot(ang,pitch,r);put(n,p,R);p=add(p,point(R,sub(B[n].tail,B[n].head)));
  }
  put('head',p,rot(yaw+lead,.65*lower,roll*.3));
  const reachFailures=[];
  for(const f of calibration.phaseOrder) {
    const leg=calibration.limbs[f],foot=feet[f],hip=point(trans[calibration.hipBindings[f].anchor],leg.hip),pr=rot(foot.yaw,foot.curl,0);
    const ankle=add(sub(foot.paw,root.position),point(pr,leg.ankleOffset)),d=sub(ankle,hip),dist=norm(d),l1=leg.upperLength,l2=leg.lowerLength;
    if(!(Math.abs(l1-l2)+.0001<dist&&dist<l1+l2-.0001))reachFailures.push({limb:f,distance:dist,maximum:l1+l2});
    const axis=scale(d,1/Math.max(dist,1e-9));let pole=point(rz(yaw),[leg.bend,0,0]);pole=unit(sub(pole,scale(axis,dot(pole,axis))));
    const x=(l1*l1-l2*l2+dist*dist)/(2*dist),h=Math.sqrt(Math.max(0,l1*l1-x*x)),knee=add(add(hip,scale(axis,x)),scale(pole,h));
    for(const [n,a,b] of [[f+'_upper',hip,knee],[f+'_lower',knee,ankle]])put(n,a,multiply(rz(yaw),between(sub(B[n].tail,B[n].head),point(rz(-yaw),sub(b,a)))));
    put(f+'_paw',ankle,pr);feet[f]={...foot,hip:add(root.position,hip),knee:add(root.position,knee),ankle:add(root.position,ankle),reachMargin:l1+l2-dist};
  }
  p=point(trans.pelvis,B.tail_0.head);
  for(let i=0;i<3;i++){const n='tail_'+i,lag=-lead*(.38+i*.13),R=rot(yaw+lag,-.08*lower,lag*.4);put(n,p,R);p=add(p,point(R,sub(B[n].tail,B[n].head)));}
  if(reachFailures.length)throw Object.assign(Error('UNREACHABLE_MIKA_POSE'),{reachFailures});
  const boneMatrices=Object.fromEntries(Object.entries(bones).map(([n,m])=>[n,multiply(rz(-yaw),m)]));
  return {format:'mika-locomotion-sample/v1',rootOwner:'navigation',time,root:{position:[...root.position],heading:yaw},boneMatrices,phase:ph,contacts:feet,reachFailures};
}

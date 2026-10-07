/** Inactive R1 route adapter. The ordinary lawn and placement geometry are not changed. */
import {angleDelta} from './motion/trajectory.mjs';
import {sampleMotion} from './motion/kinematics.mjs';
import {gaitFromSupported,supportedWorldValid,bodyPolygon} from './dynamic-prop-planner.mjs';
import {createCanonicalNavigation,convexHull,actorClearance} from './dynamic-navigation.mjs';
import {directContinuousTrajectory,reachablePolyline} from './dynamic-trajectory.mjs';
const EPS=1e-6, distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pose=w=>({position:{x:w.root.x,y:w.root.y},heading:w.heading});
export function supportedLine(actor,start,end,heading=start.heading,speedScale=1){
 const length=distance(start.position,end),moveMs=Math.max(2,Math.ceil(1.875*length/(actor.maxSpeedSourcePerSecond*actor.unitsPerSource*speedScale)*1000/actor.halfStepMs))*actor.halfStepMs;
 return {ok:true,format:'yard-continuous-trajectory-request/v1',start,goal:{position:end,heading},fixedHeading:heading,length,moveMs,anticipationMs:actor.anticipationMs,settleMs:actor.halfStepMs*2,totalMs:actor.anticipationMs+moveMs+actor.halfStepMs*2,maxCurvature:0,segments:[{kind:'line',control:[start.position,end],offset:0,length,arc:[{t:0,length:0},{t:1,length}]}]};
}
function turn(actor,start,heading){const moveMs=Math.max(2,Math.ceil(Math.abs(angleDelta(heading,start.heading))/(Math.PI/6))*2)*actor.halfStepMs;return {ok:true,motionKind:'supported-turn',format:'yard-continuous-trajectory-request/v1',start,goal:{position:{...start.position},heading},length:0,moveMs,anticipationMs:actor.anticipationMs,settleMs:actor.halfStepMs*2,totalMs:actor.anticipationMs+moveMs+actor.halfStepMs*2,maxCurvature:0};}
export function qualifyStayStage(route,actor,previous,nav,kind){
 const gait=gaitFromSupported(route,actor,previous),times=[0,route.totalMs,...gait.events.flatMap(e=>[e.startMs,e.endMs,(e.startMs+e.endMs)/2]),...Array.from({length:Math.ceil(route.totalMs/20)},(_,i)=>i*20)];
 for(const t of times){const w=sampleMotion(route,gait,actor,t);if(!w.support.length||!supportedWorldValid(w,actor,nav))return {prepared:false,code:'R1_STAY_ROUTE_BLOCKED',kind,atMs:t};}
 return {prepared:true,kind,route,gait,end:sampleMotion(route,gait,actor,route.totalMs),sourceCheck:{sampleCount:times.length,kind:'declared-kinematics-only',visualQualification:false}};
}
/** From an actual double-support pose, including a close leaf approach, to a
 * passable lawn endpoint. Back away first; never turn through the plant. */
export function planStayTransfer({geometry,rows,actor,previous,goal,curveFinalApproach=false}){
 const nav=createCanonicalNavigation({geometry,rows,actor}),stages=[];let world=previous;
 if(!supportedWorldValid(world,actor,nav)||world.support.length!==2||!nav.passable(goal.position))return {prepared:false,code:'R1_STAY_TRANSFER_ENDPOINT_BLOCKED'};
 const add=(route,kind)=>{const s=qualifyStayStage(route,actor,world,nav,kind);if(!s.prepared)return false;stages.push(s);world=s.end;return true;};
 if(!nav.passable(world.root)){
  let found=false;for(let d=2;d<=20;d+=2){const end={x:world.root.x-Math.cos(world.heading)*d,y:world.root.y-Math.sin(world.heading)*d};
   if(!nav.passable(end)||!nav.clearPolygon(convexHull([...bodyPolygon(actor,world.root,world.heading,.075),...bodyPolygon(actor,end,world.heading,.075)]))||!nav.visualHull([world.root,end]))continue;
   if(add(supportedLine(actor,pose(world),end,world.heading,.5),'back-away')){found=true;break;}}
  if(!found)return {prepared:false,code:'R1_STAY_NO_SUPPORTED_BACK_AWAY'};
 }
 const direct=directContinuousTrajectory(actor,pose(world),goal,nav);
 if(direct&&add(direct,'return-to-portal'))return {prepared:true,stages,settled:world};
 const path=reachablePolyline(nav,world.root,goal.position);if(!path)return {prepared:false,code:'R1_STAY_NO_CONNECTED_EXIT'};
 for(const [index,end] of path.slice(1).entries()){const heading=Math.atan2(end.y-world.root.y,end.x-world.root.x);
  if(Math.abs(angleDelta(heading,world.heading))>EPS&&!add(turn(actor,pose(world),heading),'orient-with-steps'))return {prepared:false,code:'R1_STAY_EXIT_TURN_BLOCKED'};
  if(curveFinalApproach&&index===path.length-2){const curve=directContinuousTrajectory(actor,pose(world),goal,nav);if(curve&&add(curve,'return-to-portal-curved'))return {prepared:true,stages,settled:world};}
  if(!add(supportedLine(actor,pose(world),end,heading),'return-to-portal'))return {prepared:false,code:'R1_STAY_EXIT_WALK_BLOCKED'};
 }
 if(Math.abs(angleDelta(goal.heading,world.heading))>EPS&&!add(turn(actor,pose(world),goal.heading),'face-exit-with-steps'))return {prepared:false,code:'R1_STAY_FINAL_TURN_BLOCKED'};
 return {prepared:true,stages,settled:world};
}
/** Source-owned actor-only portal, calculated from the pinned camera and full
 * conservative R1 volume (not the root point). A rounded corridor extends one
 * front lawn edge. The ordinary placement polygon is never modified. */
export function buildR1FrontPortal(geometry,actor,rows){
 const c=geometry.composition.camera,art=geometry.composition.art,scale=c.pixelsPerSceneUnitCss/geometry.composition.canonicalPerSceneUnit;
 const determinant=c.right[0]*c.down[1]-c.right[1]*c.down[0];
 const unproject=(x,y)=>{const sx=(x-c.projectionOriginCss[0])/scale,sy=(y-c.projectionOriginCss[1])/scale;return {x:c.projectionOriginCanonical[0]+(sx*c.down[1]-sy*c.right[1])/determinant,y:c.projectionOriginCanonical[1]+(sy*c.right[0]-sx*c.down[0])/determinant};};
 const project=(p,z=0)=>({x:c.projectionOriginCss[0]+((p.x-c.projectionOriginCanonical[0])*c.right[0]+(p.y-c.projectionOriginCanonical[1])*c.right[1]+z*c.right[2])*scale,y:c.projectionOriginCss[1]+((p.x-c.projectionOriginCanonical[0])*c.down[0]+(p.y-c.projectionOriginCanonical[1])*c.down[1]+z*c.down[2])*scale});
 const radius=actor.unitsPerSource,height=1.5*actor.unitsPerSource,offsets=[];
 for(const x of [-radius,radius])for(const y of [-radius,radius])for(const z of [0,height])offsets.push({x:(x*c.right[0]+y*c.right[1]+z*c.right[2])*scale,y:(x*c.down[0]+y*c.down[1]+z*c.down[2])*scale});
 const minY=Math.min(...offsets.map(p=>p.y)),maxY=Math.max(...offsets.map(p=>p.y)),screenX=art.width*.70;
 const join=unproject(screenX,art.height-maxY-12),outside=unproject(screenX,art.height-minY+4),length=distance(join,outside),down={x:(outside.x-join.x)/length,y:(outside.y-join.y)/length},right={x:-down.y,y:down.x},r=actorClearance(actor)+.65;
 const sidePoint=(p,s)=>({x:p.x+right.x*r*s,y:p.y+right.y*r*s});
 // The front edge is identified by the exact calibrated clip boundary, rather
 // than a freely supplied index or a global expansion of the lawn.
 const ground=geometry.ground.map(([x,y])=>({x,y}));
 const front=ground.findIndex((a,i)=>Math.abs(project(a).y-art.height)<1&&Math.abs(project(ground[(i+1)%ground.length]).y-art.height)<1);
 if(front<0)throw Error('R1_FRONT_EDGE_UNREGISTERED');
 const hit=s=>{const a=ground[front],b=ground[(front+1)%ground.length],p=sidePoint(join,s),dx=b.x-a.x,dy=b.y-a.y,den=down.x*dy-down.y*dx,t=((a.x-p.x)*dy-(a.y-p.y)*dx)/den,u=((a.x-p.x)*down.y-(a.y-p.y)*down.x)/den;if(u<0||u>1)throw Error('R1_PORTAL_EDGE_MISS');return {x:p.x+down.x*t,y:p.y+down.y*t};};
 const cap=Array.from({length:17},(_,i)=>{const t=i*Math.PI/16;return {x:outside.x+r*(right.x*Math.cos(t)+down.x*Math.sin(t)),y:outside.y+r*(right.y*Math.cos(t)+down.y*Math.sin(t))};});
 const first=hit(1),last=hit(-1),extension=[first,...cap,last];
 if(extension.some(p=>p.x<geometry.domain.min[0]||p.y<geometry.domain.min[1]||p.x>geometry.domain.max[0]||p.y>geometry.domain.max[1]))throw Error('R1_PORTAL_OUTSIDE_WORLD_DOMAIN');
 const portalGeometry=structuredClone(geometry);portalGeometry.ground=[...ground.slice(0,front+1),...extension,...ground.slice(front+1)].map(p=>[p.x,p.y]);
 // Only this route-local navigation gets a taller clipping volume. Fixed shell,
 // world ground, all committed props, and horizontal raster bounds still apply.
 portalGeometry.composition.art.height=project(outside).y+maxY+1;
 const nav=createCanonicalNavigation({geometry:portalGeometry,rows,actor}),ordinary=createCanonicalNavigation({geometry,rows,actor});
 const inCorridor=p=>{const q={x:p.x-join.x,y:p.y-join.y},along=q.x*down.x+q.y*down.y,across=q.x*right.x+q.y*right.y;return along>=-EPS&&along<=length+EPS&&Math.abs(across)<EPS;};
 const portalNav={...nav,visualPoint:p=>inCorridor(p)&&nav.visualPoint(p)};
 if(!ordinary.passable(join)||!nav.passable(outside)||!nav.segment(join,outside))throw Error('R1_PORTAL_CORRIDOR_BLOCKED');
 return {id:'pip-front-edge-portal-r1',revision:'actor-only-corridor-v1',join,outside,inwardHeading:Math.atan2(-down.y,-down.x),outwardHeading:Math.atan2(down.y,down.x),groundExtension:extension.map(p=>[p.x,p.y]),fullVolume:{radius,height},hiddenTop:project(outside).y+minY,clipBottom:art.height,actorOnly:true,navigation:portalNav};
}

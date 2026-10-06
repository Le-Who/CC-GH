import{buildTrajectory}from'./motion/trajectory.mjs';
import{buildGaitRequest,sampleMotion,inspectKinematics}from'./motion/kinematics.mjs';
import{makeNavigation}from'./motion/polygon-domain.mjs';
import{bounds}from'./motion/math.mjs';
export function locationFor(setup,index){
 if(![0,1].includes(index))throw Error('Unknown prototype placement');
 const loc=structuredClone(setup.location),p=setup.planter,move=setup.placements[index];
 loc.obstacles=loc.obstacles.map(o=>o.id==='planter'?{...o,polygon:p.footprint.map(([x,y])=>[x+move[0]-p.groundPivotCanonical[0],y+move[1]-p.groundPivotCanonical[1]])}:o);return loc;
}
export function makeRoute(setup,goalIndex,placementIndex,previous=null){
 if(![0,1,2].includes(goalIndex))throw Error('Only A, B and C are admitted');
 const start=previous?{position:{x:previous.root.x,y:previous.root.y},heading:previous.heading}:setup.start;
 const location=locationFor(setup,placementIndex),route=buildTrajectory({location,actor:setup.actor,start,goal:setup.goals[goalIndex]});
 if(!route.ok)throw Error('Prototype route rejected: '+route.code);
 const gait=buildGaitRequest(route,setup.actor),check=inspectKinematics(route,gait,setup.actor,makeNavigation(location,setup.actor,start.position));
 if(!check.ok)throw Error('Prototype kinematics rejected');
 if(previous)for(const side of['L','R']){const a=previous.feet[side],b=gait.initial[side];if(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)>1e-6||Math.abs(Math.atan2(Math.sin(a.heading-b.heading),Math.cos(a.heading-b.heading)))>1e-6)throw Error('Route would shift a planted foot');}
 return{route,gait,startsFromSettled:Boolean(previous),check};
}
export function sampleRoute(setup,run,elapsed){
 const {route,gait,startsFromSettled}=run,at=Math.max(0,Math.min(route.totalMs,elapsed)),step=Math.max(0,(at-route.anticipationMs)/setup.actor.halfStepMs);
 return{world:sampleMotion(route,gait,setup.actor,at),startsFromSettled,styleFrame:29+7.5*((step%2+2)%2),anticipationU:Math.max(0,Math.min(1,at/route.anticipationMs)),settleU:Math.max(0,Math.min(1,(at-route.anticipationMs-route.moveMs)/route.settleMs))};
}
export function assertPlacement(setup,index,world){
 const nav=makeNavigation(locationFor(setup,index),setup.actor,world.root);
 if(!nav.clearBox(bounds(world.bodyPolygon))||Object.values(world.feet).some(f=>!nav.clearBox(bounds(f.solePolygon))))throw Error('Planter overlaps a supported body or sole');
}

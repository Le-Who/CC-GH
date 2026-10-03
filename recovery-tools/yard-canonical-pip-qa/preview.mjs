import {createCourtyardScene} from '/__yard_source__/src/games/companion-yard-v2/scene.mjs';
import {ACTOR_PROFILES} from '/__yard_source__/game-logic/yard-v2/actor-profiles.mjs';
const fixture=await(await fetch('./fixture.json')).json(),closed=new URL(location.href).searchParams.get('mode')==='closed';
const canvas=document.querySelector('canvas'),status=document.querySelector('[role=status]'),errors=[];
let scene=null,lastAt=-Infinity,generation=0,disposed=0,playing=false,elapsed=0,lastStamp=performance.now();
function clock(){return elapsed;}
function animate(stamp){if(playing)elapsed+=Math.min(100,stamp-lastStamp);lastStamp=stamp;requestAnimationFrame(animate);}
requestAnimationFrame(animate);
const snapshotAt=at=>{const base=closed?fixture.closedSnapshot:at>=fixture.times.finished?fixture.finishedSnapshot:fixture.snapshot;
 return{...base,yardRuntime:{...base.yardRuntime,serverNow:at}};};
async function mount(at){
 playing=false;elapsed=0;const current=++generation;if(scene){scene.dispose();disposed++;}
 // This explicit profile exists only in this static acceptance fixture. The
 // canonical registry and source release gate both remain false.
 const actorProfiles=closed?ACTOR_PROFILES:{...ACTOR_PROFILES,pip:fixture.acceptanceProfile};
 const owner=createCourtyardScene(canvas,{actorProfiles,now:clock,onError:e=>errors.push(String(e)),
  onView:v=>{if(current===generation)status.textContent=`${closed?'Closed gate':v.pets[0]?.role||'Finished'} · ${v.bowls[0]?.foodId||'empty bowl'} · gifts ${v.pendingGifts.length}`;}});
 scene=owner;lastAt=at;owner.update(snapshotAt(at));await owner.ready;
}
async function seek(value){playing=false;const at=typeof value==='string'?fixture.times[value]:value;if(!Number.isSafeInteger(at))throw Error('Fixture timestamp required');
 if(!scene||at<scene.diagnostics().presentationTime)await mount(at);else{lastAt=at;scene.update(snapshotAt(at));}}
const diagnostics=()=>{const d=scene?.diagnostics(),r=canvas.getBoundingClientRect();return{...d,errors:[...errors],closed,releaseAccepted:false,generation,disposed,
 canvasBounds:{x:r.x,y:r.y,width:r.width,height:r.height},horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
 buttons:[...document.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),
 targetInstances:d?.view?Number(!!d.view.props.find(p=>p.slotId==='snack'&&p.supported&&p.drawStandalone))+d.view.pets.filter(p=>p.propOwnerSlotId==='snack').length:null,
 sourceStateUnchanged:fixture.releaseAccepted===false};};
for(const b of document.querySelectorAll('[data-time]'))b.onclick=()=>seek(b.dataset.time).catch(e=>errors.push(String(e)));
addEventListener('pagehide',()=>scene?.dispose());await mount(fixture.times.approach);
window.yardQA={ready:true,play:()=>{lastStamp=performance.now();playing=true;},pause:()=>{playing=false;},times:fixture.times,seek,diagnostics,bitmap:()=>canvas.toDataURL(),dispose:()=>{scene.dispose();disposed++;}};

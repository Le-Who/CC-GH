import {createMochiCombinedCandidate} from '/__mochi_source__/game-logic/yard-v2/media/mochi-combined-binding.mjs';
import {AtlasCache} from '/__mochi_source__/src/games/companion-yard-v2/atlas.mjs';
import {createProjection,BASIS} from '/__mochi_source__/src/games/companion-yard-v2/projection.mjs';
const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${r.status}: ${p}`);return r.json();};
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),slider=document.querySelector('#seek'),status=document.querySelector('#state'),button=document.querySelector('#play');
const errors=[],events=[];window.addEventListener('error',e=>errors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const [clip,stride,ground,combined,cardinal]=await Promise.all([get('./contracts/clip.json'),get('./contracts/stride.json'),get('./contracts/ground.json'),get('./media/combined/candidate-media.json'),get('./media/cardinal/candidate-media.json')]);
const setBase=(c,base)=>({...c,assetBaseURL:new URL(base,location.href).href});const active=setBase(combined,'./media/combined/');
const walk=Object.fromEntries(Object.entries(cardinal.walk.facings).map(([k,c])=>[k,setBase(c,'./media/cardinal/')]));
const turns=Object.fromEntries(Object.entries(cardinal.turns).map(([k,c])=>[k,setBase(c,'./media/cardinal/')]));
const atlas=new AtlasCache(new URL('./media/combined/',location.href),3,{onEvent:e=>{events.push(e);if(events.length>300)events.shift();}});
const scene={entry:{x:90,y:68},entryClearance:4,footprints:{yarn_mouse:{width:8.8,height:3.2}},exclusions:[]};
const binding=createMochiCombinedCandidate({clip,strideContract:stride,motionContract:ground,scene});
const props=[{slotId:'target-toy',goodieId:'yarn_mouse',x:50,y:45,condition:'new',rotationZ:0,drawStandalone:true},{slotId:'other-toy',goodieId:'yarn_mouse',x:76,y:42,condition:'new',rotationZ:0,drawStandalone:true}];
const candidate={at:100000,leavesAt:2800000,placement:props[0],yard:{remodel:'meadow',expansion:{level:1},placedGoodies:props},active:[],reserved:[]};const result=binding.preflightCandidate(candidate);if(!result.ok)throw Error(JSON.stringify(result));const plan=result.plan;
const still=await new Promise((yes,no)=>{const im=new Image;im.onload=()=>yes(im);im.onerror=no;im.src='./media/combined/target-prop-still.webp';});
let projection,playing=false,sourceMs=0,last=performance.now(),painted=null;const sourceRows=clip.samples;
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);projection=createProjection(r.width,r.height);painted=null;}
new ResizeObserver(resize).observe(canvas);resize();
function atSource(t){return t<clip.restLoop.endMs?plan.schedule.combinedStart+t:plan.schedule.combinedEnd-(clip.durationMs-t);}
function selection(t){const at=atSource(t),pose=binding.sample(plan,at);if(!pose)return{at,pose:null};let c;
 if(pose.phase==='active-clip')c=active;else if(pose.motion.kind==='turn')c=turns[`${pose.motion.fromFacing}:${pose.motion.direction}:${pose.motion.angleSteps}`];else c=walk[pose.motion.facing];
 return{at,pose,clip:c,index:pose.phase==='active-clip'?pose.frameIndex:pose.motion.frameIndex};}
const sourceProject=p=>[active.pivotPx[0]+50*BASIS.right.reduce((v,n,i)=>v+n*p[i],0),active.pivotPx[1]+50*BASIS.down.reduce((v,n,i)=>v+n*p[i],0)];const propPivot=sourceProject(clip.propRoot);
function shadow(p,rx,ry,opacity){ctx.save();ctx.translate(p.x,p.y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(48,65,32,${opacity})`);g.addColorStop(1,'rgba(48,65,32,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
function draw(selected){const {at,pose}=selected,ready=atlas.frame(selected.clip,selected.index);if(!ready)return false;
 const view=binding.compose(props,plan,at,{readyFrame:{clipId:pose.clipId,frameIndex:pose.frameIndex}});if(view.requiresCoherentFrameHold)return false;
 const {width,height,ppu}=projection;ctx.clearRect(0,0,width,height);
 const anchor=pose.phase==='active-clip'?pose.clipOrigin:pose.position;
 for(const point of selected.clip.groundContacts[selected.index]||[]){const p=projection.project({x:anchor.x+point[0]*8,y:anchor.y+point[1]*8});shadow(p,ppu*.16,ppu*.055,.18);}
 const layers=[];let targetInstances=pose.phase==='active-clip'?1:0;let otherInstances=0;
 for(const p of view.props){const q=projection.project(p);shadow(q,ppu*.3,ppu*.1,.16);if(p.drawStandalone!==false){
  layers.push({y:q.y,paint:()=>{const scale=ppu/50;ctx.drawImage(still,q.x-propPivot[0]*scale,q.y-propPivot[1]*scale,still.width*scale,still.height*scale);}});
  if(p.slotId==='target-toy')targetInstances++;else otherInstances++;
 }}
 const q=projection.project(anchor);layers.push({y:q.y,paint:()=>atlas.draw(ctx,selected.clip,selected.index,q,ppu)});layers.sort((a,b)=>a.y-b.y).forEach(l=>l.paint());
 painted={sourceMs,at,width,height,ppu,frameIndex:selected.index,phase:pose.phase,targetInstances,otherInstances,targetHidden:view.targetSlotHidden,clipId:selected.clip.id,root:pose.position,decodedBytes:atlas.decodedBytes,retainedPages:atlas.entries.size};
 status.textContent=`${pose.phase} · frame ${selected.index} · target ${targetInstances} · other prop ${otherInstances} · ${(atlas.decodedBytes/1048576).toFixed(1)} MiB`;return true;
}
function tick(now){if(playing&&!document.hidden)sourceMs=Math.min(20200,sourceMs+Math.min(now-last,100));last=now;if(sourceMs===20200){playing=false;button.textContent='Play';}
 slider.value=String(Math.round(sourceMs/50)*50);document.querySelector('#time').textContent=`${(sourceMs/1000).toFixed(2)}s`;
 try{const cur=selection(sourceMs),future=selection(Math.min(20200,sourceMs+1100));if(cur.pose){atlas.prepare([{clip:cur.clip,index:cur.index}],future.pose?[{clip:future.clip,index:future.index}]:[]);draw(cur);}if(atlas.error)throw atlas.error;}catch(e){errors.push(String(e));status.textContent=String(e);}
 requestAnimationFrame(tick);}
function seek(t){sourceMs=Math.max(-1000,Math.min(20200,t));playing=false;button.textContent='Play';}
button.onclick=()=>{playing=!playing;last=performance.now();button.textContent=playing?'Pause':'Play';};slider.oninput=()=>seek(Number(slider.value));document.querySelectorAll('[data-seek]').forEach(b=>b.onclick=()=>seek(Number(b.dataset.seek)));
addEventListener('beforeunload',()=>atlas.dispose());document.addEventListener('visibilitychange',()=>last=performance.now());
window.mochiQA={ready:true,seek,diagnostics:()=>({sourceMs,painted,playing,errors:[...new Set(errors)],retainedPages:atlas.entries.size,decodedBytes:atlas.decodedBytes,pendingBytes:atlas.reservedBytes,pendingDecodes:atlas.active,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),events:events.slice(-25),runtimeActivated:false})};requestAnimationFrame(tick);

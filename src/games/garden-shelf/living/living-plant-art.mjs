import {stageProfile} from './plant-stage-profiles.mjs';
import {EXTRA_PROFILES} from './plant-profiles.mjs';
import {DAISY,MONSTERA,FERN,makeGrid,prepareSkin,evaluateSkin,createPresentationClock,idleScaleForWidth} from './plant-motion.mjs';
import {intersectRects,fitArtwork,normalizePhase,visualEvents,BoundedTextureLedger} from './plant-presentation-contract.mjs';
const BASE='/games/garden-living/';
const species={
 daisy:{config:DAISY,files:['daisy-seedling-r1.webp','daisy-young-r1.webp','daisy-budding-r1.webp','daisy-mature-r2.webp']},
 monstera:{config:MONSTERA,files:['monstera-seedling-r1.webp','monstera-young-r1.webp','monstera-developing-r1.webp','monstera-mature-r1.webp']},
 fern:{config:FERN,files:['fern-seedling-r1.webp','fern-young-r1.webp','fern-developing-r1.webp','fern-mature-r1.webp']}
};
for(const [type,config] of Object.entries(EXTRA_PROFILES)){
 const stem=type.replaceAll('_','-');species[type]={config,files:['seedling','young','developing','mature'].map(stage=>`${stem}-${stage}-r1.webp`)};
}
species.lavender.files[0]='lavender-seedling-r2.webp';
export const livingPlantSpecies=Object.freeze(Object.keys(species));
export const supportsLivingPlant=type=>Object.hasOwn(species,type);
const managers=new Map();
export const LIVING_MOTION_CHANGE = 'garden:motion-state';
export function listenToMotionPreference(media, listener) {
 if (typeof media.addEventListener === 'function') {
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
 }
 // Older embedded browsers expose the same preference through addListener.
 media.addListener?.(listener);
 return () => media.removeListener?.(listener);
}
function setPlantMode(node, mode, reason = '') {
 if (!node) return;
 const data = node.dataset || (node.dataset = {});
 if (data.livingMode === mode && data.livingReason === reason) return;
 data.livingMode = mode; data.livingReason = reason;
 globalThis.document?.dispatchEvent?.(new Event(LIVING_MOTION_CHANGE));
}
// Player-facing state follows the actual shelf renderer, not a presumed host setting.
export function getLivingPlantMotionState(root = document.querySelector('.gs2-stage')) {
 if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
 const nodes = [...(root?.querySelectorAll('.gs2-live-plant') || [])];
 if (nodes.some(node => node.dataset.livingMode === 'static-fallback')) return 'fallback';
 if (nodes.some(node => node.dataset.livingMode === 'loading')) return 'loading';
 return 'on';
}

let nextSurfaceId=0;const lifecycle=[];
function trace(event,surface,extra={}){lifecycle.push({event,surfaceId:surface.id,time:performance.now(),...extra});if(lifecycle.length>128)lifecycle.shift();}
const grid=makeGrid(24,36);
const seedFor=id=>{let n=2166136261;for(const c of String(id)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0)/4294967296*Math.PI*2;};
export function notifyPlantTouch(id){document.dispatchEvent(new CustomEvent('garden:visual-touch',{detail:{id}}));}
function visibleRect(node,root){
 let rect=intersectRects(node.getBoundingClientRect(),root.getBoundingClientRect());
 if(!rect)return null;
 for(let p=node.parentElement;p&&p!==root;p=p.parentElement){const style=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(style.overflow+style.overflowX+style.overflowY)){rect=intersectRects(rect,p.getBoundingClientRect());if(!rect)return null;}}
 return rect;
}
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message);}return s;}
export class PlantSurface{
 constructor(root){
  this.id=++nextSurfaceId;this.root=root;this.entries=new Set();this.ledger=new BoundedTextureLedger(16);this.pending=new Map();this.failed=new Set();this.clock=createPresentationClock();this.dead=false;this.frame=0;this.lastDraw=0;this.metrics={frames:0,touches:0,waterings:0,growths:0,lastCpuMs:0,maxCpuMs:0};
  this.canvas=document.createElement('canvas');this.canvas.className='gs2-live-surface';this.canvas.setAttribute('aria-hidden','true');Object.assign(this.canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'2',pointerEvents:'none'});root.append(this.canvas);
  try{this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});if(!this.gl){this.canvas.remove();throw Error('WebGL unavailable');}
  const gl=this.gl;this.vs=shader(gl,gl.VERTEX_SHADER,'attribute vec2 position;attribute vec2 uv;varying vec2 v;void main(){v=uv;gl_Position=vec4(position.x*2.-1.,1.-position.y*2.,0.,1.);}');this.fs=shader(gl,gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D art;uniform sampler2D previousArt;uniform float growthMix;varying vec2 v;void main(){vec4 a=texture2D(previousArt,v),b=texture2D(art,v);vec4 c=mix(vec4(a.rgb*a.a,a.a),vec4(b.rgb*b.a,b.a),growthMix);gl_FragColor=c;}');
  this.program=gl.createProgram();gl.attachShader(this.program,this.vs);gl.attachShader(this.program,this.fs);gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);gl.uniform1i(gl.getUniformLocation(this.program,'art'),0);gl.uniform1i(gl.getUniformLocation(this.program,'previousArt'),1);this.growthMix=gl.getUniformLocation(this.program,'growthMix');
  const attribute=(name,data)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);const a=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);return b;};
  this.positions=attribute('position',grid.uv);this.uv=attribute('uv',grid.uv);this.index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,grid.indices,gl.STATIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  this.reduce=matchMedia('(prefers-reduced-motion: reduce)');this.wake=()=>{cancelAnimationFrame(this.frame);this.clock.setVisible(!document.hidden);if(!document.hidden&&!this.dead)this.frame=requestAnimationFrame(t=>this.draw(t));};
  this.touch=e=>{for(const item of this.entries)if(item.state.id===e.detail?.id){item.touch=this.clock.elapsed;this.metrics.touches++;item.touches=(item.touches||0)+1;}this.wake();};
  this.lost=e=>{e.preventDefault();this.dispose('context-lost');};this.canvas.addEventListener('webglcontextlost',this.lost);
  document.addEventListener('garden:visual-touch',this.touch);document.addEventListener('visibilitychange',this.wake);window.addEventListener('resize',this.wake);document.addEventListener('scroll',this.wake,true);this.preferenceChanged=()=>{globalThis.document?.dispatchEvent?.(new Event(LIVING_MOTION_CHANGE));this.wake();};this.removePreferenceListener=listenToMotionPreference(this.reduce,this.preferenceChanged);
  this.observer=new ResizeObserver(this.wake);this.observer.observe(root);trace("create",this);this.wake();}catch(error){this.dispose();throw error;}
 }
 add(node,state){const item={node,state,skin:prepareSkin(grid,stageProfile(state.type,state.phase,species[state.type].config)),touch:-Infinity,water:-Infinity,touches:0,waterings:0,growths:0,drawCount:0,growthSamples:[],lastGrowthSample:-Infinity};this.entries.add(item);setPlantMode(node,'loading');this.wake();return item;}
 update(item,state){if(item.state.id!==state.id||item.state.type!==state.type){item.touch=-Infinity;item.water=-Infinity;item.previousKey=null;item.growStarted=null;item.touches=0;item.waterings=0;item.growths=0;item.drawCount=0;item.drawnKey=null;item.growthSamples=[];item.lastGrowthSample=-Infinity;item.skin=prepareSkin(grid,stageProfile(state.type,state.phase,species[state.type].config));item.state=state;this.wake();return;}for(const event of visualEvents(item.state,state)){if(event==='water'){item.water=this.clock.elapsed;this.metrics.waterings++;item.waterings++;}if(event==='grow'){item.skin=prepareSkin(grid,stageProfile(state.type,state.phase,species[state.type].config));this.metrics.growths++;item.growths++;item.previousKey=species[item.state.type].files[normalizePhase(item.state.phase)];item.growStarted=null;}}item.state=state;this.wake();}
 remove(item){item.node.querySelector('img')?.style.removeProperty('visibility');this.entries.delete(item);if(!this.entries.size)this.dispose();}
 async load(key){
  if(this.pending.has(key)||this.failed.has(key))return;
  const job=(async()=>{let image=new Image();try{image.src=BASE+key;await image.decode();if(this.dead){trace("decode-after-dispose",this,{key,uploaded:false});return;}const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.ledger.touch(key,{texture:t,aspect:image.width/image.height});trace("texture-upload",this,{key});this.wake();}catch(error){this.failed.add(key);console.warn('Garden plant art fallback',key,String(error));this.wake();}finally{image=null;this.pending.delete(key);}})();this.pending.set(key,job);
 }
 draw(now){
  if(this.dead||document.hidden)return;if(!this.reduce.matches)this.frame=requestAnimationFrame(t=>this.draw(t));const time=this.clock.step(now);if(!this.reduce.matches&&now-this.lastDraw<1000/30)return;this.lastDraw=now;const cpuStart=performance.now();
  const gl=this.gl,root=this.root.getBoundingClientRect();if(root.width<=0||root.height<=0)return;const dpr=Math.min(devicePixelRatio||1,2,4096/root.width,4096/root.height),width=Math.round(root.width*dpr),height=Math.round(root.height*dpr);
  if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.SCISSOR_TEST);const protectedKeys=new Set();
  for(const item of this.entries){
   const spec=species[item.state.type],key=spec.files[normalizePhase(item.state.phase)],clip=visibleRect(item.node,this.root);item.requestedKey=key;item.clip=clip;if(!clip){item.drawnKey=null;continue;}protectedKeys.add(key);
   let cached=this.ledger.entries.get(key),cacheKey=key;const fallback=item.node.querySelector('img'),previous=item.previousKey?this.ledger.entries.get(item.previousKey):null;let mix=1;if(!cached){this.load(key);if(previous){cached=previous;cacheKey=item.previousKey;mix=0;protectedKeys.add(item.previousKey);}else{if(fallback)fallback.style.visibility='';setPlantMode(item.node,this.failed.has(key)?'static-fallback':'loading',this.failed.has(key)?'image-unavailable':'');item.drawnKey=null;continue;}}else if(previous&&!this.reduce.matches){if(item.growStarted===null)item.growStarted=time;mix=Math.min(1,(time-item.growStarted)/1.2);if(mix<1)protectedKeys.add(item.previousKey);else{item.previousKey=null;item.growthResumeAt=time;}}else item.previousKey=null;this.ledger.touch(cacheKey,cached);
   const slot=item.node.getBoundingClientRect(),fit=fitArtwork(slot,cached.aspect,.04);gl.viewport(Math.round((fit.left-root.left)*dpr),Math.round((root.bottom-fit.bottom)*dpr),Math.max(1,Math.round(fit.width*dpr)),Math.max(1,Math.round(fit.height*dpr)));gl.scissor(Math.max(0,Math.floor((clip.left-root.left)*dpr)),Math.max(0,Math.floor((root.bottom-clip.bottom)*dpr)),Math.ceil(clip.width*dpr),Math.ceil(clip.height*dpr));
   const vertices=evaluateSkin(item.skin,time,{reduced:this.reduce.matches,idleScale:idleScaleForWidth(fit.width),seed:seedFor(item.state.id||item.state.type),impulseAge:time-item.touch,waterAge:time-item.water});const resume=mix<1?0:item.growthResumeAt===undefined?1:Math.min(1,Math.max(0,(time-item.growthResumeAt)/.3));if(resume<1)for(let j=0;j<vertices.length;j++)vertices[j]=grid.uv[j]+(vertices[j]-grid.uv[j])*resume;gl.bindBuffer(gl.ARRAY_BUFFER,this.positions);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,cached.texture);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,(previous||cached).texture);gl.uniform1f(this.growthMix,mix);gl.drawElements(gl.TRIANGLES,grid.indices.length,gl.UNSIGNED_SHORT,0);if((item.previousKey||item.growthMix<1)&&(time-item.lastGrowthSample>=.1||mix===1)){item.growthSamples.push({time,phase:item.state.phase,requestedKey:key,drawnKey:cacheKey,previousKey:item.previousKey??null,mix});if(item.growthSamples.length>64)item.growthSamples.shift();item.lastGrowthSample=time;}item.drawnKey=cacheKey;item.growthMix=mix;item.drawRect=fit;item.slot=slot;item.drawCount++;setPlantMode(item.node,this.reduce.matches?'reduced':'animated');if(fallback)fallback.style.visibility='hidden';
  }
  for(const [,record]of this.ledger.evict(protectedKeys))gl.deleteTexture(record.texture);this.metrics.frames++;this.metrics.lastCpuMs=performance.now()-cpuStart;this.metrics.maxCpuMs=Math.max(this.metrics.maxCpuMs,this.metrics.lastCpuMs);
 }
 dispose(reason=''){
  if(this.dead)return;this.dead=true;trace("dispose",this);cancelAnimationFrame(this.frame);this.observer?.disconnect();document.removeEventListener('garden:visual-touch',this.touch);document.removeEventListener('visibilitychange',this.wake);document.removeEventListener('scroll',this.wake,true);window.removeEventListener('resize',this.wake);this.removePreferenceListener?.();for(const item of this.entries){item.node.querySelector('img')?.style.removeProperty('visibility');if(reason)setPlantMode(item.node,'static-fallback',reason);}
  const gl=this.gl;if(gl){for(const [,record]of this.ledger.clear())gl.deleteTexture(record.texture);gl.deleteBuffer(this.positions);gl.deleteBuffer(this.uv);gl.deleteBuffer(this.index);gl.deleteProgram(this.program);gl.deleteShader(this.vs);gl.deleteShader(this.fs);}this.canvas.remove();managers.delete(this.root);
 }
}
export function makeLivingPlantArt(React,Legacy=null){
 return function LivingPlantArt({plant,size=112}){
  const ref=React.useRef(null),binding=React.useRef(null),[failed,setFailed]=React.useState(false),phase=normalizePhase(plant.phase),spec=species[plant.type];
  React.useEffect(()=>{
   const node=ref.current,root=node?.closest('.gs2-modal-layer,.gs2-stage');if(!root||!spec)return;
   const catalog=!!node.closest('.gs2-catalog');
   if(catalog){setPlantMode(node,'static-catalog');node.querySelector('img')?.style.removeProperty('visibility');return;}
   if(failed){setPlantMode(node,'static-fallback','image-unavailable');return;}
   try{
    let manager=managers.get(root);
    if(!manager){if(managers.size>=3){setPlantMode(node,'static-fallback','surface-limit');return;}manager=new PlantSurface(root);managers.set(root,manager);}
    const item=manager.add(node,plant);binding.current={manager,item};
    return()=>{manager.remove(item);binding.current=null;};
   }catch(error){setPlantMode(node,'static-fallback','unavailable');console.warn('Garden live art unavailable; static fallback retained',String(error));}
  },[plant.id,plant.type,failed]);
  React.useEffect(()=>{binding.current?.manager.update(binding.current.item,plant);},[plant.id,plant.phase,plant.lastWatered]);
  return React.createElement('span',{ref,className:'gs2-plant-art gs2-live-plant','data-living-species':plant.type,'data-living-phase':phase,style:{width:size,height:size}},failed&&Legacy?React.createElement(Legacy,{plant,size}):React.createElement('img',{src:BASE+spec.files[phase],alt:'',draggable:false,onError:()=>setFailed(true),style:{display:'block',width:'92%',height:'92%',objectFit:'contain',objectPosition:'center bottom',marginBottom:'4%'}}));
 };
}

export function getLivingPlantDiagnostics(){return {kind:'presentation-only',species:[...livingPlantSpecies],lifecycle:lifecycle.map(e=>({...e})),surfaces:[...managers.values()].map(m=>({id:m.id,rootKind:m.root.classList?.contains('gs2-modal-layer')?'care':'shelf',entries:m.entries.size,textures:m.ledger.entries.size,pending:[...m.pending.keys()],failed:[...m.failed],reducedMotion:m.reduce.matches,presentationSeconds:m.clock.elapsed,...m.metrics,plants:[...m.entries].map(i=>({id:i.state.id,type:i.state.type,phase:i.state.phase,requestedKey:i.requestedKey??null,drawnKey:i.drawnKey??null,previousKey:i.previousKey??null,growthMix:i.growthMix??1,drawCount:i.drawCount,touches:i.touches,waterings:i.waterings,growths:i.growths,growthSamples:i.growthSamples.map(v=>({...v})),clip:i.clip??null,slot:i.slot?{left:i.slot.left,top:i.slot.top,width:i.slot.width,height:i.slot.height}:null,drawRect:i.drawRect??null}))}))};}
if(typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location?.hostname)){window.__GARDEN_LIVING_QA__=Object.freeze({snapshot:getLivingPlantDiagnostics});}

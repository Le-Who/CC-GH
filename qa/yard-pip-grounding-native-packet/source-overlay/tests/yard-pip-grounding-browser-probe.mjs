// QA-only, compiled exclusively by the reviewed private Vite overlay.
import {createOptionalPipRenderer} from '../src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {ENCODED_BACKGROUND_CPU_BYTES, LIMITS} from '../src/games/companion-yard-v2/pip-prototype/resources.mjs';
export const GROUNDING_RECIPE = Object.freeze({id: 'pip-garden-grounding-v1',
  ambient: Object.freeze({color: [.86,.87,.82], intensity: .55}),
  directional: Object.freeze([
    Object.freeze({color: [.99,.96,.88], intensity: 2.15}),
    Object.freeze({color: [.93,.96,1], intensity: .44}),
    Object.freeze({color: [1,.98,.94], intensity: .42}),
  ]),
  contact: Object.freeze({body: [.39,.49,.29], foot: [.15,.12,.37]}),
});
const WIDTH=390, HEIGHT=648, CHUNK_ROWS=16, SCRATCH_BYTES=WIDTH*CHUNK_ROWS*4;
export function propsOnlyExpectedFrame(frame, props, selectedSlotId = null, math) {
  const {Matrix4, Vector3} = math ?? {};
  if (!Matrix4 || !Vector3) throw Error('Admitted renderer-provided Three math required');
  // Diagnostic visibility changes the anchor, never the actual actor pose,
  // garden camera or displayed surface extent. Predict only those anchor fields.
  const visible = props.filter(p => p.visible), selected = visible.find(p => p.ghost)
    ?? visible.find(p => p.slotId === selectedSlotId) ?? (selectedSlotId === null ? visible[0] : null);
  if (!selected || !Array.isArray(selected.position) || selected.position.length !== 3 || !selected.position.every(Number.isFinite)) throw Error('Held selected T2 anchor missing');
  for (const key of ['cameraWorld', 'cameraProjection']) if (!Array.isArray(frame[key]) || frame[key].length !== 16 || !frame[key].every(Number.isFinite)) throw Error('Held camera matrices required for prop mask');
  if (![frame.rect?.width, frame.rect?.height].every(v => Number.isFinite(v) && v > 0)) throw Error('Held raster extent required for prop mask');
  const projected = new Vector3(...selected.position)
    .applyMatrix4(new Matrix4().fromArray(frame.cameraWorld).invert())
    .applyMatrix4(new Matrix4().fromArray(frame.cameraProjection));
  const rootInSurface = {x: (projected.x + 1) * frame.rect.width / 2, y: (1 - projected.y) * frame.rect.height / 2};
  return {...structuredClone(frame), visibility: 'planter', presentationRoot: [...selected.position],
    rect: {...frame.rect, rootInSurface},
    cssRect: Object.hasOwn(frame.cssRect, 'rootInSurface') ? {...frame.cssRect, rootInSurface} : {...frame.cssRect}};
}
export function propsOnlyFrameMatches(actual, expected) {
  // Reconstructing the inverse from the reported matrix can differ by ~1e-13
  // from Three's cached inverse. Only the two diagnostic anchor coordinates
  // allow 1e-9 raster pixels of roundoff; every camera/root/extent stays exact.
  const normalized = structuredClone(actual);
  for (const key of ['rect', 'cssRect']) if (Object.hasOwn(expected[key], 'rootInSurface')) {
    if (!['x', 'y'].every(axis => Number.isFinite(actual[key]?.rootInSurface?.[axis]) && Math.abs(actual[key].rootInSurface[axis] - expected[key].rootInSurface[axis]) <= 1e-9)) return false;
    normalized[key].rootInSurface = {...expected[key].rootInSurface};
  }
  return JSON.stringify(normalized) === JSON.stringify(expected);
}


export function createPipGroundingBrowserProbe({createRenderer=createOptionalPipRenderer}={}) {
  let api, renderer, math, lastOptions, held, heldProps, heldFrame, actorOnlyFrame, propsOnlyFrame;
  let lastMetrics, disposed=false, factoryCalled=false, scratch=null, mode='baseline', lights, originalLights;
  const trace=[];let rendered=0, lastTraceAt=-Infinity, traceOmitted=0, tracing=false, lastMoving=null;
  function choose(next) {
    if(disposed||!api)throw Error('A live grounding owner is required');
    if(!['baseline',GROUNDING_RECIPE.id].includes(next))throw Error('Unknown grounding recipe');
    const params=next==='baseline'?originalLights:[GROUNDING_RECIPE.ambient,...GROUNDING_RECIPE.directional];
    lights.forEach((light,i)=>{light.color.setRGB(...params[i].color,math.LinearSRGBColorSpace);light.intensity=params[i].intensity;});
    api.setGroundingRecipe(next);mode=next;return mode;
  }
  function render(mode, isolation=null) {
    if(disposed||!held)throw Error('Hold an actual settled UI/planner pose first');
    if(isolation!==null&&!['pet','planter'].includes(isolation))throw Error('Unknown isolation');
    if(renderer.getClearAlpha()!==0)throw Error('Transparent clear must stay unchanged');
    if(JSON.stringify(api.diagnostics.propInstances)!==heldProps)throw Error('Prop state changed');
    choose(mode);
    if(!api.renderDirect({...held,...(isolation?{visibility:isolation}:{}),forcePausedRedraw:true}))throw Error('Held render failed');
    const actual=api.diagnostics.lastFrame;
    if(isolation==='planter'?!propsOnlyFrameMatches(actual,propsOnlyFrame):JSON.stringify(actual)!==(isolation==='pet'?actorOnlyFrame:heldFrame))throw Error('Held pose/camera/presentation changed');
    return {mode,metrics:{...lastMetrics},rendererInfo:{...renderer.info.render},diagnostics:api.diagnostics};
  }
  return {
    async rendererFactory(options) {
      if(factoryCalled)throw Error('Exactly one renderer lifetime per owner');factoryCalled=true;
      api=await createRenderer({...options,
        rendererFactory({THREE,...native}){math=THREE;renderer=new THREE.WebGLRenderer(native);return renderer;},
        setupLighting(args){
          const cleanup=options.setupLighting(args);
          lights=args.scene.children.filter(o=>o.isAmbientLight||o.isDirectionalLight);
          if(lights.length!==4||!lights[0].isAmbientLight||lights.slice(1).some(o=>!o.isDirectionalLight))throw Error('Pinned light topology changed');
          originalLights=lights.map(l=>({color:l.color.toArray(),intensity:l.intensity}));
          if(JSON.stringify(originalLights)!==JSON.stringify([{color:[.78,.83,.93],intensity:.55},{color:[1,1,1],intensity:1.8},{color:[1,1,1],intensity:.76},{color:[1,1,1],intensity:1.2}]))throw Error('Pinned source light parameters changed');
          return cleanup;
        },
        onFrameMetrics(row){lastMetrics=row;options.onFrameMetrics?.(row);},
      });
      return {...api,get resources(){return api.resources;},get diagnostics(){return api.diagnostics;},
        renderDirect(options){
          if(held)return false;const ok=api.renderDirect(options);
          if(ok){lastOptions=structuredClone(options);rendered++;const now=performance.now();
            if(tracing&&(now-lastTraceAt>=250||options.sample.world.moving!==lastMoving)){
              if(trace.length<32){trace.push({wallMs:now,world:{root:{...options.sample.world.root},heading:options.sample.world.heading,moving:options.sample.world.moving,phase:options.sample.world.phase,feet:Object.fromEntries(Object.entries(options.sample.world.feet).map(([side,f])=>[side,{position:{...f.position},heading:f.heading,planted:f.planted}]))},intention:options.sample.intention,shadow:(()=>{const s=api.diagnostics.contactShadow;return {flatSupport:s.flatSupport,body:s.body,left:s.left,right:s.right,strength:s.strength};})()});lastTraceAt=now;lastMoving=options.sample.world.moving;}else traceOmitted++;
            }
          }return ok;
        },
        dispose(){disposed=true;held=lastOptions=scratch=null;api.dispose();},
      };
    },
    choose,
    beginTrace(){if(tracing||held||disposed)throw Error('One live route trace only');tracing=true;},
    hold({selectedSlotId=null}={}) {
      if(disposed||!lastOptions||held||lastOptions.visibility!=='both')throw Error('One live actor-visible sample required');
      held=structuredClone(lastOptions);heldProps=JSON.stringify(api.diagnostics.propInstances);heldFrame=JSON.stringify(api.diagnostics.lastFrame);
      actorOnlyFrame=JSON.stringify({...api.diagnostics.lastFrame,visibility:'pet'});
      propsOnlyFrame=propsOnlyExpectedFrame(api.diagnostics.lastFrame,api.diagnostics.propInstances,selectedSlotId,math);
      api.setPaused(true);return {sample:structuredClone(held.sample),diagnostics:api.diagnostics};
    },
    render,
    readHeldRows(mode,y,rows=CHUNK_ROWS,isolation=null) {
      if(!Number.isInteger(y)||!Number.isInteger(rows)||y<0||rows<1||rows>CHUNK_ROWS||y+rows>HEIGHT)throw Error('At most 16 in-bounds rows');
      const r=api.resources,diagnosticKnownCPUBytes=r.knownCPUBufferPeakBytes+ENCODED_BACKGROUND_CPU_BYTES+r.boneDataTextureCPUBytesEstimate+SCRATCH_BYTES;
      if(diagnosticKnownCPUBytes>LIMITS.knownCPU)throw Error('Readback cap exceeded');
      scratch??=new Uint8Array(WIDTH*CHUNK_ROWS*4);const gl=renderer.getContext();
      if(gl.getError()!==gl.NO_ERROR)throw Error('Existing GL error');
      try{render(mode,isolation);gl.readPixels(0,y,WIDTH,rows,gl.RGBA,gl.UNSIGNED_BYTE,scratch);}
      finally{if(isolation)render(mode);}
      if(gl.getError()!==gl.NO_ERROR)throw Error('Readback GL error');
      let binary='';for(let i=0;i<WIDTH*rows*4;i++)binary+=String.fromCharCode(scratch[i]);
      return {mode,isolation,y,rows,width:WIDTH,height:HEIGHT,rowOrder:'bottom-up',encoding:'output-encoded premultiplied RGBA8',dataBase64:btoa(binary),diagnosticScratchCPUBytes:SCRATCH_BYTES,diagnosticKnownCPUBytes,qualifiesPerformance:false};
    },
    diagnostics(){return {held:Boolean(held),disposed,mode,recipe:GROUNDING_RECIPE,appliedLights:lights?.map(l=>({color:l.color.toArray(),intensity:l.intensity})),resources:api?.resources,renderer:api?.diagnostics,diagnosticScratchCPUBytes:scratch?SCRATCH_BYTES:0};},
    motion(){return {rendered,trace:structuredClone(trace),traceOmitted,sample:lastOptions?structuredClone(lastOptions.sample):null,clock:'Unmodified real application performance.now active clock',timeScale:1,syntheticPoseInjection:false};},
  };
}

import{pipGroundingRecipe}from'../grounding-recipe.mjs';
import{RENDER_UNITS_TO_CANONICAL}from'../world-scale.mjs';
import{MODEL_CPU_GLB_BYTES,MODEL_CPU_BINARY_BYTES,KNOWN_CPU_BUFFER_PEAK,GARDEN_RASTER}from'../resources.mjs';
/** Optional one-pet + authored-succulent consumer. Disabled by default.
 * Used by the optional inactive Yard visual mode; no saved visit, authoritative clock or server mutation.
 * Frozen direct renderer has separate browser evidence; this integrated mode remains unqualified.
 */
import {installPipAnalyticalCoat,PIP_PRIVATE_GLB_SHA256,PIP_COAT_MATERIAL_NAME} from '../source/pip-analytical-coat.mjs';
import {createAdaptivePoseDriver} from './adaptive-pose-driver.mjs';
import {createPipContactShadow,PIP_CONTACT_SHADOW} from './pip-contact-shadow.mjs';
import {createCalibratedPlanter} from './calibrated-planter.mjs';
import {validateGardenViewport,configureGardenCamera,gardenSurfaceRect,canvasRectToCSS,presentDirectSurface} from './surface-placement.mjs';

/** This bounded actor moves through bones in a stationary Object3D frame.
 * Three caches a SkinnedMesh sphere from its first visible pose; an off-screen
 * entrance would otherwise hide every later on-screen pose. Explicit actor
 * visibility and the fixed garden raster own clipping. Avoid recomputing every
 * skinned vertex each frame just to obtain a bounds check that is unnecessary
 * for this already-admitted single actor. Static props retain normal culling. */
export function configurePipSkinnedVisibility(root){
 let count=0;root.traverse(object=>{if(object.isSkinnedMesh){object.frustumCulled=false;count++;}});return count;
}

export async function createOptionalPipRenderer({enabled=false,loadAssetBytes,loadPlanterAssetBytes,signal,calibration,fragmentHelper,
  setupLighting,admitResources,onResources=()=>{},onFrameMetrics=()=>{},planter=null,actorUnitsPerSource=RENDER_UNITS_TO_CANONICAL,
  presentationMode='copy',directHost=null,rendererFactory=null,groundingRecipe='baseline',
  canvasFactory=()=>document.createElement('canvas'),viewport=null,
  canonicalFoodEnabled=false,getBaseResourceUsage=null,loadCanonicalFoodAssetBytes=null}={}) {
  if(enabled!==true)return null;
  const grounding=pipGroundingRecipe(groundingRecipe);
  if(![12,16].includes(actorUnitsPerSource))throw Error('Unqualified actor world scale');
  if(!['copy','direct'].includes(presentationMode))throw Error('Unknown presentation mode');
  if(presentationMode==='direct'&&!directHost?.appendChild)throw Error('Direct presentation host required');
  if(typeof loadAssetBytes!=='function'||typeof setupLighting!=='function'||typeof admitResources!=='function')throw Error('Explicit asset, lighting and separate resource owners required');
  if(!planter||typeof loadPlanterAssetBytes!=='function')throw Error('Admitted authored planter required');
  const owner='private-one-pet-WebGL-prototype',geometries=new Set(),materials=new Set(),skeletons=new Set(),attributes=new Set();
  let THREE,GLTFLoader,bytes,gltf,proxy,contactShadow,propGroup,propRoots=[],presentationProp,scene,camera,direction,pose,restoreMaterial,canvas,renderer,cleanupLighting;
  let disposed=false,paused=false,contextLost=false,size=null,lastFrame=null,gardenViewport=null;
  let foodDomainPromise=null,foodModulePromise=null,foodResources=null,foodMeasurements=null,foodBinding=null,foodController=null,foodSnapshot=null,foodOwnerKey=null;
  let foodEpoch=0,foodRequest=0,foodSerial=Promise.resolve(),foodRetirement=null,foodRestartRequired=false,foodPending=0;
  let foodSelection={available:false,state:null,reason:'CANONICAL_FOOD_DISABLED'};
  const foodUnavailable=reason=>({available:false,state:null,reason});
  function foodDiagnostics(){return {enabled:canonicalFoodEnabled===true,hasOwner:foodOwnerKey!==null,ownerKeyType:foodOwnerKey===null?null:typeof foodOwnerKey,ownerEpoch:foodEpoch,pending:foodPending,
    restartRequired:foodRestartRequired,selection:{...foodSelection},binding:foodBinding?.diagnostics??null,
    resources:foodMeasurements,ledger:foodResources?.snapshot()??null};}
  function foodChanged(selection){foodSelection=selection;if(!disposed)onResources({event:'canonical-food-changed',owner,selection:{...selection},requiresFreshRender:true});return {...selection};}
  function retireFood(reason){foodEpoch++;foodController?.abort();foodController=null;foodBinding?.dispose();foodBinding=null;foodSelection=foodUnavailable(reason);}
  function abortFood(){retireFood('CANONICAL_FOOD_ABORTED');foodSnapshot=null;foodChanged(foodSelection);}
  async function reconcileFood(request){
    if(disposed||request!==foodRequest)return foodUnavailable('CANONICAL_FOOD_SUPERSEDED');
    if(canonicalFoodEnabled!==true)return foodUnavailable('CANONICAL_FOOD_DISABLED');
    if(foodRestartRequired||contextLost)return foodUnavailable('CANONICAL_FOOD_CONTEXT_RESTART_REQUIRED');
    if(foodOwnerKey===null||foodSnapshot?.yardRuntime?.foodLocationCapabilities?.enabled!==true)return {...foodSelection};
    const epoch=foodEpoch;
    const current=()=>!disposed&&!signal?.aborted&&epoch===foodEpoch&&!foodRestartRequired&&!contextLost;
    try{
      const domain=await(foodDomainPromise??=import('../../../../../game-logic/yard-v2/canonical-food-contract.mjs'));
      if(!current())return foodUnavailable('CANONICAL_FOOD_SUPERSEDED');
      const selected=domain.selectCanonicalFoodState(foodSnapshot);
      if(!selected.available){foodBinding?.hide();return foodChanged(selected);}
      if(!foodBinding){
        if(typeof getBaseResourceUsage!=='function'||typeof loadCanonicalFoodAssetBytes!=='function')throw Error('Explicit canonical food resource and byte owners required');
        const module=await(foodModulePromise??=import('./calibrated-food.mjs'));
        if(!current())return foodUnavailable('CANONICAL_FOOD_SUPERSEDED');
        // Recheck after the import. A disabled/occupied newer snapshot must not
        // start an asset load because an earlier snapshot had been available.
        const now=domain.selectCanonicalFoodState(foodSnapshot);
        if(!now.available)return foodChanged(now);
        foodResources??=module.createCanonicalFoodResourceOwner({getBaseUsage:()=>getBaseResourceUsage()});
        const controller=new AbortController();foodController=controller;
        const made=await module.createCalibratedFood(THREE,{enabled:true,descriptor:domain.CANONICAL_FOOD_CONTRACT,
          loader:new GLTFLoader(),resourceOwner:foodResources,signal:controller.signal,
          loadAssetBytes:()=>loadCanonicalFoodAssetBytes(module.canonicalFoodAssetURL(),controller.signal)});
        if(!current()||controller.signal.aborted){made.dispose();return foodUnavailable('CANONICAL_FOOD_SUPERSEDED');}
        foodBinding=made;foodMeasurements=made.resources;scene.add(made.root);
      }
      // Same account/session updates select the newest snapshot on the one
      // parsed owner, including when a newer snapshot arrived during loading.
      return foodChanged(foodBinding.selectSnapshot(foodSnapshot));
    }catch(error){
      if(!current()||error?.name==='AbortError')return foodUnavailable('CANONICAL_FOOD_SUPERSEDED');
      foodBinding?.hide();return foodChanged({...foodUnavailable('CANONICAL_FOOD_UNAVAILABLE'),error:String(error?.message||error)});
    }
  }
  function setCanonicalFoodSnapshot(snapshot,{ownerKey}={}){
    if(disposed)return Promise.resolve(foodUnavailable('CANONICAL_FOOD_DISPOSED'));
    if(canonicalFoodEnabled!==true)return Promise.resolve(foodUnavailable('CANONICAL_FOOD_DISABLED'));
    if(signal?.aborted)return Promise.resolve(foodUnavailable('CANONICAL_FOOD_ABORTED'));
    // The scene owner supplies an opaque lifetime token (commonly a numeric
    // epoch or object). Preserve identity: 1, '1' and distinct objects differ.
    const validKey=ownerKey!==null&&(typeof ownerKey==='object'||typeof ownerKey==='symbol'
      ||typeof ownerKey==='string'&&ownerKey.length>0||typeof ownerKey==='number'&&Number.isFinite(ownerKey));
    const key=validKey?ownerKey:null;
    if(key!==foodOwnerKey){retireFood('CANONICAL_FOOD_OWNER_CHANGED');foodOwnerKey=key;}
    foodSnapshot=snapshot;const request=++foodRequest;
    // Hide synchronously, before any import/queue yield can retain stale food.
    foodBinding?.hide();
    if(key===null||snapshot?.yardRuntime?.foodLocationCapabilities?.enabled!==true){
      retireFood(key===null?'CANONICAL_FOOD_OWNER_REQUIRED':'CANONICAL_FOOD_DISABLED');
      return Promise.resolve(foodChanged(foodSelection));
    }
    foodChanged(foodUnavailable('CANONICAL_FOOD_LOADING'));
    foodPending++;
    const task=foodSerial.then(()=>reconcileFood(request));
    // Serialize replacements, so canceled loads must actually settle before a
    // new lease starts. Retired uploaded GPU remains in the shared ledger.
    foodSerial=task.catch(()=>{}).finally(()=>{foodPending--;});
    return task;
  }
  const counts={renders:0,copies:0,directPresentations:0,resizes:0,viewportUpdates:0,contextLosses:0,contextRestorations:0,disposals:0};
  function inventory(o){if(o.geometry){geometries.add(o.geometry);for(const a of Object.values(o.geometry.attributes))attributes.add(a);if(o.geometry.index)attributes.add(o.geometry.index);}
    if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.skeleton)skeletons.add(o.skeleton);}
  function dispose(){
    if(disposed)return foodRetirement;disposed=true;counts.disposals++;signal?.removeEventListener('abort',abortFood);
    // The food owner disposes its own meshes/materials before the base scene
    // inventory sees them, preventing shared materials from being freed twice.
    retireFood('CANONICAL_FOOD_DISPOSED');foodSnapshot=null;scene?.traverse(inventory);gltf?.scene.traverse(inventory);proxy?.root.traverse(inventory);
    pose?.dispose();restoreMaterial?.();cleanupLighting?.();
    for(const s of skeletons)s.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    canvas?.removeEventListener('webglcontextlost',lose);canvas?.removeEventListener('webglcontextrestored',restore);
    renderer?.dispose();renderer?.forceContextLoss();canvas?.remove();if(canvas)canvas.width=canvas.height=0;
    scene?.clear();geometries.clear();materials.clear();skeletons.clear();attributes.clear();
    bytes=null;gltf=null;proxy=null;contactShadow=null;propGroup=null;propRoots=[];presentationProp=null;pose=null;renderer=null;restoreMaterial=null;cleanupLighting=null;onResources({event:'disposed',owner});
    // The renderer has now retired its context. Late imports/parses still own
    // their reservations until their serial task settles and cleans them up.
    foodRetirement=foodSerial.finally(()=>foodResources?.releaseRetiredAfterRendererDisposal());return foodRetirement;
  }
  function lose(event){event.preventDefault();contextLost=true;counts.contextLosses++;if(canonicalFoodEnabled===true){foodBinding?.contextLost();retireFood('CANONICAL_FOOD_CONTEXT_LOST');}onResources({event:'context-lost',owner});}
  function restore(){
    if(canonicalFoodEnabled===true){
      // Full old+new base geometry/bones plus surfaces and food would exceed
      // the unchanged 12 MiB cap. Stay blocked until the host replaces this
      // entire renderer, awaiting dispose() before creating its successor.
      if(foodRestartRequired||disposed)return;contextLost=true;foodRestartRequired=true;counts.contextRestorations++;
      foodChanged(foodUnavailable('CANONICAL_FOOD_CONTEXT_RESTART_REQUIRED'));
      onResources({event:'canonical-food-context-restart-required',owner,requiresFullRendererRetirement:true});return;
    }
    contextLost=false;counts.contextRestorations++;onResources({event:'context-restored',owner,requiresBrowserAcceptance:true,requiresFreshRender:true});
  }
  function requestSize(){
    const bw=GARDEN_RASTER.width,bh=GARDEN_RASTER.height,pixels=GARDEN_RASTER.pixels;
    const geometryBytes=[...attributes].reduce((n,a)=>n+a.array.byteLength,0);
    // Three0.186.1 Skeleton.computeBoneTexture: padded square RGBA32F texture.
    const boneTextureBytes=[...skeletons].reduce((n,s)=>{const side=Math.max(4,Math.ceil(Math.sqrt(s.bones.length*4)/4)*4);return n+side*side*16;},0);
    const estimate={stage:'before-drawing-buffer-allocation',owner,separateFromYard64MiBRGBALedger:true,
      rasterPolicy:'garden-reference-grid-v1',backingWidth:bw,backingHeight:bh,
      cpuGLBBytes:MODEL_CPU_GLB_BYTES,cpuParsedBinaryBufferBytes:MODEL_CPU_BINARY_BYTES,cpuBufferViewCopiesBytes:MODEL_CPU_BINARY_BYTES,knownCPUBufferPeakBytes:KNOWN_CPU_BUFFER_PEAK,geometryGPUBufferBytes:geometryBytes,
      contactShadowGeometryCPUBytes:PIP_CONTACT_SHADOW.geometryCPUBytes,contactShadowPendingCPUBytes:PIP_CONTACT_SHADOW.pendingCPUBytes,contactShadowGeometryGPUBytes:PIP_CONTACT_SHADOW.geometryGPUBytes,contactShadowImageTextureBytes:PIP_CONTACT_SHADOW.imageTextureBytes,contactShadowDrawPrimitives:PIP_CONTACT_SHADOW.drawPrimitives,
      assetImageTextureBytes:0,uniqueSkeletons:skeletons.size,boneDataTextureGPUBytesEstimate:boneTextureBytes,boneDataTextureCPUBytesEstimate:boneTextureBytes,
      // Reserve old+new buffers even at initial admission, including a possible
      // context restoration. Ordinary layout changes never resize this raster.
      drawingBufferColorBytes:pixels*4,depthStencilEstimatedBytes:pixels*4,resizeDrawingBufferPeakEstimatedBytes:pixels*16,
      antialias:false,shadowMaps:false,driverOverheadKnown:false,exactGPUAllocationKnown:false,
      presentationMode,compositorSurfaceBytesEstimate:presentationMode==='direct'?pixels*4:0,compositorResizePeakBytesEstimate:presentationMode==='direct'?pixels*8:0,
      ownedRGBASurfacePeakBytes:pixels*(presentationMode==='direct'?16:8),
      compositorAllocationKnown:false,swapBufferCountKnown:false,
      propMode:proxy?'same-depth-space authored terracotta succulent T2':'awaiting authored planter',committedPropCapacity:2,ghostPropCapacity:1,propInstanceCapacity:3,
      propBuffersShared:true,maxPropDrawPrimitives:3*(proxy.asset.drawPrimitives+proxy.asset.shadowDrawPrimitives),propInstanceObjectOverheadKnown:false,poseAllocations:'Temporary matrices/vectors per pose; not pooled.'};
    if(geometryBytes>8*1024*1024||admitResources(estimate)!==true)throw Error('Separate prototype resource admission rejected');
    return{bw,bh,pixels,estimate};
  }
  function resize({viewport:nextViewport=gardenViewport??viewport}={}){
    if(disposed)return false;const next=validateGardenViewport(nextViewport);
    if(gardenViewport&&JSON.stringify(next)===JSON.stringify(gardenViewport))return false;
    // Anchor/density changes require a different calibrated location owner;
    // screen layout changes only its presentation, never this sampling grid.
    if(gardenViewport&&(next.pixelsPerRenderUnit!==gardenViewport.pixelsPerRenderUnit||JSON.stringify(next.anchorRender)!==JSON.stringify(gardenViewport.anchorRender)||JSON.stringify(next.anchorRaster)!==JSON.stringify(gardenViewport.anchorRaster)))throw Error('Garden calibration cannot change during renderer lifetime');
    if(!size){const allocation=requestSize();renderer.setPixelRatio(1);renderer.setSize(allocation.bw,allocation.bh,false);size=allocation;counts.resizes++;
      configureGardenCamera(camera,direction,next);onResources(allocation.estimate);}
    gardenViewport=next;counts.viewportUpdates++;return true;
  }
  try{
    signal?.throwIfAborted();
    if(admitResources({stage:'before-import-and-load',owner,separateFromYard64MiBRGBALedger:true,cpuGLBBytes:MODEL_CPU_GLB_BYTES,
      cpuParsedBinaryBufferBytes:MODEL_CPU_BINARY_BYTES,cpuBufferViewCopiesBytes:MODEL_CPU_BINARY_BYTES,knownCPUBufferPeakBytes:KNOWN_CPU_BUFFER_PEAK,contactShadowGeometryCPUBytes:PIP_CONTACT_SHADOW.geometryCPUBytes,contactShadowPendingCPUBytes:PIP_CONTACT_SHADOW.pendingCPUBytes,engineAndLoaderObjectOverheadKnown:false})!==true)throw Error('Prototype preload admission rejected');
    let module;[THREE,module]=await Promise.all([import('../vendor/three/build/three.module.js'),import('../vendor/three/addons/loaders/GLTFLoader.js')]);GLTFLoader=module.GLTFLoader;
    signal?.throwIfAborted();
    if(THREE.REVISION!=='186')throw Error('Unqualified Three revision');
    bytes=await loadAssetBytes();signal?.throwIfAborted();if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==3972384)throw Error('Expected pinned GLB ArrayBuffer');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==PIP_PRIVATE_GLB_SHA256)throw Error('Private Pip asset identity mismatch');
    signal?.throwIfAborted();
    gltf=await new module.GLTFLoader().parseAsync(bytes,'');signal?.throwIfAborted();if((gltf.parser.json.images?.length??0)!==0)throw Error('Asset image decoder not admitted');
    configurePipSkinnedVisibility(gltf.scene);
    gltf.scene.traverse(inventory);proxy=await createCalibratedPlanter(THREE,{...planter,loader:new module.GLTFLoader(),loadAssetBytes:loadPlanterAssetBytes,signal});signal?.throwIfAborted();proxy.root.traverse(inventory);
    const material=[...materials].find(m=>m.name===PIP_COAT_MATERIAL_NAME);if(!material)throw Error('Pinned coat material missing');
    restoreMaterial=installPipAnalyticalCoat(material,{glbSha256:hash,fragmentHelper});
    scene=new THREE.Scene();const actorFrame=new THREE.Group();actorFrame.name='Pip uniform world-scale frame';actorFrame.scale.setScalar(actorUnitsPerSource/RENDER_UNITS_TO_CANONICAL);actorFrame.add(gltf.scene);scene.add(actorFrame);
    // Static Object3D clones share the loaded T2 geometry, materials and contact
    // lobe. No second GLB parse, typed array, texture or shadow buffer exists.
    propRoots=[proxy.root,proxy.root.clone(true),proxy.root.clone(true)];propGroup=new THREE.Group();propGroup.name='Bounded shared T2 instances';
    propRoots.forEach((root,i)=>{root.visible=i===0;root.userData.canonicalSlotId=null;root.userData.ghost=i===2;propGroup.add(root);});presentationProp=proxy.root;scene.add(propGroup);scene.updateMatrixWorld(true);
    contactShadow=createPipContactShadow(THREE,{actorUnitsPerSource,groundingRecipe:grounding.id});scene.add(contactShadow.mesh);contactShadow.mesh.traverse(inventory);
    pose=createAdaptivePoseDriver(THREE,gltf,calibration,{unitsPerSource:actorUnitsPerSource,sourceFrame:actorFrame});camera=new THREE.OrthographicCamera();direction=new THREE.Vector3(5.66,9.799775507632814,8);
    validateGardenViewport(viewport);requestSize();canvas=canvasFactory();
    const rendererOptions={canvas,alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:false};
    // Injectable only for Node source qualification; browser uses actual Three.
    renderer=rendererFactory?rendererFactory({THREE,...rendererOptions}):new THREE.WebGLRenderer(rendererOptions);
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    cleanupLighting=setupLighting({THREE,scene,renderer});renderer.shadowMap.enabled=false;if(scene.environment||scene.background)throw Error('Unqualified environment/background resource');
    scene.traverse(inventory);canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);resize();
    if(canonicalFoodEnabled===true){signal?.addEventListener('abort',abortFood,{once:true});signal?.throwIfAborted();}
  }catch(error){dispose();throw error;}
  function renderFrame(mode,ctx,{sample,point,alpha=1,presentation=null,forcePausedRedraw=false,visibility='both'}={}){
    if(disposed||(paused&&!forcePausedRedraw)||contextLost)return false;
    if(mode!==presentationMode)throw Error('Presentation mode is fixed for this renderer lifetime');
    if(!['both','pet','planter','empty'].includes(visibility))throw Error('Unknown diagnostic visibility');
    if(mode==='copy'&&!ctx?.drawImage)throw Error('Canvas2D context required');
    const t0=performance.now(),{rootGLTF}=pose.apply(sample),itemOnly=visibility==='planter'||visibility==='empty';
    // Visibility selects the diagnostic anchor only. Camera and raster remain
    // garden-aligned even while either object travels or changes heading.
    contactShadow.update(sample);
    const presentationRoot=itemOnly?presentationProp.position:rootGLTF;
    const rect=gardenSurfaceRect(gardenViewport,presentationRoot,camera),cssRect=presentation?canvasRectToCSS(rect,presentation):rect;
    // A direct surface must be mounted before submitting its first frame.
    if(mode==='direct')presentDirectSurface(canvas,directHost,cssRect,alpha);
    const t1=performance.now(),petVisible=gltf.scene.visible,planterVisible=propGroup.visible;
    gltf.scene.visible=visibility==='both'||visibility==='pet';propGroup.visible=visibility==='both'||visibility==='planter';
    const shadowVisible=contactShadow.mesh.visible;contactShadow.mesh.visible=shadowVisible&&gltf.scene.visible;
    try{renderer.render(scene,camera);}finally{gltf.scene.visible=petVisible;propGroup.visible=planterVisible;contactShadow.mesh.visible=shadowVisible;}
    const t2=performance.now();
    counts.renders++;
    if(mode==='copy'){
      // Whole drawImage call can include GPU synchronization; it is not an
      // isolated copy benchmark. No readPixels, bitmap conversion or new canvas.
      ctx.save();try{ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));ctx.drawImage(canvas,rect.x,rect.y,rect.width,rect.height);}finally{ctx.restore();}
      counts.copies++;
    }else counts.directPresentations++;
    const t3=performance.now();lastFrame={mode,visibility,rootGLTF:rootGLTF.toArray(),presentationRoot:presentationRoot.toArray(),point:{...point},rect,cssRect,alpha,rasterPolicy:'garden-reference-grid-v1',cameraWorld:camera.matrixWorld.toArray(),cameraProjection:camera.projectionMatrix.toArray()};
    onFrameMetrics({mode,poseCameraAndPresentationMs:t1-t0,renderSubmitMs:t2-t1,drawImageCallMs:mode==='copy'?t3-t2:null,totalCallMs:t3-t0,
      drawImageIncludesPossibleGPUSynchronization:mode==='copy',GPUCompletionMeasured:false,compositorCompletionMeasured:false,backing:[size.bw,size.bh]});return true;
  }
  function setCanonicalPlacements(records,{ghost=null,selectedSlotId=null}={}){
    if(disposed)return false;
    const valid=r=>typeof r?.slotId==='string'&&r.slotId.length>0&&Number.isFinite(r.x)&&Number.isFinite(r.y);
    if(!Array.isArray(records)||records.length>2||!records.every(valid)||new Set(records.map(r=>r.slotId)).size!==records.length||ghost&&!valid(ghost))throw Error('Bounded canonical T2 placements required');
    // Validate the complete batch before changing any visible root. The caller
    // retains placement validity/commit ownership; this pool owns rendering.
    for(let i=0;i<3;i++){const root=propRoots[i],record=i===2?ghost:records[i];root.visible=Boolean(record)&&(i===2||record.slotId!==ghost?.slotId);root.userData.canonicalSlotId=record?.slotId??null;
      if(record)root.position.set(record.x/12,0,-record.y/12);root.updateMatrixWorld(true);}
    presentationProp=ghost?propRoots[2]:propRoots.find(root=>root.visible&&root.userData.canonicalSlotId===selectedSlotId)??propRoots.find(root=>root.visible)??proxy.root;
    return true;
  }
  return{renderAndCopy:(ctx,options)=>renderFrame('copy',ctx,options),renderDirect:options=>renderFrame('direct',null,options),resize,dispose,setCanonicalPlacements,setCanonicalFoodSnapshot,
    setPaused(v){paused=Boolean(v);},setPlanterPlacement(p){if(disposed)return;if(!proxy)throw Error('No calibrated planter admitted');proxy.move(p);propRoots.forEach((root,i)=>{root.visible=i===0;root.userData.canonicalSlotId=null;});presentationProp=proxy.root;},get resources(){return size?.estimate;},
    get diagnostics(){return{mode:presentationMode,groundingRecipe:grounding.id,actorUnitsPerSource,actorModelScale:actorUnitsPerSource/RENDER_UNITS_TO_CANONICAL,disposed,paused,contextLost,mounted:Boolean(canvas?.parentNode),...counts,canonicalFood:foodDiagnostics(),contactShadow:contactShadow?.diagnostics??null,propInstances:propRoots.map(root=>({slotId:root.userData.canonicalSlotId,ghost:root.userData.ghost,visible:root.visible,position:root.position.toArray()})),lastFrame:structuredClone(lastFrame)};},
    qualification:'Optional integrated clean-location candidate; integrated browser appearance and performance remain unqualified.'};
}

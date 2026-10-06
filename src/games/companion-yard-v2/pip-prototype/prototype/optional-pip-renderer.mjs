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

export async function createOptionalPipRenderer({enabled=false,loadAssetBytes,loadPlanterAssetBytes,signal,calibration,fragmentHelper,
  setupLighting,admitResources,onResources=()=>{},onFrameMetrics=()=>{},planter=null,actorUnitsPerSource=RENDER_UNITS_TO_CANONICAL,
  presentationMode='copy',directHost=null,rendererFactory=null,
  canvasFactory=()=>document.createElement('canvas'),viewport=null}={}) {
  if(enabled!==true)return null;
  if(![12,16].includes(actorUnitsPerSource))throw Error('Unqualified actor world scale');
  if(!['copy','direct'].includes(presentationMode))throw Error('Unknown presentation mode');
  if(presentationMode==='direct'&&!directHost?.appendChild)throw Error('Direct presentation host required');
  if(typeof loadAssetBytes!=='function'||typeof setupLighting!=='function'||typeof admitResources!=='function')throw Error('Explicit asset, lighting and separate resource owners required');
  if(!planter||typeof loadPlanterAssetBytes!=='function')throw Error('Admitted authored planter required');
  const owner='private-one-pet-WebGL-prototype',geometries=new Set(),materials=new Set(),skeletons=new Set(),attributes=new Set();
  let THREE,bytes,gltf,proxy,contactShadow,propGroup,propRoots=[],presentationProp,scene,camera,direction,pose,restoreMaterial,canvas,renderer,cleanupLighting;
  let disposed=false,paused=false,contextLost=false,size=null,lastFrame=null,gardenViewport=null;
  const counts={renders:0,copies:0,directPresentations:0,resizes:0,viewportUpdates:0,contextLosses:0,contextRestorations:0,disposals:0};
  function inventory(o){if(o.geometry){geometries.add(o.geometry);for(const a of Object.values(o.geometry.attributes))attributes.add(a);if(o.geometry.index)attributes.add(o.geometry.index);}
    if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.skeleton)skeletons.add(o.skeleton);}
  function dispose(){
    if(disposed)return;disposed=true;counts.disposals++;scene?.traverse(inventory);gltf?.scene.traverse(inventory);proxy?.root.traverse(inventory);
    pose?.dispose();restoreMaterial?.();cleanupLighting?.();
    for(const s of skeletons)s.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    canvas?.removeEventListener('webglcontextlost',lose);canvas?.removeEventListener('webglcontextrestored',restore);
    renderer?.dispose();renderer?.forceContextLoss();canvas?.remove();if(canvas)canvas.width=canvas.height=0;
    scene?.clear();geometries.clear();materials.clear();skeletons.clear();attributes.clear();
    bytes=null;gltf=null;proxy=null;contactShadow=null;propGroup=null;propRoots=[];presentationProp=null;pose=null;renderer=null;restoreMaterial=null;cleanupLighting=null;onResources({event:'disposed',owner});
  }
  function lose(event){event.preventDefault();contextLost=true;counts.contextLosses++;onResources({event:'context-lost',owner});}
  function restore(){contextLost=false;counts.contextRestorations++;onResources({event:'context-restored',owner,requiresBrowserAcceptance:true,requiresFreshRender:true});}
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
    let module;[THREE,module]=await Promise.all([import('../vendor/three/build/three.module.js'),import('../vendor/three/addons/loaders/GLTFLoader.js')]);
    signal?.throwIfAborted();
    if(THREE.REVISION!=='186')throw Error('Unqualified Three revision');
    bytes=await loadAssetBytes();signal?.throwIfAborted();if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==3972384)throw Error('Expected pinned GLB ArrayBuffer');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==PIP_PRIVATE_GLB_SHA256)throw Error('Private Pip asset identity mismatch');
    signal?.throwIfAborted();
    gltf=await new module.GLTFLoader().parseAsync(bytes,'');signal?.throwIfAborted();if((gltf.parser.json.images?.length??0)!==0)throw Error('Asset image decoder not admitted');
    gltf.scene.traverse(inventory);proxy=await createCalibratedPlanter(THREE,{...planter,loader:new module.GLTFLoader(),loadAssetBytes:loadPlanterAssetBytes,signal});signal?.throwIfAborted();proxy.root.traverse(inventory);
    const material=[...materials].find(m=>m.name===PIP_COAT_MATERIAL_NAME);if(!material)throw Error('Pinned coat material missing');
    restoreMaterial=installPipAnalyticalCoat(material,{glbSha256:hash,fragmentHelper});
    scene=new THREE.Scene();const actorFrame=new THREE.Group();actorFrame.name='Pip uniform world-scale frame';actorFrame.scale.setScalar(actorUnitsPerSource/RENDER_UNITS_TO_CANONICAL);actorFrame.add(gltf.scene);scene.add(actorFrame);
    // Static Object3D clones share the loaded T2 geometry, materials and contact
    // lobe. No second GLB parse, typed array, texture or shadow buffer exists.
    propRoots=[proxy.root,proxy.root.clone(true),proxy.root.clone(true)];propGroup=new THREE.Group();propGroup.name='Bounded shared T2 instances';
    propRoots.forEach((root,i)=>{root.visible=i===0;root.userData.canonicalSlotId=null;root.userData.ghost=i===2;propGroup.add(root);});presentationProp=proxy.root;scene.add(propGroup);scene.updateMatrixWorld(true);
    contactShadow=createPipContactShadow(THREE,{actorUnitsPerSource});scene.add(contactShadow.mesh);contactShadow.mesh.traverse(inventory);
    pose=createAdaptivePoseDriver(THREE,gltf,calibration,{unitsPerSource:actorUnitsPerSource,sourceFrame:actorFrame});camera=new THREE.OrthographicCamera();direction=new THREE.Vector3(5.66,9.799775507632814,8);
    validateGardenViewport(viewport);requestSize();canvas=canvasFactory();
    const rendererOptions={canvas,alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:false};
    // Injectable only for Node source qualification; browser uses actual Three.
    renderer=rendererFactory?rendererFactory({THREE,...rendererOptions}):new THREE.WebGLRenderer(rendererOptions);
    renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    cleanupLighting=setupLighting({THREE,scene,renderer});renderer.shadowMap.enabled=false;if(scene.environment||scene.background)throw Error('Unqualified environment/background resource');
    scene.traverse(inventory);canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);resize();
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
  return{renderAndCopy:(ctx,options)=>renderFrame('copy',ctx,options),renderDirect:options=>renderFrame('direct',null,options),resize,dispose,setCanonicalPlacements,
    setPaused(v){paused=Boolean(v);},setPlanterPlacement(p){if(disposed)return;if(!proxy)throw Error('No calibrated planter admitted');proxy.move(p);propRoots.forEach((root,i)=>{root.visible=i===0;root.userData.canonicalSlotId=null;});presentationProp=proxy.root;},get resources(){return size?.estimate;},
    get diagnostics(){return{mode:presentationMode,actorUnitsPerSource,actorModelScale:actorUnitsPerSource/RENDER_UNITS_TO_CANONICAL,disposed,paused,contextLost,mounted:Boolean(canvas?.parentNode),...counts,contactShadow:contactShadow?.diagnostics??null,propInstances:propRoots.map(root=>({slotId:root.userData.canonicalSlotId,ghost:root.userData.ghost,visible:root.visible,position:root.position.toArray()})),lastFrame:structuredClone(lastFrame)};},
    qualification:'Optional integrated clean-location candidate; integrated browser appearance and performance remain unqualified.'};
}

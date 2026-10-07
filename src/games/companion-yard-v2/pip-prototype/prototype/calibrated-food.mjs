import {LIMITS} from '../resources.mjs';
import {CANONICAL_FOOD_CONTRACT,validateCanonicalFoodDescriptor,selectCanonicalFoodState} from '../../../../../game-logic/yard-v2/canonical-food-contract.mjs';

/** Inactive, read-only R2 food owner. No scene registration, stock or server calls.
 * Source geometry remains in render units: canonical XYZ maps to (X,Z,-Y)/12.
 * The host owns lighting, redraw and context events. No new surface or texture.
 */
export const FOOD_ASSET_R2=Object.freeze({
  id:'yard-food-source-r2/20261006',sha256:'ed618ed41d65e5770eefc241e7b85db9b78a1502de2ad15aa53e3b74bd824c66',
  file:'yard-food-source-r2.glb',glbBytes:251996,
  binaryBufferBytes:240516,bufferViewCopiesBytes:240516,
  // Include the SHA result (32) and GLTFLoader's header slice (4), even though
  // those short-lived buffers need not coexist with all decoded geometry.
  validationScratchBytes:36,knownCPUBufferPeakBytes:733064,geometryGPUBufferBytes:240516,
  contextRestoreGPUBufferPeakBytes:481032,sourceMeshes:6,drawPrimitives:11,
  geometries:11,materials:10,attributes:32,triangles:13190,imageTextureBytes:0,
  sourceBlendSha256:'4d075964623c6d5f6c5537af6d845b8fe58a9df9a6f0d100f0caf4f9cd8a2fd5',
  provenance:'New reference-guided reconstruction; R2 changes only bonito geometry and its two material colors.',
  qualification:'Native source views inspected; runtime composition, ground contact and art acceptance pending.'
});
const stateGroups=Object.freeze({empty:['BowlVessel'],kibble:['BowlVessel','KibbleContents'],
  berry_plate:['BerryPlateVessel','BerryContents'],bonito_bowl:['BowlVessel','BonitoContents']});
const rootNames=['BowlVessel','BerryPlateVessel','KibbleContents','BerryContents','BonitoContents'];
const resourceOwners=new WeakSet();
const quantity=n=>Number.isSafeInteger(n)&&n>=0;

/** Bundled only through this optional module; never copied from public/.
 * The host can instead supply its own byte loader, with the same identity gate.
 */
export function canonicalFoodAssetURL(assetId=FOOD_ASSET_R2.id) {
  if(assetId!==FOOD_ASSET_R2.id)throw Error('Unknown canonical food asset identity');
  return new URL('../assets/food-r2/yard-food-source-r2.glb',import.meta.url);
}

/** One shared ledger per host renderer, including its existing owned resources.
 * Reserve before loading. Retired GPU estimates remain charged until the host
 * confirms renderer disposal; dispose events alone do not prove driver release.
 */
export function createCanonicalFoodResourceOwner({getBaseUsage}={}) {
  if(typeof getBaseUsage!=='function')throw Error('Explicit current host resource usage required');
  const reservations=new Map();let nextId=0,visibleOwner=null;
  const peak={rgba:0,knownCPU:0,estimatedGPU:0};
  function usage(extra=null) {
    const base=getBaseUsage();
    if(!base||!['rgba','knownCPU','estimatedGPU'].every(k=>quantity(base[k])))throw Error('Invalid host resource usage');
    const total={...base};
    for(const row of [...reservations.values(),...(extra?[extra]:[])]){
      total.knownCPU+=row.knownCPU;total.estimatedGPU+=row.estimatedGPU;
    }
    return {base:{rgba:base.rgba,knownCPU:base.knownCPU,estimatedGPU:base.estimatedGPU},total};
  }
  function admit(extra) {
    const u=usage(extra);
    if(!['rgba','knownCPU','estimatedGPU'].every(k=>quantity(u.total[k])&&u.total[k]<=LIMITS[k]))throw Error('Canonical food resource cap exceeded');
    for(const k of Object.keys(peak))peak[k]=Math.max(peak[k],u.total[k]);
    return u;
  }
  const owner={
    reserve() {
      const row={id:++nextId,knownCPU:FOOD_ASSET_R2.knownCPUBufferPeakBytes,
        estimatedGPU:FOOD_ASSET_R2.contextRestoreGPUBufferPeakBytes,retired:false};
      admit(row);reservations.set(row.id,row);let released=false;
      return {
        assertFits(){if(released)throw Error('Food reservation retired');admit();},
        claimVisible(){if(released||visibleOwner!==null&&visibleOwner!==row.id)return false;admit();visibleOwner=row.id;return true;},
        hide(){if(visibleOwner===row.id)visibleOwner=null;},
        retire({possiblyUploaded=false}={}) {
          if(released)return;released=true;if(visibleOwner===row.id)visibleOwner=null;
          if(possiblyUploaded){row.knownCPU=0;row.retired=true;}
          else reservations.delete(row.id);
        }
      };
    },
    releaseRetiredAfterRendererDisposal() {
      // Call only after the owning renderer is disposed / its context retired.
      for(const [id,row] of reservations)if(row.retired)reservations.delete(id);
    },
    snapshot(){return {...usage(),peak:{...peak},limits:{rgba:LIMITS.rgba,knownCPU:LIMITS.knownCPU,estimatedGPU:LIMITS.estimatedGPU},
      loadingOrLiveOwners:[...reservations.values()].filter(r=>!r.retired).length,
      retiredOwners:[...reservations.values()].filter(r=>r.retired).length,visibleOwners:visibleOwner===null?0:1,
      rgbaAdded:0,driverAllocationKnown:false,physicalGPUReleaseKnown:false};}
  };
  resourceOwners.add(owner);return owner;
}

function inventory(root) {
  const geometries=new Set(),materials=new Set(),attributes=new Set(),cpuBuffers=new Set();let triangles=0,drawPrimitives=0;
  root?.traverse(o=>{
    if(o.geometry){geometries.add(o.geometry);for(const a of [...Object.values(o.geometry.attributes),o.geometry.index].filter(Boolean)){
      attributes.add(a);cpuBuffers.add(a.array.buffer);
    }}
    for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);
    if(o.isMesh){drawPrimitives++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}
  });
  return {geometries,materials,attributes,cpuBuffers,triangles,drawPrimitives};
}
function releaseScene(root) {
  if(!root)return;
  root.visible=false;root.removeFromParent();
  const owned=inventory(root);
  for(const g of owned.geometries)g.dispose();
  for(const m of owned.materials)m.dispose();
  root.clear();
}
async function validateLoaded(THREE,gltf,bytes) {
  const json=gltf.parser.json,root=gltf.scene,owned=inventory(root);
  if((json.images?.length??0)||(json.textures?.length??0)||(json.animations?.length??0)||(json.skins?.length??0)
    ||json.meshes?.length!==6||json.materials?.length!==10||json.buffers?.length!==1||json.buffers[0].uri
    ||json.buffers[0].byteLength!==240516||json.bufferViews?.length!==32
    ||root.children.length!==5||root.children.some((o,i)=>o.name!==rootNames[i]))throw Error('Unexpected food source structure');
  if(owned.geometries.size!==11||owned.materials.size!==10||owned.attributes.size!==32
    ||owned.drawPrimitives!==11||owned.triangles!==13190)throw Error('Unexpected loaded food geometry');
  for(const g of owned.geometries){
    if(Object.keys(g.attributes).sort().join(',')!=='normal,position'||!g.index||Object.keys(g.morphAttributes).length)throw Error('Unexpected food buffers');
  }
  for(const m of owned.materials)if(Object.values(m).some(value=>value?.isTexture))throw Error('Food textures are not admitted');
  const binary=await gltf.parser.getDependency('buffer',0),views=await gltf.parser.getDependencies('bufferView');
  const distinctViews=new Set(views),allCPU=new Set([bytes,binary,...distinctViews,...owned.cpuBuffers]);
  const geometryGPUBufferBytes=[...owned.attributes].reduce((sum,a)=>sum+a.array.byteLength,0);
  const knownCPUBufferPeakBytes=[...allCPU].reduce((sum,b)=>sum+b.byteLength,0)+FOOD_ASSET_R2.validationScratchBytes;
  if(binary.byteLength!==240516||distinctViews.size!==32||owned.cpuBuffers.size!==32
    ||[...owned.cpuBuffers].some(b=>!distinctViews.has(b))||knownCPUBufferPeakBytes!==FOOD_ASSET_R2.knownCPUBufferPeakBytes
    ||geometryGPUBufferBytes!==FOOD_ASSET_R2.geometryGPUBufferBytes)throw Error('Unexpected food allocation layout');
  const box=new THREE.Box3().setFromObject(root);
  const expectedMin=[-3.84250009059906/12,0,-3.84250009059906/12];
  const expectedMax=[3.84250009059906/12,2.088955342769623/12,3.84250009059906/12];
  for(let i=0;i<3;i++)if(Math.abs(box.min.getComponent(i)-expectedMin[i])>1e-7
    ||Math.abs(box.max.getComponent(i)-expectedMax[i])>1e-7)throw Error('Food source axes or bounds changed');
  return Object.freeze({cpuGLBBytes:bytes.byteLength,cpuParsedBinaryBufferBytes:binary.byteLength,
    cpuBufferViewCopiesBytes:[...distinctViews].reduce((sum,b)=>sum+b.byteLength,0),
    validationScratchBytes:36,knownCPUBufferPeakBytes,geometryGPUBufferBytes,
    contextRestoreGPUBufferPeakBytes:geometryGPUBufferBytes*2,uniqueCPUBufferCount:allCPU.size,
    uniqueGeometryAttributes:owned.attributes.size,drawPrimitives:owned.drawPrimitives,triangles:owned.triangles,
    materials:owned.materials.size,geometries:owned.geometries.size,imageTextureBytes:0,rgbaSurfaceBytes:0,
    renderTargets:0,canvasCopies:0,filters:0,shadowsAdded:0,engineObjectAndHashImplementationOverheadKnown:false,
    driverAllocationKnown:false,physicalGPUReleaseKnown:false});
}

export async function createCalibratedFood(THREE,{enabled=false,descriptor,loader,loadAssetBytes,resourceOwner,signal}={}) {
  if(enabled!==true)return null;
  if(THREE?.REVISION!=='186'||!validateCanonicalFoodDescriptor(descriptor))throw Error('Unqualified canonical food descriptor');
  if(!loader?.parseAsync||typeof loadAssetBytes!=='function'||!resourceOwners.has(resourceOwner))throw Error('Explicit food loader, bytes and shared resource owner required');
  signal?.throwIfAborted();
  const reservation=resourceOwner.reserve();
  let bytes=null,gltf=null,root=null,resources=null,selection=null,disposed=false,contextLost=false,possiblyUploaded=false;
  const counts={loads:0,selections:0,contextLosses:0,contextRestorations:0,disposals:0};
  function hide() {
    if(root){root.visible=false;for(const group of root.children)group.visible=false;}
    reservation.hide();
  }
  function dispose() {
    if(disposed)return;disposed=true;counts.disposals++;signal?.removeEventListener('abort',dispose);hide();releaseScene(root);
    reservation.retire({possiblyUploaded});bytes=null;gltf=null;root=null;selection=null;
  }
  try {
    bytes=await loadAssetBytes();signal?.throwIfAborted();
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==FOOD_ASSET_R2.glbBytes)throw Error('Food asset byte identity mismatch');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(hash!==FOOD_ASSET_R2.sha256)throw Error('Food asset hash mismatch');
    signal?.throwIfAborted();
    gltf=await loader.parseAsync(bytes,'');root=gltf.scene;
    // Nothing sees the parsed scene until its root and all variant roots hide.
    hide();signal?.throwIfAborted();counts.loads++;
    resources=await validateLoaded(THREE,gltf,bytes);signal?.throwIfAborted();reservation.assertFits();
    root.name='Canonical food source R2 (one shared bowl-1)';
    root.position.set(descriptor.anchorCanonicalXYZ[0]/12,descriptor.anchorCanonicalXYZ[2]/12,-descriptor.anchorCanonicalXYZ[1]/12);
    root.updateMatrixWorld(true);
    root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
    // During construction the reservation stays live until the asynchronous
    // load/parse result is cleaned up. Once ready, abort also closes the gap
    // between promise resolution and host attachment or snapshot selection.
    signal?.addEventListener('abort',dispose,{once:true});signal?.throwIfAborted();
  } catch(error){dispose();throw error;}
  function select(snapshot) {
    if(disposed)return {available:false,state:null,reason:'FOOD_OWNER_DISPOSED'};
    hide();selection=selectCanonicalFoodState(snapshot);counts.selections++;
    if(!selection.available||!Object.hasOwn(stateGroups,selection.state)){
      selection={...selection,available:false,state:null};return {...selection};
    }
    if(contextLost)return {...selection,available:false,reason:'FOOD_CONTEXT_LOST'};
    try {
      if(!reservation.claimVisible())return {...selection,available:false,reason:'FOOD_OWNER_ALREADY_VISIBLE'};
      const visible=new Set(stateGroups[selection.state]);
      for(const group of root.children)group.visible=visible.has(group.name);
      root.visible=true;possiblyUploaded=true;
    } catch(error){hide();throw error;}
    return {...selection};
  }
  return {
    root,asset:FOOD_ASSET_R2,resources,descriptor:CANONICAL_FOOD_CONTRACT,selectSnapshot:select,
    hide(){if(!disposed){hide();selection=null;}},dispose,
    contextLost(){if(disposed||contextLost)return false;contextLost=true;counts.contextLosses++;hide();return true;},
    contextRestored(snapshot){
      if(disposed||!contextLost)return false;
      // Reuse all CPU objects. A fresh authoritative snapshot must qualify the
      // state again; no stale automatic visibility and no second parse/copy.
      reservation.assertFits();contextLost=false;counts.contextRestorations++;return select(snapshot);
    },
    get diagnostics(){return {disposed,contextLost,...counts,state:selection?.state??null,
      visible:root?.visible??false,visibleGroups:root?.children.filter(g=>g.visible).map(g=>g.name)??[],
      position:root?.position.toArray()??null,scale:root?.scale.toArray()??null,
      runtimeActivated:false,presentationReady:false,visitAdmission:false};}
  };
}

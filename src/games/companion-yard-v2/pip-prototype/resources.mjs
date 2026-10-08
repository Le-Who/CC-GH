import{pipRenderProfile,DEFAULT_RENDER_PROFILE}from'./render-quality-profile.mjs';
import{PIP_CONTACT_SHADOW}from'./prototype/pip-contact-shadow.mjs';
import{GARDEN_RASTER}from'./garden-raster.mjs';
export{GARDEN_RASTER}from'./garden-raster.mjs';
/** Explicit known allocations. These caps are not browser RSS or total GPU RAM. */
// One reference-density raster covers the complete calibrated garden, including
// the final fractional artwork row. CSS scales/crops it together with the art.
// This replaces the historical 192px following tile, not the total owner caps.
export const LIMITS=Object.freeze({rgba:64*1024*1024,knownCPU:16*1024*1024,estimatedGPU:12*1024*1024,backing:GARDEN_RASTER});
// Pip + authored T2 GLBs, parsed binaries, view copies, and both contact owners.
export const MODEL_CPU_GLB_BYTES=4093160;
export const MODEL_CPU_BINARY_BYTES=4052292;
export const KNOWN_CPU_BUFFER_PEAK=12223676+PIP_CONTACT_SHADOW.geometryCPUBytes+PIP_CONTACT_SHADOW.pendingCPUBytes;
export const BACKGROUND_ENCODED_BYTES=1444018;
export const ENCODED_BACKGROUND_CPU_BYTES=BACKGROUND_ENCODED_BYTES*2;
export const COMBINED_KNOWN_CPU_PEAK=KNOWN_CPU_BUFFER_PEAK+ENCODED_BACKGROUND_CPU_BYTES;
let lease=null;
export function acquirePipLease(){
 if(lease)throw Error('One Pip loading/active/retiring owner is already present');
 const token=Symbol('optional-Pip');lease=token;let released=false;
 return()=>{if(!released&&lease===token){released=true;lease=null;}};
}
export function admitPipResources(row,{renderProfile=DEFAULT_RENDER_PROFILE}={}){
 let profile;try{profile=pipRenderProfile(renderProfile);}catch{return false;}
 if((row.renderProfile??DEFAULT_RENDER_PROFILE)!==profile.id)return false;
 if(row.separateFromYard64MiBRGBALedger!==true)return false;
 const encodedBackground=row.encodedBackgroundCPUBytes??0;
 if(![0,ENCODED_BACKGROUND_CPU_BYTES].includes(encodedBackground)||row.knownCPUBufferPeakBytes+encodedBackground>LIMITS.knownCPU)return false;
 if(row.contactShadowGeometryCPUBytes!==PIP_CONTACT_SHADOW.geometryCPUBytes||row.contactShadowPendingCPUBytes!==PIP_CONTACT_SHADOW.pendingCPUBytes)return false;
 if(row.stage==='before-import-and-load')return row.cpuGLBBytes===MODEL_CPU_GLB_BYTES&&row.cpuParsedBinaryBufferBytes===MODEL_CPU_BINARY_BYTES&&row.cpuBufferViewCopiesBytes===MODEL_CPU_BINARY_BYTES&&row.knownCPUBufferPeakBytes===KNOWN_CPU_BUFFER_PEAK&&row.knownCPUBufferPeakBytes<=LIMITS.knownCPU;
 if(row.stage!=='before-drawing-buffer-allocation')return false;
 if(row.contactShadowGeometryGPUBytes!==PIP_CONTACT_SHADOW.geometryGPUBytes||row.contactShadowImageTextureBytes!==0||row.contactShadowDrawPrimitives!==1)return false;
 const pixels=profile.pixels;
 if(row.committedPropCapacity!==2||row.ghostPropCapacity!==1||row.propInstanceCapacity!==3||row.propBuffersShared!==true)return false;
 const allocations=['geometryGPUBufferBytes','boneDataTextureGPUBytesEstimate','boneDataTextureCPUBytesEstimate','resizeDrawingBufferPeakEstimatedBytes','compositorResizePeakBytesEstimate'];
 if(!allocations.every(key=>Number.isSafeInteger(row[key])&&row[key]>=0)||!['direct','copy'].includes(row.presentationMode)||row.ownedRGBASurfacePeakBytes!==pixels*(row.presentationMode==='direct'?16:8))return false;
 return row.knownCPUBufferPeakBytes===KNOWN_CPU_BUFFER_PEAK&&row.knownCPUBufferPeakBytes+encodedBackground+row.boneDataTextureCPUBytesEstimate<=LIMITS.knownCPU&&row.assetImageTextureBytes===0&&row.uniqueSkeletons===1&&row.antialias===false&&row.shadowMaps===false&&row.rasterPolicy==='garden-reference-grid-v1'&&row.backingWidth===profile.width&&row.backingHeight===profile.height&&row.drawingBufferColorBytes===pixels*4&&row.depthStencilEstimatedBytes===pixels*4&&row.resizeDrawingBufferPeakEstimatedBytes===pixels*16&&row.compositorSurfaceBytesEstimate===(row.presentationMode==='direct'?pixels*4:0)&&row.compositorResizePeakBytesEstimate===(row.presentationMode==='direct'?pixels*8:0)&&row.geometryGPUBufferBytes+row.boneDataTextureGPUBytesEstimate+row.resizeDrawingBufferPeakEstimatedBytes+row.compositorResizePeakBytesEstimate<=profile.estimatedGPU;
}
export function rgbaAdmission({uiBytes,backgroundBytes=0,currentCanvasBytes=0,pendingCanvasBytes=0,directSurfaceBytes=0}){
 const values=[uiBytes,backgroundBytes,currentCanvasBytes,pendingCanvasBytes,directSurfaceBytes];
 if(!values.every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid owned RGBA allocation');
 const totalBytes=values.reduce((a,b)=>a+b,0);
 return{fits:totalBytes<=LIMITS.rgba,totalBytes,limitBytes:LIMITS.rgba,uiBytes,backgroundBytes,currentCanvasBytes,pendingCanvasBytes,directSurfaceBytes,legacyAtlasBytes:0,legacySceneStaticBytes:0};
}

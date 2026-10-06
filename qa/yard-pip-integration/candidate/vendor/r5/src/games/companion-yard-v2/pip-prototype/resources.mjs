/** Explicit known allocations. These caps are not browser RSS or total GPU RAM. */
export const LIMITS=Object.freeze({rgba:64*1024*1024,knownCPU:16*1024*1024,estimatedGPU:12*1024*1024,backing:192});
export const KNOWN_CPU_BUFFER_PEAK=11872312;
export const BACKGROUND_ENCODED_BYTES=1444018;
export const ENCODED_BACKGROUND_CPU_BYTES=BACKGROUND_ENCODED_BYTES*2;
export const COMBINED_KNOWN_CPU_PEAK=KNOWN_CPU_BUFFER_PEAK+ENCODED_BACKGROUND_CPU_BYTES;
let lease=null;
export function acquirePipLease(){
 if(lease)throw Error('One Pip loading/active/retiring owner is already present');
 const token=Symbol('optional-Pip');lease=token;let released=false;
 return()=>{if(!released&&lease===token){released=true;lease=null;}};
}
export function admitPipResources(row){
 if(row.separateFromYard64MiBRGBALedger!==true)return false;
 const encodedBackground=row.encodedBackgroundCPUBytes??0;
 if(![0,ENCODED_BACKGROUND_CPU_BYTES].includes(encodedBackground)||row.knownCPUBufferPeakBytes+encodedBackground>LIMITS.knownCPU)return false;
 if(row.stage==='before-import-and-load')return row.cpuGLBBytes===3972384&&row.cpuBufferViewCopiesBytes===3937068&&row.knownCPUBufferPeakBytes===KNOWN_CPU_BUFFER_PEAK&&row.knownCPUBufferPeakBytes<=LIMITS.knownCPU;
 if(row.stage!=='before-drawing-buffer-allocation')return false;
 return row.knownCPUBufferPeakBytes===KNOWN_CPU_BUFFER_PEAK&&row.assetImageTextureBytes===0&&row.uniqueSkeletons===1&&row.antialias===false&&row.shadowMaps===false&&row.drawingBufferColorBytes===192*192*4&&row.geometryGPUBufferBytes+row.boneDataTextureGPUBytesEstimate+row.resizeDrawingBufferPeakEstimatedBytes+row.compositorResizePeakBytesEstimate<=LIMITS.estimatedGPU;
}
export function rgbaAdmission({uiBytes,backgroundBytes=0,currentCanvasBytes=0,pendingCanvasBytes=0}){
 const values=[uiBytes,backgroundBytes,currentCanvasBytes,pendingCanvasBytes];
 if(!values.every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid owned RGBA allocation');
 const totalBytes=values.reduce((a,b)=>a+b,0);
 return{fits:totalBytes<=LIMITS.rgba,totalBytes,limitBytes:LIMITS.rgba,uiBytes,backgroundBytes,currentCanvasBytes,pendingCanvasBytes,legacyAtlasBytes:0,legacySceneStaticBytes:0};
}

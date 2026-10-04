/** Authored environmental layers use the same camera as sprites and pointers.
 * Pure drawing only: scenery never changes navigation or saved placements. */
import {conservativeMaskStrips} from './scene-layout.mjs';

export function anchoredImageRect(projection, anchor, imageSize, pivot, referenceWidth) {
  if (!projection.artwork || !Array.isArray(imageSize) || !imageSize.every(n=>Number.isFinite(n)&&n>0)
    || !Array.isArray(pivot) || pivot.length!==2 || !pivot.every(Number.isFinite)
    || !Number.isFinite(referenceWidth) || referenceWidth<=0) throw new Error('Invalid environmental image calibration');
  const artScale=projection.artwork.scale;
  if(!Number.isFinite(artScale)||artScale<=0)throw new Error('Explicit uniform artwork scale required');
  const scale=referenceWidth/imageSize[0]*artScale, p=projection.project(anchor);
  return {x:p.x-pivot[0]*scale,y:p.y-pivot[1]*scale,width:imageSize[0]*scale,height:imageSize[1]*scale,scale,anchor:p};
}

function appendGround(ctx,projection,rows) {
  for(const r of conservativeMaskStrips(rows)) {
    const points=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}].map(projection.project);
    points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
  }
}

/** Inputs are decoded runtime exports, not a screenshot containing controls. */
export function drawLayeredEnvironment(ctx,projection,images,{maskRows,entry,gatePivot=[136.36923076923077,226.46153846153848],gateReferenceWidth=180,borderAnchors=[]}={}) {
  const art=projection.artwork;
  if(!art || !images.plate || !images.ground || !images.gate || !images.border) throw new Error('Complete calibrated environmental layers required');
  ctx.save();
  try {
    ctx.drawImage(images.plate,art.left,art.top,art.width,art.height);
    ctx.save();
    try {
      ctx.beginPath();appendGround(ctx,projection,maskRows);ctx.clip();
      // Uniform texture fit, with crop owned by this same artwork transform.
      const scale=Math.max(art.width/images.ground.width,art.height/images.ground.height);
      const width=images.ground.width*scale,height=images.ground.height*scale;
      ctx.drawImage(images.ground,art.left+(art.width-width)/2,art.top+(art.height-height)/2,width,height);
    } finally {ctx.restore();}
    ctx.save();
    try {
      // Low foliage is decorative and stays outside the actual usable mask.
      ctx.beginPath();ctx.rect(0,0,projection.width,projection.height);appendGround(ctx,projection,maskRows);ctx.clip('evenodd');
      for(const anchor of borderAnchors) {
        const r=anchoredImageRect(projection,anchor,[images.border.width,images.border.height],[images.border.width/2,images.border.height],120);
        ctx.drawImage(images.border,r.x,r.y,r.width,r.height);
      }
    } finally {ctx.restore();}
    const gate=anchoredImageRect(projection,entry,[images.gate.width,images.gate.height],gatePivot,gateReferenceWidth);
    ctx.drawImage(images.gate,gate.x,gate.y,gate.width,gate.height);
    return {gate,artwork:{...art},decodedBytes:Object.values(images).reduce((n,image)=>n+image.width*image.height*4,0)};
  } finally {ctx.restore();}
}

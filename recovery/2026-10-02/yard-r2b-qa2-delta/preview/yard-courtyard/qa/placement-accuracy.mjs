/** UI roundtrips include fractional CSS-pixel coordinates from CDP and layout.
 * Both a small model-space ceiling and a subpixel screen-space bound are used.
 * App coordinates are never rounded or modified by this check. */
export const PLACEMENT_TOLERANCE=Object.freeze({yardUnits:.025,cssPixels:.05});
export function placementAccuracy({old,moved,targetPx,actualPx}){
 const modelError=Math.hypot(moved.x-old.x-2,moved.y-old.y);
 const pixelError=Math.hypot(actualPx.x-targetPx.x,actualPx.y-targetPx.y);
 const metadataUnchanged=moved.rotationZ===old.rotationZ&&moved.compression===old.compression;
 return {passed:Number.isFinite(modelError)&&Number.isFinite(pixelError)&&modelError<=PLACEMENT_TOLERANCE.yardUnits&&pixelError<=PLACEMENT_TOLERANCE.cssPixels&&metadataUnchanged,modelError,pixelError,metadataUnchanged,tolerance:PLACEMENT_TOLERANCE};
}

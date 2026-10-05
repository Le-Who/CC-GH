/** Shared ground projection. Logical yard XY /8 = authored Blender world XY.
 * The painting is a calibrated backdrop; only the explicit grass anchors are used. */
export const CAMERA_DIRECTION = Object.freeze([5.66,-8,3.97]);
const [x,y,z]=CAMERA_DIRECTION, h=Math.hypot(x,y),l=Math.hypot(x,y,z);
export const BASIS=Object.freeze({right:[-y/h,x/h,0],down:[x*z/(h*l),y*z/(h*l),-h/l]});
// Legacy CAMERA_DIRECTION/BASIS remain the accepted source-manifest calibration.
// Rendering uses separately validated camera pixels and this fixed screen transform.
export {createSceneProjection as createProjection} from './scene45-transform.mjs';
export function footprintPolygon(rect,projection){return[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x+rect.width,rect.y+rect.height],[rect.x,rect.y+rect.height]].map(([x,y])=>projection.project({x,y}));}

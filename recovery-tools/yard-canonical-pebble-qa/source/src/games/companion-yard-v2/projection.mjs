/** Shared ground projection. Logical yard XY /8 = authored Blender world XY.
 * The painting is a calibrated backdrop; only the explicit grass anchors are used. */
export const CAMERA_DIRECTION = Object.freeze([5.66,-8,3.97]);
const [x,y,z]=CAMERA_DIRECTION, h=Math.hypot(x,y),l=Math.hypot(x,y,z);
export const BASIS=Object.freeze({right:[-y/h,x/h,0],down:[x*z/(h*l),y*z/(h*l),-h/l]});
export function createProjection(width,height){
 const ppu=Math.min(34,width/10,Math.max(23,height*.21));
 const center={x:width*.64,y:height*.72};
 function project(p){const wx=(p.x-50)/8,wy=(p.y-66)/8,wz=p.z||0;return{x:center.x+ppu*(BASIS.right[0]*wx+BASIS.right[1]*wy),y:center.y+ppu*(BASIS.down[0]*wx+BASIS.down[1]*wy+BASIS.down[2]*wz)};}
 function unproject(p){const a=(p.x-center.x)/ppu,b=(p.y-center.y)/ppu,[r,s]=BASIS.right,[u,v]=BASIS.down,d=r*v-s*u;return{x:50+8*(a*v-s*b)/d,y:66+8*(r*b-a*u)/d};}
 return{width,height,ppu,project,unproject};
}
export function footprintPolygon(rect,projection){return[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x+rect.width,rect.y+rect.height],[rect.x,rect.y+rect.height]].map(([x,y])=>projection.project({x,y}));}

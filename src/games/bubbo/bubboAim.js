/** Analytical aim, wall reflection, landing-cell and keyboard helpers.
 * Recovered from the owned Bubbo v2 review build; see recovery manifest.
 * React and app services are imports from the production app, never bundled copies.
 */
import {BUBBO_ROWS, BUBBO_COLS, getBubboRowVisualOffset, getBubboNeighbors, getAssistedBubboAim} from '../../game-core/bubbo/engine.js';

const clampBubboAngle=angle=>Math.max(-Math.PI+.18, Math.min(-.18, Number.isFinite(angle)?angle:-Math.PI/2));
function bubboCellCenter(geometry, row, col, rowOffset=0, pressureStep=0){
  return{
    x:geometry.left+(col+.5+getBubboRowVisualOffset(row, rowOffset))*geometry.cell,
    y:geometry.top+row*geometry.step+Math.max(0, pressureStep)*geometry.step
  }
}
function angleFromBubboPointer(geometry, pointerX, pointerY){
  return clampBubboAngle(Math.atan2(Math.min(pointerY, geometry.cannonY-geometry.cell*1.5)-geometry.cannonY, pointerX-geometry.cannonX))
}
function rayCircleDistance(originX, originY, directionX, directionY, centerX, centerY, radius){
  const deltaX=originX-centerX;
  const deltaY=originY-centerY;
  const projection=deltaX*directionX+deltaY*directionY;
  const offsetSquared=deltaX*deltaX+deltaY*deltaY-radius*radius;
  const discriminant=projection*projection-offsetSquared;
  if(discriminant<0)return 1/0;
  const distance=-projection-Math.sqrt(discriminant);
  return distance>.001?distance:1/0
}
function traceBubboShot(state, geometry, rawAngle=-Math.PI/2){
  const{
    board:board=[],
    pendingRow:pendingRow=[],
    rowOffset:rowOffset=0,
    pressureStep:pressureStep=0
  }=state;
  const hasPendingRow=pendingRow.some(Boolean);
  const occupied=[];
  const getColor=(J, K)=>J===-1?pendingRow[K]:board[J]?.[K];
  for(let J=hasPendingRow?-1:0; J<BUBBO_ROWS; J++)for(let K=0; K<BUBBO_COLS; K++)getColor(J, K)&&occupied.push({
    ...bubboCellCenter(geometry, J, K, rowOffset, pressureStep),
    row:J,
    col:K,
    color:getColor(J, K)
  });
  let angle=clampBubboAngle(rawAngle);
  if(state.aimAssist!==false){
    const J=occupied.filter(K=>K.color===state.current).map(K=>({
      angle:Math.atan2(K.y-geometry.cannonY, K.x-geometry.cannonX)
    }));
    angle=clampBubboAngle(getAssistedBubboAim({
      rawAngle:angle,
      candidates:J,
      maxDegrees:2
    }).angle)
  }
  const findLandingCell=(J, K)=>{
    let ce=null;
    let V=1/0;
    for(let W=hasPendingRow?-1:0; W<BUBBO_ROWS; W++)for(let X=0; X<BUBBO_COLS; X++){
      if(getColor(W, X)||W>0&&!getBubboNeighbors(W, X, rowOffset, {
        includePendingRow:hasPendingRow
      }).some(([Be, He])=>getColor(Be, He)))continue;
      const he=bubboCellCenter(geometry, W, X, rowOffset, pressureStep);
      const Ce=(he.x-J)**2+(he.y-K)**2;
      Ce<V&&(V=Ce, ce={
        row:W,
        col:X,
        ...he
      })
    }
    return ce
  };
  let x=geometry.cannonX;
  let y=geometry.cannonY;
  let dx=Math.cos(angle);
  let dy=Math.sin(angle);
  const path=[{
    x:x,
    y:y
  }];
  const ceilingY=geometry.top+(hasPendingRow?-1:0)*geometry.step+pressureStep*geometry.step;
  for(let J=0; J<20; J++){
    const K=dx<0?(geometry.left+geometry.radius-x)/dx:dx>0?(geometry.right-geometry.radius-x)/dx:1/0;
    const ce=(ceilingY-y)/dy;
    let V=Math.max(.001, ce);
    let W="ceiling";
    K>0&&K<V&&(V=K, W="wall");
    for(const he of occupied){
      const Ce=rayCircleDistance(x, y, dx, dy, he.x, he.y, geometry.radius*2*.99);
      Ce<V&&(V=Ce, W="ball")
    }
    if(x+=dx*V, y+=dy*V, W==="wall"){
      path.push({
        x:x,
        y:y
      });
      dx=-dx;
      x+=dx*.002;
      continue
    }
    const X=findLandingCell(x, y);
    return X?(path.push({
      x:X.x,
      y:X.y
    }), {
      ...X,
      path:path,
      angle:angle,
      bounces:path.length-2
    }):null
  }
  return null
}
function pathMetrics(path){
  let total=0;
  const segments=[];
  for(let c=1; c<path.length; c++){
    const f=path[c-1];
    const h=path[c];
    const b=Math.hypot(h.x-f.x, h.y-f.y);
    segments.push({
      from:f,
      to:h,
      length:b,
      start:total
    });
    total+=b;
  }
  return{
    segments:segments,
    total:total
  }
}
function pointAlongBubboPath(path, progress){
  const{
    segments:segments,
    total:total
  }=pathMetrics(path);
  const distance=Math.max(0, Math.min(1, progress))*total;
  const segment=segments.find(y=>y.start+y.length>=distance)||segments.at(-1);
  if(!segment)return path[0]||{
    x:0,
    y:0
  };
  const fraction=segment.length?(distance-segment.start)/segment.length:1;
  return{
    x:segment.from.x+(segment.to.x-segment.from.x)*fraction,
    y:segment.from.y+(segment.to.y-segment.from.y)*fraction
  }
}
function remapBubboPath(path, oldGeometry, newGeometry){
  return path.map((c, f)=>f===0?{
    x:newGeometry.cannonX,
    y:newGeometry.cannonY
  }:{
    x:newGeometry.left+(c.x-oldGeometry.left)/oldGeometry.cell*newGeometry.cell,
    y:newGeometry.top+(c.y-oldGeometry.top)/oldGeometry.step*newGeometry.step
  })
}
function bubboKeyboardIntent(key, angle, {
  shiftKey:shiftKey=false,
  repeat:repeat=false
}={
}){
  return key==="ArrowLeft"||key==="ArrowRight"?{
    type:"aim",
    angle:clampBubboAngle(angle+(key==="ArrowLeft"?-1:1)*(shiftKey?.6:2.5)*Math.PI/180)
  }:(key===" "||key==="Enter")&&!repeat?{
    type:"fire"
  }:key==="Escape"?{
    type:"pause"
  }:null
}

export {clampBubboAngle, bubboCellCenter, angleFromBubboPointer, traceBubboShot, pathMetrics, pointAlongBubboPath, remapBubboPath, bubboKeyboardIntent};

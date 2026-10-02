// Match a small flower/leaf patch in actual screenshot pixels. The reference's
// high-contrast edges carry the fit; flat background cannot imply movement.
export function measurePlantTranslation(reference,candidate,{width,height,scale=1}){
  if(reference.length!==candidate.length||reference.length!==width*height*3)throw Error('Pixel patch dimensions differ');
  const maxX=Math.min(Math.ceil(6*scale),Math.floor(width/4)),maxY=Math.min(Math.ceil(2*scale),Math.floor(height/4));
  const edges=[];
  for(let y=maxY+1;y<height-maxY-1;y++)for(let x=maxX+1;x<width-maxX-1;x++){
    const at=(y*width+x)*3,left=at-3,right=at+3,up=at-width*3,down=at+width*3;
    if([0,1,2].some(c=>Math.max(Math.abs(reference[left+c]-reference[right+c]),Math.abs(reference[up+c]-reference[down+c]))>20))edges.push(at);
  }
  if(edges.length<8)throw Error('Leaf crop lacks enough visible edges to measure motion');
  const error=(dx,dy)=>{let sum=0;for(const at of edges){const shifted=at+(dy*width+dx)*3;for(let c=0;c<3;c++)sum+=Math.abs(reference[at+c]-candidate[shifted+c]);}return sum/(edges.length*3);};
  let best={dx:0,dy:0,error:error(0,0)};
  for(let dy=-maxY;dy<=maxY;dy++)for(let dx=-maxX;dx<=maxX;dx++){const score=error(dx,dy);if(score+1e-6<best.error)best={dx,dy,error:score};}
  return {x:best.dx/scale,y:best.dy/scale,error:best.error,edges:edges.length};
}

// Presentation-only boundary of the existing union of world-space rectangles.
// Cancels shared and partly shared edges; never edits saved masks or positions.
export function exteriorSegments(rectangles) {
  for(let i=0;i<rectangles.length;i++)for(let j=0;j<i;j++) {
    const a=rectangles[i],b=rectangles[j];
    if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1e-9
      && Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1e-9)throw new Error('Mask strips must have disjoint interiors');
  }
  const axes = [new Map(), new Map()];
  const add = (axis, level, lo, hi, sign) => {
    const key = Number(level.toFixed(9));
    if (!axes[axis].has(key)) axes[axis].set(key, []);
    axes[axis].get(key).push({lo, hi, sign});
  };
  for (const r of rectangles) {
    if (![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.width<=0 || r.height<=0) throw new Error('Invalid mask rectangle');
    add(0,r.y,r.x,r.x+r.width,-1); add(0,r.y+r.height,r.x,r.x+r.width,1);
    add(1,r.x,r.y,r.y+r.height,-1); add(1,r.x+r.width,r.y,r.y+r.height,1);
  }
  const out=[];
  for (let axis=0;axis<2;axis++) for (const [level,spans] of axes[axis]) {
    const points=[...new Set(spans.flatMap(s=>[s.lo,s.hi]))].sort((a,b)=>a-b);
    for(let i=0;i<points.length-1;i++) {
      const lo=points[i],hi=points[i+1],mid=(lo+hi)/2;
      if(hi-lo<1e-9)continue;
      const signs=spans.filter(s=>s.lo<=mid && mid<s.hi).reduce((n,s)=>n+s.sign,0);
      if(!signs)continue;
      const sign=Math.sign(signs);
      out.push(axis===0 ? {a:{x:lo,y:level},b:{x:hi,y:level},outward:{x:0,y:sign}}
        : {a:{x:level,y:lo},b:{x:level,y:hi},outward:{x:sign,y:0}});
    }
  }
  return out;
}

// Uniform spacing is measured in the final screen, so narrow displays do not
// inherit the old tiny isolated ornaments. The caller clips decoration outside
// the unchanged mask and omits the explicit gate passage.
export function perimeterPlacements(rectangles,project,{spacing=24}={}) {
  if(!Number.isFinite(spacing)||spacing<=0)throw new Error('Invalid perimeter spacing');
  const result=[];
  for(const edge of exteriorSegments(rectangles)) {
    const a=project(edge.a),b=project(edge.b),length=Math.hypot(b.x-a.x,b.y-a.y);
    if(!Number.isFinite(length))throw new Error('Invalid projected boundary');
    const count=Math.max(1,Math.ceil(length/spacing));
    for(let i=0;i<count;i++) {
      const t=(i+.5)/count,world={x:edge.a.x+(edge.b.x-edge.a.x)*t,y:edge.a.y+(edge.b.y-edge.a.y)*t};
      const p=project(world),outside=project({x:world.x+edge.outward.x,y:world.y+edge.outward.y});
      const d=Math.hypot(outside.x-p.x,outside.y-p.y);
      if(!Number.isFinite(d)||d===0)throw new Error('Degenerate boundary projection');
      result.push({world,point:p,outward:{x:(outside.x-p.x)/d,y:(outside.y-p.y)/d}});
    }
  }
  return result;
}

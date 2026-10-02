/** Recovered game-only source from the owned Blox v2 r2 preview. See recovery manifest. */
import bloxLayoutDefaults from '../../app/hud-layout/defaultLayouts/blox.json' with {type:'json'};

const rect=(n, i, r, u)=>({
  left:n,
  top:i,
  width:r,
  height:u
});
function composeBlox({
  width:width,
  height:height,
  hudLayout:hudLayout={
  },
  safe:safe=hudLayout.viewport?.safeAreaInsets||{
  }
}){
  const c={
    ...bloxLayoutDefaults.base.regions.bloxComposition,
    ...hudLayout.regions?.bloxComposition
  };
  const f=Object.fromEntries(["left", "right", "top", "bottom"].map(ne=>[ne, Math.max(0, Number(safe[ne])||0)]));
  const m=width>height;
  const h=width>=c.largeGutterWidth?c.largeGutter:c.gutter;
  const y=Math.max(1, width-f.left-f.right-2*h);
  const g=Math.max(1, height-f.top-f.bottom-2*h);
  const p=f.left+h;
  const x=f.top+h;
  const z=m?g<=c.landscapeCompactHeight:y<=c.portraitCompactWidth||g<c.portraitCompactHeight;
  const L=z?c.compactGap:c.gap;
  let M;
  let j;
  let te;
  let W;
  let ue;
  let xe;
  if(m){
    const ne=Math.min(y*.46, z?c.railCompactWidth:c.railWidth);
    const fe=z?c.railCompactGap:c.railGap;
    const Le=Math.max(1, Math.min(g, y-ne-fe, c.maxBoard));
    const qe=Le+fe+ne;
    const V=p+(y-qe)/2;
    W=rect(V, x+(g-Le)/2, Le, Le);
    const X=[...z?c.landscapeCompactRows:c.landscapeRows];
    z&&(X[3]=Math.max(44, Math.min(X[3], g-X[1]-X[2]-X[4]-L*3)));
    const be=X.reduce((H, P)=>H+P, 0)+L*(X.filter(H=>H>0).length-1);
    let me=x+Math.max(0, (g-be)/2);
    const R=H=>{
      if(!H)return null;
      const P=rect(V+Le+fe, me, ne, H);
      return me+=H+L,
      P
    };
    M=R(X[0]);
    j=R(X[1]);
    te=R(X[2]);
    ue=R(X[3]);
    xe=R(X[4]);
  }else{
    const ne=z?c.portraitCompactRows:c.portraitRows;
    const fe=ne.reduce((be, me)=>be+me, 0)+L*4;
    const Le=Math.max(1, Math.min(y, g-fe, c.portraitMaxBoard));
    const qe=Math.min(y, Math.max(Le, Math.min(y, 360)));
    let V=x+Math.max(0, (g-fe-Le)/2);
    const X=(be, me=qe)=>{
      const R=rect(p+(y-me)/2, V, me, be);
      return V+=be+L,
      R
    };
    M=X(ne[0]);
    j=X(ne[1]);
    W=X(Le, Le);
    ue=X(ne[2]);
    xe=X(ne[3]);
    te=rect(j.left+j.width-104, j.top+(j.height-44)/2, 96, 44);
  }
  const ie=c.frameInset;
  const Me=rect(W.left+ie, W.top+ie, W.width-ie*2, W.height-ie*2);
  Object.assign(Me, {
    size:Me.width,
    cell:Me.width/10,
    rows:10,
    cols:10,
    frame:W
  });
  const oe=m&&!z;
  const I=Array.from({
    length:3
  }, (ne, fe)=>oe?rect(ue.left, ue.top+fe*(ue.height+c.slotGap)/3, ue.width, (ue.height-2*c.slotGap)/3):rect(ue.left+fe*(ue.width+c.slotGap)/3, ue.top, (ue.width-2*c.slotGap)/3, ue.height));
  return{
    width:width,
    height:height,
    safe:f,
    landscape:m,
    compact:z,
    title:M,
    hud:j,
    actions:te,
    frame:W,
    board:Me,
    tray:ue,
    status:xe,
    slots:I,
    frameInset:ie,
    slotInset:c.slotInset
  }
}

export {composeBlox};

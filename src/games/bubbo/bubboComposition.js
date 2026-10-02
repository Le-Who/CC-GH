/** Separate portrait/landscape composition and authoritative field geometry.
 * Recovered from the owned Bubbo v2 review build; see recovery manifest.
 * React and app services are imports from the production app, never bundled copies.
 */
import bubboLayoutDefaults from '../../app/hud-layout/defaultLayouts/bubbo.json' with {type:'json'};

const rect=(i, o, r, c)=>({
  left:i,
  top:o,
  width:r,
  height:c
});
function composeBubbo({
  width:width,
  height:height,
  hudLayout:hudLayout={
  },
  safe:safe=hudLayout.viewport?.safeAreaInsets||{
  }
}){
  const config={
    ...bubboLayoutDefaults.base.regions.bubboComposition,
    ...hudLayout.regions?.bubboComposition
  };
  const viewportHeight=height;
  const scroll=width>height&&height<config.minimumLandscapeHeight;
  scroll&&(height=config.minimumLandscapeHeight);
  const safeInsets=Object.fromEntries(["top", "right", "bottom", "left"].map(W=>[W, Math.max(0, Number(safe[W])||0)]));
  const landscape=width>height;
  const gap=config.gap||8;
  const gutter=config.gutter||8;
  const usableWidth=Math.max(1, width-safeInsets.left-safeInsets.right-gutter*2);
  const usableHeight=Math.max(1, height-safeInsets.top-safeInsets.bottom-gutter*2);
  const left=safeInsets.left+gutter;
  const top=safeInsets.top+gutter;
  const compact=landscape?usableHeight<400:usableHeight<680;
  const ultra=landscape&&usableHeight<260;
  let hud;
  let field;
  let actions;
  let status;
  let heading;
  if(landscape){
    const W=Math.min(usableWidth*.42, compact?config.railCompactWidth:config.railWidth);
    const X=usableHeight;
    const he=X*.94;
    const Ce=Math.min(usableWidth-W-gap*2, he);
    const Be=left+(usableWidth-Ce-W-gap*2)/2;
    field=rect(Be, top, Ce, X);
    const He=Be+Ce+gap*2;
    heading=ultra?null:rect(He, top, W, compact?22:34);
    hud=rect(He, ultra?top:top+heading.height+gap, W, ultra?76:compact?82:108);
    const _e=ultra?24:44;
    const F=ultra?92:compact?106:148;
    const re=ultra?4:gap;
    actions=rect(He, top+usableHeight-F-_e-re, W, F);
    status=rect(He, top+usableHeight-_e, W, _e);
  }else{
    const W=Math.min(usableWidth, config.portraitMaxWidth);
    const X=left+(usableWidth-W)/2;
    heading=null;
    hud=rect(X, top, W, compact?76:80);
    actions=rect(X, top+usableHeight-64-36-gap, W, 64);
    status=rect(X, top+usableHeight-36, W, 36);
    field=rect(X, hud.top+hud.height+gap, W, Math.max(1, actions.top-gap-(hud.top+hud.height+gap)));
  }
  return{
    width:width,
    height:height,
    viewportHeight:viewportHeight,
    scroll:scroll,
    scrollTop:scroll?48:0,
    landscape:landscape,
    compact:compact,
    ultra:ultra,
    hud:hud,
    field:field,
    actions:actions,
    status:status,
    heading:heading,
    safe:safeInsets,
    dialogMax:landscape?560:460
  }
}
function bubboFieldGeometry(width, height){
  const cell=Math.max(1, Math.min((width-16)/9.5, (height-48)/11.5, 64));
  const step=cell*Math.sqrt(3)/2;
  const left=(width-cell*9.5)/2;
  return{
    width:width,
    height:height,
    cell:cell,
    step:step,
    radius:cell*.48,
    left:left,
    right:left+cell*9.5,
    top:cell*.5+step,
    cannonX:width/2,
    cannonY:height-35,
    dangerY:cell*.5+step*9.5,
    cols:9,
    rows:11
  }
}

export {composeBubbo, bubboFieldGeometry};

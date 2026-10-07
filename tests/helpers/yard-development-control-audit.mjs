import assert from 'node:assert/strict';
// Reused actual DOM scroll/clip/hit admission; source provenance in packet README.
export function inspectControlDOM(e){
 const rect=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
 const describe=n=>n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).join('.'):'');
 const modal=e.closest('.cy-dialog:modal'),content=e.closest('.cy-dialog > .cy-panel'),footer=e.closest('.cy-dialog > .cy-selected-actions'),footerStyle=footer?getComputedStyle(footer):null;
 const panel=content||(footer&&['auto','scroll'].includes(footerStyle.overflowY)?footer:null),ancestors=[];let clip={x:0,y:0,right:innerWidth,bottom:innerHeight};
 for(let n=e.parentElement;n;n=n.parentElement){const s=getComputedStyle(n),b=rect(n),a={node:describe(n),declaredPanel:n===panel,overflowX:s.overflowX,overflowY:s.overflowY,scrollTop:n.scrollTop,scrollBottom:n.scrollHeight-n.clientHeight-n.scrollTop,scrollLeft:n.scrollLeft,scrollRight:n.scrollWidth-n.clientWidth-n.scrollLeft,scrollHeight:n.scrollHeight,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,clientWidth:n.clientWidth,bounds:b,clientBounds:{x:b.x+n.clientLeft,y:b.y+n.clientTop,right:b.x+n.clientLeft+n.clientWidth,bottom:b.y+n.clientTop+n.clientHeight}};
  if(n===panel||['auto','scroll','hidden','clip'].includes(s.overflowX)||['auto','scroll','hidden','clip'].includes(s.overflowY)){ancestors.push(a);if(['auto','scroll','hidden','clip'].includes(s.overflowX)){clip.x=Math.max(clip.x,a.clientBounds.x);clip.right=Math.min(clip.right,a.clientBounds.right);}if(['auto','scroll','hidden','clip'].includes(s.overflowY)){clip.y=Math.max(clip.y,a.clientBounds.y);clip.bottom=Math.min(clip.bottom,a.clientBounds.bottom);}}
  // A native modal occupies the top layer; outside DOM ancestors do not clip it.
  if(n===modal)break;
 }
 const b=rect(e),x=b.x+b.w/2,y=b.y+b.h/2,hit=document.elementFromPoint(x,y),panelInfo=ancestors.find(a=>a.declaredPanel),full=(a,c)=>a.x>=c.x-1&&a.y>=c.y-1&&a.right<=c.right+1&&a.bottom<=c.bottom+1;
 return{label:(e.getAttribute('aria-label')||e.innerText||e.value||e.tagName).slice(0,220),tag:e.tagName.toLowerCase(),disabled:!!e.disabled,rect:b,clipped:e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1,declaredScrollContent:!!panel,panel:panelInfo??null,ancestors,clip,fullyVisible:full(b,clip),hit:!!hit&&(hit===e||e.contains(hit)),hitElement:hit?describe(hit):null,center:{x,y},viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY}};
}
export function assertBeforeScroll(before){
 assert(before.rect.w>=43&&before.rect.h>=43,'Tap target '+before.label);assert.equal(before.clipped,false,'Clipped control '+before.label);
 if(before.fullyVisible)return;
 assert(before.declaredScrollContent&&before.panel,'Offscreen control has no declared scroll panel: '+before.label);
 const p=before.panel,c=p.clientBounds,b=before.rect;
 if(b.y<c.y-1||b.bottom>c.bottom+1)assert(['auto','scroll'].includes(p.overflowY)&&p.scrollHeight>p.clientHeight+1,'Missing usable vertical scroll: '+before.label);
 if(b.x<c.x-1||b.right>c.right+1)assert(['auto','scroll'].includes(p.overflowX)&&p.scrollWidth>p.clientWidth+1,'Missing usable horizontal scroll: '+before.label);
 assert(p.clientHeight>0&&p.clientWidth>0,'Scroll panel has no visible area');
}
export function assertReached(before,after){
 assertBeforeScroll(before);assert.equal(after.fullyVisible,true,'Control remains outside its visible viewport/scroll ancestors: '+after.label);assert.equal(after.hit,true,'Control is occluded: '+after.label+' by '+after.hitElement);assert.equal(after.clipped,false,'Clipped control '+after.label);assert(after.rect.w>=43&&after.rect.h>=43,'Tap target '+after.label);
 assert.equal(after.viewport.scrollX,before.viewport.scrollX,'Page must not scroll to rescue dialog controls');assert.equal(after.viewport.scrollY,before.viewport.scrollY,'Page must not scroll to rescue dialog controls');
 if(before.declaredScrollContent){assert(after.panel,'Declared panel disappeared');assert.equal(after.panel.node,before.panel.node);}
 const oldAncestors=before.ancestors??[],newAncestors=after.ancestors??[];assert.equal(newAncestors.length,oldAncestors.length,'Scroll ancestor structure changed');for(let i=0;i<oldAncestors.length;i++){const a=oldAncestors[i],b=newAncestors[i];assert.equal(b.node,a.node);if(!a.declaredPanel){assert.equal(b.scrollTop,a.scrollTop,'An undeclared/hidden ancestor must not scroll to rescue a control');assert.equal(b.scrollLeft,a.scrollLeft,'An undeclared/hidden ancestor must not scroll to rescue a control');}}
}
export async function reachableControl(control,record={}){
 const before=await control.evaluate(inspectControlDOM);record.before=before;assertBeforeScroll(before);
 // This is also used before dialog audit by the visible control helpers. A fixed
 // footer must fail in its original position, before any API can scroll it.
 if(before.declaredScrollContent)await control.scrollIntoViewIfNeeded({timeout:3000});
 const after=await control.evaluate(inspectControlDOM);record.after=after;assertReached(before,after);return record;
}

export async function auditForegroundControls(page){
 const open=await page.locator('.cy-dialog[open]').count();assert(open<=1,'Ambiguous active dialog');
 const scope=open?'.cy-dialog[open]':'.cy-app',selector=['button','input','select'].map(tag=>scope+' '+tag).join(','),controls=page.locator(selector),rows=[];
 for(let i=0;i<await controls.count();i++){
  const control=controls.nth(i);if(!await control.isVisible())continue;
  const row={index:i};rows.push(row);const{before,after}=await reachableControl(control,row);
  assert(before.rect.w>=44&&before.rect.h>=44&&after.rect.w>=44&&after.rect.h>=44,'Visible control below44 CSS pixels');
  if(!after.disabled){await control.click({trial:true,timeout:3000});row.trial='passed';}else row.trial='disabled: actual bounds and hit verified';
 }
 assert(rows.length>0,'Foreground must expose controls');return {scope,controls:rows};
}

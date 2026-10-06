/** Actual declared scroll-content admission. No page state or layout overrides. */
import assert from 'node:assert/strict';
import {layout,checkLayout} from './browser-helpers.mjs';
export function inspectControlDOM(e){
 const rect=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
 const describe=n=>n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(typeof n.className==='string'?'.'+n.className.trim().split(/\s+/).join('.'):'');
 const panel=e.closest('.cy-dialog > .cy-panel'),ancestors=[];let clip={x:0,y:0,right:innerWidth,bottom:innerHeight};
 for(let n=e.parentElement;n;n=n.parentElement){const s=getComputedStyle(n),b=rect(n),a={node:describe(n),declaredPanel:n===panel,overflowX:s.overflowX,overflowY:s.overflowY,scrollTop:n.scrollTop,scrollBottom:n.scrollHeight-n.clientHeight-n.scrollTop,scrollLeft:n.scrollLeft,scrollRight:n.scrollWidth-n.clientWidth-n.scrollLeft,scrollHeight:n.scrollHeight,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,clientWidth:n.clientWidth,bounds:b,clientBounds:{x:b.x+n.clientLeft,y:b.y+n.clientTop,right:b.x+n.clientLeft+n.clientWidth,bottom:b.y+n.clientTop+n.clientHeight}};
  if(n===panel||['auto','scroll','hidden','clip'].includes(s.overflowX)||['auto','scroll','hidden','clip'].includes(s.overflowY)){ancestors.push(a);if(['auto','scroll','hidden','clip'].includes(s.overflowX)){clip.x=Math.max(clip.x,a.clientBounds.x);clip.right=Math.min(clip.right,a.clientBounds.right);}if(['auto','scroll','hidden','clip'].includes(s.overflowY)){clip.y=Math.max(clip.y,a.clientBounds.y);clip.bottom=Math.min(clip.bottom,a.clientBounds.bottom);}}
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
export async function auditDialogControls(page,label,sink){
 const entry={label,controls:[],status:'running'};sink.push(entry);
 // Fixed HUD, dock, dialog header/tabs/footer keep simultaneous strict checks.
 // Only actual controls inside the one declared content panel are walked below.
 const screen=await layout(page),fixed=await page.locator('.cy-home,.cy-actions button,.cy-placement button,dialog[open] button,dialog[open] input,dialog[open] select').evaluateAll(elements=>elements.filter(e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('dialog:not([open])')&&!e.closest('.cy-dialog > .cy-panel');}).map(e=>{const b=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')||e.innerText,rect:{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom},clipped:e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1};}));
 checkLayout({...screen,controls:fixed});entry.fixed= fixed;entry.screen={width:screen.width,height:screen.height,stage:screen.stage,dock:screen.dock};
 const controls=page.locator('.cy-dialog[open] button,.cy-dialog[open] input,.cy-dialog[open] select');const count=await controls.count();assert(count>0,'Open dialog must expose real controls');
 for(let i=0;i<count;i++){
  const control=controls.nth(i);assert(await control.isVisible(),'Declared dialog control is hidden: index '+i);
  const row={index:i};entry.controls.push(row);const{after}=await reachableControl(control,row);
  if(!after.disabled){await control.click({trial:true,timeout:3000});row.trial='passed';}else row.trial='disabled control: full bounds + actual hit verified';
 }
 entry.status='passed';return entry;
}

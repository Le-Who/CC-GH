/** HudRegion consumes id; the DOM contract is its semantic role and data attribute. */
export const YARD_STATUS='[data-hud-region="yardVisitStatus"][role="status"]';
export const REENTER_FOOD='[data-pip-control="reenter-food"]';
/** Small DOM observations only. No screenshot, canvas export or GPU readback. */
export async function observeFoodHUD(page,label){
 return page.evaluate(({label,statusSelector,reenterSelector})=>{
  const describe=e=>{if(!e)return {present:false};const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {present:true,text:e.textContent,ariaLabel:e.getAttribute('aria-label'),visible:!!e.getClientRects().length&&s.display!=='none'&&s.visibility!=='hidden',disabled:!!e.disabled,box:{x:r.x,y:r.y,width:r.width,height:r.height}};};
  return {label,wallMs:Date.now(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},status:describe(document.querySelector(statusSelector)),reenter:describe(document.querySelector(reenterSelector)),inventory:describe(document.querySelector('[data-pip-control="inventory"]'))};
 },{label,statusSelector:YARD_STATUS,reenterSelector:REENTER_FOOD});
}

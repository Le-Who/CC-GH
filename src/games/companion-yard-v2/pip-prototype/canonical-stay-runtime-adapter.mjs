import {createR1StayPresenter} from './canonical-stay-presentation.mjs';
/** Optional renderer adapter with an explicit host visibility boundary.
 * setPresentationVisible controls a host wrapper, not canvas.style.display:
 * the direct renderer writes its own canvas styles. The callback must apply
 * synchronously and return true. A hidden wrapper survives pause/context loss.
 * No timer, renderer allocation, economic clock or visit mutation is created. */
export function createR1StayRenderAdapter({plan,renderer,project,setPresentationVisible}={}){
 if(typeof renderer?.renderDirect!=='function'||typeof renderer?.setCanonicalPlacements!=='function'||typeof project!=='function')throw Error('EXISTING_R1_DIRECT_RENDERER_REQUIRED');
 if(typeof setPresentationVisible!=='function')throw Error('R1_STAY_VISIBILITY_CONTROL_REQUIRED');
 let visible=false;
 const setVisible=value=>{if(setPresentationVisible(value)!==true)throw Error('R1_STAY_VISIBILITY_CONTROL_FAILED');visible=value;};
 setVisible(false); // Transfer from a manual/previous owner cannot retain its frame.
 const presenter=createR1StayPresenter(plan);
 return Object.freeze({
  sampleAt:presenter.sampleAt,
  invalidate(){setVisible(false);},
  drawAt({serverNow,geometry,rows,drawingEnabled=true,presentation=null,forcePausedRedraw=false}={}){
   // Invalidate first, so sampling, validation, placement or render exceptions
   // cannot leave the previous actor frame visible.
   setVisible(false);
   const result=presenter.sampleAt(serverNow,geometry,rows);
   if(!drawingEnabled||result.code)return {...result,drawn:false,presentationVisible:visible};
   if(!geometry||!Array.isArray(rows))return {...result,code:'R1_STAY_CURRENT_LAYOUT_UNAVAILABLE',drawn:false,presentationVisible:visible};
   const world=result.phase==='not-arrived'?presenter.plan.initial:presenter.plan.final;
   const sample=result.sample??{world,startsFromSettled:true,styleFrame:96,anticipationU:1,settleU:1,intention:result.phase};
   renderer.setCanonicalPlacements(rows,{selectedSlotId:presenter.plan.target.slotId});
   const drawn=renderer.renderDirect({sample,point:project(sample.world.root),visibility:result.sample?'both':'planter',presentation,forcePausedRedraw:forcePausedRedraw||!result.sample});
   if(drawn===true)setVisible(true); // Context loss/retirement returns false: stay hidden.
   return {...result,drawn:drawn===true,presentationVisible:visible};
  }
 });
}

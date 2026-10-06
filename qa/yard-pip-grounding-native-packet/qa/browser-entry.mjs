// Resolved only by the private build overlay; no production or URL activation.
import {createPipYardScene as createScene} from '../../src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs';
import {createPipGroundingBrowserProbe,GROUNDING_RECIPE} from '../../tests/yard-pip-grounding-browser-probe.mjs';
export function createPipYardScene(canvas,options){
  if(!options.canonicalItems||window.__yardGroundingNative)throw Error('One canonical grounding owner required');
  const probe=createPipGroundingBrowserProbe(),scene=createScene(canvas,{...options,rendererFactory:probe.rendererFactory});
  let held=false,retired=false;
  window.__yardGroundingNative=Object.freeze({
    snapshot:()=>({scene:scene.diagnostics(),probe:probe.diagnostics(),held,retired}),
    choose:mode=>probe.choose(mode),beginTrace:()=>probe.beginTrace(),motion:()=>probe.motion(),
    hold(){const s=scene.diagnostics();if(!s.ready||!s.settled||s.viewportBlocked||s.itemEditing||s.canonicalRecords?.length!==2||s.lastFrame?.visibility!=='both'||s.renderer.propInstances.filter(p=>p.visible&&!p.ghost).length!==2)throw Error('Hold requires actual settled Pip and both current T2 instances');held=true;return probe.hold({selectedSlotId:s.selectedCanonicalSlotId});},
    render:mode=>probe.render(mode),readRows:(mode,y,rows,isolation=null)=>probe.readHeldRows(mode,y,rows,isolation),
    async cost(){const rows=[];for(const mode of ['baseline',GROUNDING_RECIPE.id]){for(let n=0;n<3;n++)probe.render(mode);const samples=[];for(let n=0;n<20;n++){await new Promise(requestAnimationFrame);const before=probe.diagnostics().renderer.copies;const r=probe.render(mode);samples.push({metrics:r.metrics,calls:r.rendererInfo.calls,triangles:r.rendererInfo.triangles,copies:r.diagnostics.copies-before});}rows.push({mode,warmups:3,measured:20,samples});}probe.render('baseline');return {rows,GPUCompletionMeasured:false,compositorCompletionMeasured:false,realDeviceCostMeasured:false,method:'Same-owner CPU submission only; no screenshots/readback/downloads inside timed intervals'};},
    async dispose(){await scene.dispose();retired=true;return {probe:probe.diagnostics(),directCanvases:options.directHost.querySelectorAll('canvas').length};},
  });return scene;
}

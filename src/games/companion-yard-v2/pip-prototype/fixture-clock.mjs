/** Local visual-fixture time only. No server, save, reward or economic clock. */
export function createFixtureClock({now=()=>performance.now()}={}){
  let accumulated=0,anchor=now(),disposed=false;
  const reasons=new Set();
  const valueAt=at=>accumulated+(!disposed&&reasons.size===0?Math.max(0,at-anchor):0);
  return{
    read(){return valueAt(now());},
    reset(){if(disposed)throw Error('Fixture clock is disposed');accumulated=0;anchor=now();},
    setReason(reason,active){
      if(disposed)return;
      if(!['hidden','blur','context-lost','ready','viewport','item-editor','canonical-unavailable','canonical-idle','planning','canonical-stalled','food-version-change'].includes(reason))throw Error('Unknown fixture pause reason');
      const at=now();
      if(active){
        if(reasons.has(reason))return;
        if(reasons.size===0)accumulated=valueAt(at);
        reasons.add(reason);
      }else{
        if(!reasons.delete(reason))return;
        if(reasons.size===0)anchor=at;
      }
    },
    dispose(){if(disposed)return;accumulated=valueAt(now());disposed=true;reasons.clear();},
    get paused(){return disposed||reasons.size>0;},
    get reasons(){return[...reasons];},
    get disposed(){return disposed;}
  };
}

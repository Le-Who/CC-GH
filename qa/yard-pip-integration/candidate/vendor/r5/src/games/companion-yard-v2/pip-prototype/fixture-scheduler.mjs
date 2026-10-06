/** One outstanding RAF at most. Settled or paused routes do not keep a loop.
 * A resize can request one frozen redraw while paused. Resuming invalidates
 * once, even when the route already settled; it never advances paused time.
 */
export function createFixtureScheduler({draw,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
  let pending=null,disposed=false,paused=false,reason='initial',frozenRedraw=false;
  const counts={requested:0,cancelled:0,callbacks:0};
  function schedule(){
    if(disposed||pending!==null||(paused&&!frozenRedraw))return;
    pending=requestFrame(tick);counts.requested++;
  }
  function tick(timestamp){
    pending=null;if(disposed)return;
    if(paused&&!frozenRedraw)return;
    const currentReason=reason;frozenRedraw=false;counts.callbacks++;
    const moving=draw({timestamp,reason:currentReason,paused})===true;
    if(moving&&!paused&&!disposed){reason='motion';schedule();}
  }
  return{
    invalidate(why='change',{whilePaused=false}={}){if(disposed)return;reason=why;frozenRedraw||=whilePaused;schedule();},
    cancelPending(){if(disposed)return;if(pending!==null){cancelFrame(pending);pending=null;counts.cancelled++;}frozenRedraw=false;},
    setPaused(value){
      if(disposed)return;const next=Boolean(value);if(next===paused)return;paused=next;
      if(paused){if(pending!==null){cancelFrame(pending);pending=null;counts.cancelled++;}frozenRedraw=false;}
      else{reason='resume';schedule();}
    },
    dispose(){if(disposed)return;disposed=true;if(pending!==null){cancelFrame(pending);pending=null;counts.cancelled++;}},
    get state(){return{pending:pending!==null,paused,disposed,...counts};}
  };
}

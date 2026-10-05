/** All presentation owners submit together exactly once. Encoded future bytes
 * overlap network; decoded future pages remain subject to R5's one reservation. */
export function createAggregateScheduler({atlas,encoded,bridge}) {
 let ticks=0;
 const request=r=>{const translated=bridge.translate(r);return atlas.request(translated.clip,translated.index);};
 return {prepare(owners,at){const required=[],future=[];
  for(const {presenter,plan} of owners){const hints=presenter.pageRequests(plan,at,{horizonMs:1000,maxFuturePages:3});
   required.push(...hints.required);future.push(...hints.lookahead);}
  future.sort((a,b)=>(a.neededAt??Infinity)-(b.neededAt??Infinity));
  encoded.prepare([...required,...future].map(request));
  // The same aggregate demand reaches the shared atlas. One nearest decoded
  // future owner is enough; later pages stay encoded, not silently decoded.
  bridge.prepare(required,future.slice(0,1));ticks++;
  return {required,future,prepareCalls:ticks};},get ticks(){return ticks;}};
}

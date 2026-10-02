/** Read-only evidence checks. Active-episode metrics must not be read from a new page. */
export function assessEpisodeTiming(completedSnapshot){
 const t=completedSnapshot?.timing,waitEnds=t?.events?.filter(e=>e.type==='media-wait-end')||[];
 const details={source:'completed active-page snapshot, before gift-persistence reload',episodeComplete:completedSnapshot?.episodeComplete===true,timingPresent:!!t,eventCount:t?.events?.length,eventLimit:t?.eventLimit,atlasLoads:t?.stats?.atlasLoads,waitEnds:waitEnds.map(e=>({durationMs:e.durationMs,clockHeld:e.clockHeld})),stats:t?.stats||null};
 const passed=details.episodeComplete&&!!t&&Array.isArray(t.events)&&t.events.length<=t.eventLimit&&t.stats.atlasLoads>0&&waitEnds.every(e=>e.clockHeld===true);
 return{passed,details};
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function replayPreservation(beforeText,retainedText){
 try{const before=JSON.parse(beforeText),after=JSON.parse(retainedText),a=before.payload,b=after.payload;
  const oldClock=a?.clock?.screenMs,newClock=b?.clock?.screenMs;
  const complete=a?.episodeComplete===true&&b?.episodeComplete===true;
  const clockMonotonic=Number.isSafeInteger(oldClock)&&Number.isSafeInteger(newClock)&&newClock>=oldClock;
  const normalize=record=>({...record,sha256:'presentation-clock-dependent-digest',payload:{...record.payload,clock:{...record.payload.clock,screenMs:0}}});
  const allOtherDataEqual=canonical(normalize(before))===canonical(normalize(after));
  return{passed:complete&&clockMonotonic&&allOtherDataEqual,complete,clockMonotonic,allOtherDataEqual,oldClock,newClock};
 }catch(error){return{passed:false,error:String(error)}}
}

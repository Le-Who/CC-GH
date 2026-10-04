/** Owned, memory-only acceptance fixtures. No production/player route or PG.
 * Only the loopback CI server imports this behind an explicit test opt-in.
 * HTTP callers cannot provide time, profiles, seeds, probabilities or outcomes. */
import '../tests/yard-inventory-only-loader.mjs';
import assert from 'node:assert/strict';
import {createEightAcceptanceOptions} from '../tests/fixtures/yard-eight-canonical/acceptance.mjs';
import {nativePlayer,NOW} from '../tests/helpers/yard-eight-domain-fixtures.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
export function createNativeGameplayRuntime(fixture){
 const options=createEightAcceptanceOptions(),cases=new Map(),descriptors={...fixture.actors,...fixture.extraWitnesses};
 const send=(res,status,body)=>res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(body));
 function getCase(id){
  if(!Object.hasOwn(descriptors,id))throw Error('Exact owned native fixture required');if(cases.has(id))return cases.get(id);
  const witness=descriptors[id],actor=id==='mochi110'?'mochi':id,p=nativePlayer(actor,{id:witness.seed});
  // These are exact native initial placements, before the authoritative one use.
  p.yard.placedGoodies=witness.snapshot.yard.placedGoodies.map(row=>({...structuredClone(row),uses:row.uses-1,condition:'new'}));
  const origin=witness.record.arrivedAt;
  for(const now of [NOW,origin])assert.equal(ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options}).status,200);
  const records=Object.values(p._yardV2.runtime.visits);assert.equal(records.length,1);assert.equal(records[0].visitId,witness.record.visitId);assert.equal(records[0].leavesAt,witness.record.leavesAt);assert.equal(records[0].mediaAdmission.plan.clipId,witness.record.mediaAdmission.plan.clipId);
  const c={id,p,origin,end:witness.record.leavesAt,started:null,actionId:`yard-v2:native-full-gameplay-${id}`};cases.set(id,c);return c;
 }
 const time=c=>c.origin+(c.started===null?0:Math.floor(performance.now()-c.started));
 function snapshot(c){const at=time(c);assert.equal(ensurePersistentPlayerYard(c.p,{now:at,simulate:true,...options}).status,200);return{scope:'Actual native domain service, owned memory fixture; no PostgreSQL/player activation proof.',id:c.id,started:c.started!==null,origin:c.origin,end:c.end,serverNow:at,snapshot:{yard:structuredClone(c.p.yard),yardRuntime:publicPersistentYard(c.p,{now:at,...options})}};}
 return async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),id=url.searchParams.get('id');
  if(url.searchParams.size!==1||!id)return send(res,400,{error:'Exact fixture id only; client clocks and overrides forbidden'});
  const c=getCase(id);
  if(req.method==='GET'&&url.pathname==='/__yard_live__/snapshot')return send(res,200,snapshot(c));
  if(req.method==='POST'&&url.pathname==='/__yard_live__/start'){if(c.started===null)c.started=performance.now();return send(res,200,snapshot(c));}
  if(req.method==='POST'&&url.pathname==='/__yard_live__/collect'){
   const before=snapshot(c);if(before.serverNow<c.end)return send(res,409,{error:'Native visit is still active'});
   const result=executePersistentYardAction(c.p,'yard.collectGifts',{}, {...options,now:before.serverNow,actionId:c.actionId});
   return send(res,result.status,{result,snapshot:snapshot(c)});
  }
  return send(res,405,{error:'Only exact owned snapshot/start/collect acceptance operations'});
 }catch(e){send(res,500,{error:String(e.stack||e)});}};
}

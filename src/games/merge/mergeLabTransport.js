import {MERGE_LAB_CATALOG} from '../../../game-logic/merge-lab-catalog.js';
import {createMergeLabAction,hashCanonical} from '../../../game-logic/merge-lab-domain.js';

/** Authenticated API transport; never applies local economic outcomes or manufactures success.
 * One persisted pending command keeps identical epoch, nonce, revision, hash and quote on retry,
 * including after reload. The UI must resolve this command before enabling another action.
 */
export function createMergeLabTransport({api,getSnapshot,getAccountSession,applySnapshot,refreshSnapshot,storage,accountId,catalog=MERGE_LAB_CATALOG}){
  if(!accountId)throw new Error('Authenticated account identity required');
  const key=`game_hub_merge_pending_v1:${accountId}`;
  const accountSession=getAccountSession?.();
  const isCurrent=()=>getSnapshot()?.player?.id===accountId&&(!getAccountSession||getAccountSession()===accountSession);
  const assertCurrent=()=>{if(!isCurrent())throw Object.assign(new Error('Workshop account session changed'),{code:'ACCOUNT_CHANGED'});};
  const settled=new Map();
  let inFlight=null;
  let pending=null;
  const saved=storage?.getItem(key);
  if(saved){
    pending=JSON.parse(saved);
    if(pending.accountId!==accountId||typeof pending.requestId!=='string'||!pending.payload?.command)throw new Error('Invalid saved workshop request');
  }
  const save=record=>{
    if(!storage)throw new Error('Workshop retry storage is unavailable');
    storage.setItem(key,JSON.stringify(record)); // Persist before sending any debit/grant request.
    pending=record;
  };
  const clear=()=>{
    storage.removeItem(key);
    pending=null;
  };
  const snapshot=()=>{
    assertCurrent();
    const current=getSnapshot();
    if(current?.player?.id!==accountId||current.merge?.schemaVersion!==3||!current.merge.serverEpoch)throw new Error('A confirmed workshop snapshot is required');
    return current;
  };
  function acceptSnapshot(next){
    assertCurrent();
    if(!next)return getSnapshot();
    if(next.player?.id!==accountId)throw new Error('Unexpected account in workshop reply');
    const current=getSnapshot();
    const oldSequence=Number(current?.player?.syncSeq ?? -1);
    const nextSequence=Number(next.player?.syncSeq ?? -1);
    if(nextSequence>=oldSequence)applySnapshot(next);
    return getSnapshot();
  }
  async function send(record){
    assertCurrent();
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const response=await api('/api/player/mutate',{accountId,action:'merge.lab',payload:record.payload},{isCurrent});
      assertCurrent();
      if(response?.error==='ACCOUNT_CHANGED')throw Object.assign(new Error('Workshop account session changed'),{code:'ACCOUNT_CHANGED'});
      const result=response?.mergeLab;
      if(!result||typeof result.ok!=='boolean'||result.ok&&!response.snapshot)throw new Error('No confirmed workshop transaction envelope');
      let confirmedPlayer=acceptSnapshot(response.snapshot);
      if(!result.ok&&refreshSnapshot){
        const fresh=await refreshSnapshot();
        assertCurrent();
        if(fresh?.merge)confirmedPlayer=acceptSnapshot(fresh);
      }
      const outcome={...result,player:confirmedPlayer};
      clear();
      settled.set(record.requestId,{inputHash:record.inputHash,outcome});
      return outcome;
    })();
    try{return await inFlight;}finally{inFlight=null;}
  }
  return {
    hasPending:()=>!!pending,
    pendingRequestId:()=>pending?.requestId??null,
    resumePending:()=>pending?send(pending):Promise.resolve(null),
    async onAction(type,parameters,{requestId}={}){
      assertCurrent();
      if(typeof requestId!=='string'||!requestId)throw new Error('A stable caller request ID is required');
      const inputHash=hashCanonical({type,parameters});
      const prior=settled.get(requestId);
      if(prior){
        if(prior.inputHash!==inputHash)throw new Error('Workshop request ID was reused with different input');
        return prior.outcome;
      }
      if(pending){
        if(pending.requestId!==requestId||pending.inputHash!==inputHash)throw new Error('Resolve the pending workshop action first');
        return send(pending);
      }
      const current=snapshot();
      const command=createMergeLabAction(current,type,parameters,catalog,{actionId:requestId});
      const record={accountId,requestId,inputHash,payload:{command,expectedMergeEpoch:current.merge.serverEpoch}};
      save(record);
      return send(record);
    },
    async getQuote(type,parameters){
      assertCurrent();
      if(pending)throw new Error('Resolve the pending workshop action first');
      const current=snapshot();
      const response=await api('/api/merge/lab/quote',{accountId,type,parameters,expectedMergeEpoch:current.merge.serverEpoch},{isCurrent});
      assertCurrent();
      if(!response?.quote)throw Object.assign(new Error(response?.error||'No confirmed quote'),{code:response?.code});
      if(response.quote.serverEpoch!==current.merge.serverEpoch)throw Object.assign(new Error('Workshop save changed'),{code:'MERGE_EPOCH_CONFLICT'});
      return response.quote;
    },
  };
}

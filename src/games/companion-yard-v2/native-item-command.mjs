/** UI intent only. The scene retains pose, route, resources and admission. */
export function createNativeItemCommand({readContext,publish}){
 let active=null,sequence=0,disposed=false,state={phase:'idle'};
 const busy=()=>!!active;
 const same=(a,b)=>!!b&&a.renderer===b.renderer&&a.accountId===b.accountId&&a.accountSession===b.accountSession&&a.slotId===b.slotId&&a.ownerId===b.ownerId&&a.layoutKey===b.layoutKey;
 const emit=value=>{state=value;if(!disposed)publish({...value});};
 function cancel(reason='SELECTION_CHANGED'){
  const old=active;if(!old)return false;active=null;
  old.renderer.cancelMikaItemArrival?.({ownerId:old.ownerId,actionId:old.actionId,commandToken:old.commandToken,reason});
  emit({phase:'cancelled',requestId:old.requestId,slotId:old.slotId,ownerId:old.ownerId,reason});return true;
 }
 function sync(){if(active&&!same(active,readContext()))cancel('SELECTION_CHANGED');}
 async function request(){
  if(disposed)return{ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'};
  sync();if(active)return{ok:false,reason:'NATIVE_ACTOR_NOT_SETTLED'};
  const context=readContext();
  if(!context?.slotId||!context.renderer||!context.native?.available)return{ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'};
  if(context.native.phase!=='parked')return{ok:false,reason:'NATIVE_ACTOR_NOT_SETTLED'};
  const command=active={...context,requestId:++sequence,commandToken:Object.freeze({}),actionId:context.native.actionsStarted};
  emit({phase:'planning',requestId:command.requestId,slotId:command.slotId,ownerId:command.ownerId});
  let result;
  try{command.renderer.update?.(command.snapshot,{accountSession:command.accountSession});result=await command.renderer.requestMikaItemArrival(command.slotId,{ownerId:command.ownerId,accountId:command.accountId,accountSession:command.accountSession,commandToken:command.commandToken});}
  catch{result={ok:false,reason:'NATIVE_ACTION_UNAVAILABLE'};}
  if(result?.ok)command.actionId=result.action;
  if(disposed||active!==command)return{ok:false,reason:'NATIVE_ACTION_CANCELLED'};
  if(!same(command,readContext())){cancel('SELECTION_CHANGED');return{ok:false,reason:'NATIVE_ACTION_CANCELLED'};}
  if(!result?.ok){active=null;emit({phase:result?.reason==='ALREADY_ARRIVED'?'already':'refused',requestId:command.requestId,slotId:command.slotId,ownerId:command.ownerId,reason:result?.reason||'NATIVE_ACTION_UNAVAILABLE'});return result;}
  command.actionId=result.action;
  emit({phase:'moving',requestId:command.requestId,slotId:command.slotId,ownerId:command.ownerId});return result;
 }
 function observe(native){
  sync();if(!active)return;
  if(!native||native.ownerId!==active.ownerId||!native.available){cancel('NATIVE_OWNER_RETIRED');return;}
  if(state.phase==='moving'&&native.actionsStarted===active.actionId&&native.phase==='parked'&&native.presentedAction===active.actionId&&native.presentedTime>=native.duration){
   const done=active;active=null;emit({phase:'arrived',requestId:done.requestId,slotId:done.slotId,ownerId:done.ownerId});
  }
 }
 return{request,sync,observe,cancel,busy,state:()=>({...state}),dispose(){if(disposed)return;disposed=true;cancel('SCENE_DISPOSED');}};
}

export function nativeItemLayoutKey(snapshot){
 return JSON.stringify([snapshot?.yard?.remodel,(snapshot?.yard?.placedGoodies??[]).map(p=>[p.slotId,p.goodieId,p.x,p.y,p.rotationZ??0,p.condition]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
}

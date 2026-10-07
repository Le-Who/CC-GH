/** Source daily-letter receipts retain one increasing stamp per UTC date.
 * Validate the current pointer against them; source actions remain the writer. */
import {digest,integer} from './util.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function canonicalDailyLetterClaimsValid(player,{now}={}){
 try{
  const letter=player.yard.dailyLetter,date=letter?.lastClaimedDate,receipts=player._yardV2.runtime.commandReceipts;
  const today=new Date(now).toISOString().slice(0,10);
  if(!integer(now)||!object(letter)||!integer(letter.stamps)||!object(receipts)||(date===null?letter.stamps!==0:
   typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||letter.stamps<1||date>today
   ||!Number.isFinite(Date.parse(date+'T00:00:00.000Z'))||new Date(date+'T00:00:00.000Z').toISOString().slice(0,10)!==date))return false;
  const awards=new Map();
  for(const [id,r] of Object.entries(receipts))if(r?.action==='yard.claimDailyLetter'||object(r?.extras)&&(Object.hasOwn(r.extras,'stamps')||Object.hasOwn(r.extras,'reward'))){
   if(!object(r)||r.action!=='yard.claimDailyLetter'||r.format!=='yard-action-receipt/v1'||r.actionId!==id||!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(id)
    ||!integer(r.at)||r.at>now||![200,400,409].includes(r.status)||typeof r.requestHash!=='string'||!/^[a-f0-9]{64}$/.test(r.requestHash))return false;
   if(r.status!==200){if(r.extras?.stamps!==undefined||r.extras?.reward!==undefined)return false;continue;}
   const stamp=r.extras?.stamps;
   if(Object.hasOwn(r,'error')||!integer(stamp)||stamp<1||awards.has(stamp)
    ||digest(r.extras?.reward)!==digest({treats:35,shinyTreats:stamp%5===0?1:0}))return false;
   awards.set(stamp,new Date(r.at).toISOString().slice(0,10));
  }
  if(awards.size!==letter.stamps)return false;
  let previous=null;
  for(let stamp=1;stamp<=awards.size;stamp++){const next=awards.get(stamp);if(!next||previous!==null&&next<=previous)return false;previous=next;}
  return date===previous;
 }catch{return false;}
}

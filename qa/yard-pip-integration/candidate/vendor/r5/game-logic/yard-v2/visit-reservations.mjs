/** Presentation occupancy is half-open in server milliseconds. Route envelopes
 * belong to their leg, not the whole economic stay. Flat legacy plans remain
 * conservatively reserved for the full stay; they are never rewritten. */
import {overlaps} from './geometry.mjs';

const validBox=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
const sameBox=(a,b)=>validBox(a)&&validBox(b)&&['x','y','width','height'].every(k=>a[k]===b[k]);
export const timeOverlaps=(a,b)=>a.startMs<b.endMs&&a.endMs>b.startMs;

export function visitReservations(record) {
 const plan=record?.mediaAdmission?.plan||record||{};
 const startMs=Number.isSafeInteger(record?.arrivedAt)?record.arrivedAt:
  Number.isSafeInteger(plan.arrivalAt)?plan.arrivalAt:
  Number.isSafeInteger(plan.schedule?.arrivalAt)?plan.schedule.arrivalAt:-Number.MAX_SAFE_INTEGER;
 const endMs=Number.isSafeInteger(record?.leavesAt)?record.leavesAt:
  Number.isSafeInteger(plan.schedule?.leavesAt)?plan.schedule.leavesAt:Number.MAX_SAFE_INTEGER;
 const boxes=plan.reservationBoxes||record?.reservationBoxes||[],timed=plan.reservations;
 // Require a complete geometric multiset before trusting timing. Duplicate
 // geometry can belong to distinct legs, so matching a set would lose one.
 // Missing, partial or malformed timing cannot silently drop a known envelope.
 const unmatched=Array.isArray(boxes)?[...boxes]:[];
 if(Array.isArray(timed)&&timed.length>0&&Array.isArray(boxes)&&timed.length===boxes.length
  &&timed.every(r=>Number.isSafeInteger(r?.startMs)&&Number.isSafeInteger(r?.endMs)
   &&r.startMs>=startMs&&r.endMs<=endMs&&r.startMs<r.endMs&&(()=>{
    const index=unmatched.findIndex(b=>sameBox(r.rect,b));if(index<0)return false;unmatched.splice(index,1);return true;
   })()))return timed;
 return Array.isArray(boxes)?boxes.map(rect=>({startMs,endMs,rect})):[];
}

export function presentationReservationsConflict(proposed,record) {
 return visitReservations(record).some(old=>proposed.some(next=>timeOverlaps(next,old)&&overlaps(next.rect,old.rect)));
}

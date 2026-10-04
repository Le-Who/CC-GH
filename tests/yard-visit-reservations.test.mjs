import test from 'node:test';
import assert from 'node:assert/strict';
import {visitReservations,presentationReservationsConflict,timeOverlaps} from '../game-logic/yard-v2/visit-reservations.mjs';
const box={x:20,y:30,width:10,height:10};
const row=(startMs,endMs,rect=box)=>({startMs,endMs,rect});
const record=rows=>({arrivedAt:0,leavesAt:100,mediaAdmission:{plan:{reservations:rows,reservationBoxes:rows.map(r=>r.rect)}}});
test('half-open occupancy rejects only simultaneous time and spatial overlap',()=>{
 const old=record([row(10,20)]);
 for(const range of[[0,10],[20,30],[90,100]])assert.equal(presentationReservationsConflict([row(...range)],old),false);
 for(const range of[[0,11],[10,20],[19,100]])assert.equal(presentationReservationsConflict([row(...range)],old),true);
 assert.equal(presentationReservationsConflict([row(10,20,{...box,x:31})],old),false);
 assert.equal(timeOverlaps(row(10,20),row(20,30)),false);
});
test('missing or incomplete temporal occupancy falls back to every whole-stay legacy box',()=>{
 const old=record([row(10,20),row(80,90,{...box,x:40})]),before=JSON.stringify(old);
 assert.equal(presentationReservationsConflict([row(50,60)],old),false);
 for(const mutate of[p=>delete p.reservations,p=>p.reservations=[],p=>p.reservations.pop(),p=>p.reservations[0].startMs=NaN,p=>p.reservations[0].endMs=101,p=>p.reservations[0].rect={...box,width:.1}]){
  const bad=structuredClone(old);mutate(bad.mediaAdmission.plan);
  assert.equal(presentationReservationsConflict([row(50,60)],bad),true);
  assert.equal(presentationReservationsConflict([row(50,60,{...box,x:40})],bad),true);
 }
 assert.equal(JSON.stringify(old),before);
});
test('repeated envelopes in disjoint phases retain exact timing across serialization',()=>{
 const old=record([row(10,20),row(80,90)]);
 assert.deepEqual(visitReservations(old),old.mediaAdmission.plan.reservations);
 assert.equal(presentationReservationsConflict([row(50,60)],JSON.parse(JSON.stringify(old))),false);
 const incomplete=structuredClone(old);incomplete.mediaAdmission.plan.reservations.pop();
 assert.equal(presentationReservationsConflict([row(50,60)],incomplete),true,'a missing duplicate envelope cannot pass as a complete set');
 const flat={arrivedAt:0,leavesAt:100,reservationBoxes:[box]};
 assert.equal(presentationReservationsConflict([row(50,60)],flat),true);
 assert.equal(presentationReservationsConflict([row(100,110)],flat),false);
});

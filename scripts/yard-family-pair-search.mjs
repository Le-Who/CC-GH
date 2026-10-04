/** Bounded actual-source layout search; rejected layouts do not prove global impossibility. */
import '../tests/yard-inventory-only-loader.mjs';import {readFile,writeFile} from 'node:fs/promises';
import {createEightAcceptanceOptions} from '../tests/fixtures/yard-eight-canonical/acceptance.mjs';
import {candidate,EIGHT_FIXTURE_SPECS,NOW,H} from '../tests/helpers/yard-eight-domain-fixtures.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {validateLayout,footprint,overlaps} from '../game-logic/yard-v2/geometry.mjs';
import {visitReservations,timeOverlaps} from '../game-logic/yard-v2/visit-reservations.mjs';
const o=createEightAcceptanceOptions(),policy=createAdmissionPolicy(o),fixture=JSON.parse(await readFile(new URL('../recovery-tools/yard-canonical-eight-qa/fixture.json',import.meta.url))),ids=Object.keys(EIGHT_FIXTURE_SPECS);
const pool=[[62,30],[30,44],[40,40],[55,35],[70,44],[40,68],[60,65],[75,55],[55,78],[30,58],[20,58],[65,36],[35,42],[55,48],[60,35],[50,65],[60,40],[54,66],[50,50]],maxTrials=Number(process.env.YARD_PAIR_SEARCH_TRIALS||16);
const regionOffsets=Object.fromEntries(ids.map(id=>{const a=fixture.actors[id],p=a.record.mediaAdmission.plan,large=[...p.reservations].sort((a,b)=>(b.endMs-b.startMs)-(a.endMs-a.startMs))[0].rect;return[id,{x:large.x-p.initialPlacement.x,y:large.y-p.initialPlacement.y,width:large.width,height:large.height}];}));
const region=(id,p)=>({...regionOffsets[id],x:regionOffsets[id].x+p.x,y:regionOffsets[id].y+p.y});
const row=(id,slotId,pos)=>({slotId,goodieId:EIGHT_FIXTURE_SPECS[id].goodieId,x:pos[0],y:pos[1],uses:0,condition:'new',rotationZ:0});
const qFor=(id,yard,p,at)=>candidate(id,{yard,placement:p,at});
const record=(q,r)=>({visitorId:q.visitor.id,original:{visitorId:q.visitor.id},slotId:q.placement.slotId,arrivedAt:q.at,leavesAt:q.leavesAt,status:'active',mediaAdmission:r.binding});
const conflicts=(a,b)=>visitReservations(a).flatMap(x=>visitReservations(b).filter(y=>timeOverlaps(x,y)&&overlaps(x.rect,y.rect)).map(y=>({first:x,second:y})));
const result={scope:'28 species pairs in both orders for documented legal concrete layouts; bounded search exclusions are not global impossibility proof.',searchTrials:maxTrials,rows:[]};
for(let ai=0;ai<ids.length;ai++)for(let bi=ai+1;bi<ids.length;bi++){
 const a=ids[ai],b=ids[bi],pairs=[[[EIGHT_FIXTURE_SPECS[a].x,EIGHT_FIXTURE_SPECS[a].y],[EIGHT_FIXTURE_SPECS[b].x,EIGHT_FIXTURE_SPECS[b].y]],...pool.flatMap(x=>pool.map(y=>[x,y]))],attempts=[];let found;
 for(const [x,y]of pairs){
  const yard={remodel:'meadow',expansion:{level:1},placedGoodies:[row(a,'a-target',x),row(b,'b-target',y)]},[pa,pb]=yard.placedGoodies,ra=region(a,pa),rb=region(b,pb);
  // Exact source envelope offsets reject obvious static collisions cheaply.
  if(overlaps(ra,rb)||[ra,rb].some(r=>r.x<0||r.y<0||r.x+r.width>100||r.y+r.height>100)||overlaps(ra,footprint(pb,o.scene))||overlaps(rb,footprint(pa,o.scene))||[ra,rb].some(r=>o.scene.exclusions.some(e=>overlaps(r,e))))continue;
  const layout=validateLayout(yard,o.scene);if(!layout.ok)continue;
  const qa=qFor(a,yard,pa,NOW+H),qb=qFor(b,yard,pb,NOW+2*H),ar=policy(qa),br=ar.ok?policy(qb):{ok:false,code:'FIRST_NOT_READY'};attempts.push({positions:[x,y],first:ar.code||'ready',second:br.code||'ready'});
  if(ar.ok&&br.ok){found={yard,qa,qb,ar,br};break;}if(attempts.length>=maxTrials)break;
 }
 if(!found){const item={pair:[a,b],status:'NO_BOTH_READY_LAYOUT_FOUND_IN_BOUNDED_SEARCH',attempts};result.rows.push(item);console.log(JSON.stringify({pair:[a,b],status:item.status,attempts:attempts.length}));}
 else{
  const orders=[];for(const[first,second]of[[a,b],[b,a]]){const yard=structuredClone(found.yard),p=id=>yard.placedGoodies.find(r=>r.goodieId===EIGHT_FIXTURE_SPECS[id].goodieId&&(r.slotId===(id===a?'a-target':'b-target'))),q1=qFor(first,yard,p(first),NOW+H),one=policy(q1),old=record(q1,one),q2=qFor(second,yard,p(second),NOW+2*H),alone=policy(q2),next=record(q2,alone),shared=conflicts(old,next),out=policy({...q2,active:[old],reserved:[old]}),same=qFor(second,yard,p(second),NOW+H),sameAlone=policy(same),sameNext=sameAlone.ok?record(same,sameAlone):null,sameOut=policy({...same,active:[old],reserved:[old]});orders.push({first,second,status:out.ok?'ACCEPT':'REJECT',reason:out.code||null,conflicts:shared,sameHourStatus:sameOut.ok?'ACCEPT':'REJECT',sameHourReason:sameOut.code||null,sameHourConflicts:sameNext?conflicts(old,sameNext):[],firstPlan:old,secondAlone:next});}
  const item={pair:[a,b],yard:found.yard,status:'BOTH_SOURCE_READY',orders,attempts};result.rows.push(item);console.log(JSON.stringify({pair:[a,b],positions:found.yard.placedGoodies.map(p=>[p.x,p.y]),orders:orders.map(r=>({first:r.first,status:r.status,reason:r.reason,sameHourStatus:r.sameHourStatus}))}));
 }
 await writeFile(new URL('../recovery-tools/yard-canonical-eight-qa/pair-search-v4.json',import.meta.url),JSON.stringify(result)+'\n');
}

/** Concrete source-backed layouts only; no global impossibility claim. */
import '../tests/yard-inventory-only-loader.mjs';
import {writeFile} from 'node:fs/promises';
import {createEightAcceptanceOptions} from '../tests/fixtures/yard-eight-canonical/acceptance.mjs';
import {candidate,NOW,H} from '../tests/helpers/yard-eight-domain-fixtures.mjs';
import {createAdmissionPolicy} from '../game-logic/yard-v2/orchestrator.mjs';
import {validateLayout,overlaps} from '../game-logic/yard-v2/geometry.mjs';
import {visitReservations,timeOverlaps} from '../game-logic/yard-v2/visit-reservations.mjs';
const options=createEightAcceptanceOptions(),policy=createAdmissionPolicy(options);
const positions=[[[65,20],[85,20]],[[60,20],[84,20]],[[60,25],[84,25]],[[65,25],[87,25]],[[35,20],[65,20]],[[35,30],[65,30]],[[35,42],[55,48]],[[55,35],[80,35]],[[55,35],[80,48]],[[35,42],[80,35]],[[55,48],[80,25]],[[65,20],[65,66]],[[35,42],[65,36]],[[35,42],[70,44]],[[35,42],[70,35]],[[40,40],[70,44]],[[45,35],[70,50]],[[35,42],[70,48]],[[30,44],[70,44]],[[35,35],[65,36]],[[40,42],[70,42]]];
const report={scope:'Finite documented two-Fountain legal layout attempts with exact current R2 sources; rejected layouts are not a universal impossibility proof.',rows:[]};
for(const pair of positions){
 const yard={remodel:'meadow',expansion:{level:1},placedGoodies:pair.map(([x,y],i)=>({slotId:i?'b-target':'a-target',goodieId:'fountain_bowl',x,y,condition:'new',uses:0,rotationZ:0}))};
 const geometry=validateLayout(yard,options.scene),row={positions:pair,geometry:{ok:geometry.ok,errors:geometry.errors},orders:[]};
 if(geometry.ok)for(const[first,second]of[['basil','sage'],['sage','basil']]){
  const placement=id=>yard.placedGoodies[id==='basil'?0:1];
  const q=candidate(first,{yard,placement:placement(first)}),a=policy(q),s=candidate(second,{at:NOW+2*H,yard,placement:placement(second)}),alone=policy(s);
  if(!a.ok||!alone.ok){row.orders.push({first,second,firstReady:a.ok,firstReason:a.code,secondReady:alone.ok,secondReason:alone.code});continue;}
  const old={original:{visitorId:q.visitor.id},slotId:q.placement.slotId,arrivedAt:q.at,leavesAt:q.leavesAt,status:'active',mediaAdmission:a.binding};
  const next={original:{visitorId:s.visitor.id},slotId:s.placement.slotId,arrivedAt:s.at,leavesAt:s.leavesAt,mediaAdmission:alone.binding};
  const out=policy({...s,active:[old],reserved:[old]}),conflicts=visitReservations(old).flatMap(x=>visitReservations(next).filter(y=>timeOverlaps(x,y)&&overlaps(x.rect,y.rect)).map(y=>({old:x,next:y})));
  row.orders.push({first,second,status:out.ok?'ACCEPT':'REJECT',reason:out.code||null,conflicts,firstRecord:old,secondAlone:next});
 }
 report.rows.push(row);console.log(JSON.stringify({positions:pair,geometry:geometry.ok,orders:row.orders.map(({first,status,firstReason,secondReason,reason})=>({first,status,firstReason,secondReason,reason}))}));
 await writeFile(new URL('../recovery-tools/yard-canonical-eight-qa/two-fountain-search-v4.json',import.meta.url),JSON.stringify(report)+'\n');
}

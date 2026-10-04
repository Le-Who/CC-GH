import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEightAcceptanceOptions} from './fixtures/yard-eight-canonical/acceptance.mjs';
import {runSupportedPair} from './helpers/yard-native-supported-pair.mjs';
const options=createEightAcceptanceOptions();
const cases=[
 ['willow','mika',16683,'ACCEPT'],['willow','willow',85,'REJECT'],
 ['basil','mika',14,'REJECT'],['basil','basil',113,'REJECT'],
 ['sage','mika',40,'REJECT'],['sage','sage',4,'REJECT'],
];
for(const[actor,first,index,expectedStatus]of cases)test(`existing Mika mouse/chase: ${first} to ${first==='mika'?actor:'mika'}, native ${expectedStatus}`,()=>{
 const second=first==='mika'?actor:'mika',isWillow=actor==='willow',yard={remodel:'meadow',expansion:{level:1},placedGoodies:[
 {slotId:'a-target',goodieId:'yarn_mouse',x:isWillow?45:60,y:isWillow?45:65,rotationZ:0,condition:'new',uses:0},
 {slotId:'b-target',goodieId:isWillow?'moon_lamp':'fountain_bowl',x:isWillow?60:40,y:isWillow?65:40,rotationZ:0,condition:'new',uses:0},
 ]};
 const spec={yard,first,second,firstSlot:first==='mika'?'a-target':'b-target',secondSlot:first==='mika'?'b-target':'a-target',seed:`yard-native-mika-supported-${first}-${second}-${index}`,expectedStatus,expectedReason:expectedStatus==='REJECT'?'PRESENTATION_REGION_RESERVED':null};
 const witness=runSupportedPair(spec,options);assert.equal(Boolean(witness.secondRecord),expectedStatus==='ACCEPT');
 if(first==='mika'){assert.equal(witness.firstRecord.mediaAdmission.plan.clipId,'mika-mouse-r1');assert.equal(witness.snapshot.yard.placedGoodies[0].rotationZ,.1);assert.equal(witness.snapshot.yard.placedGoodies[0].uses,1);}
 else{assert.equal(witness.snapshot.yard.placedGoodies[0].rotationZ,0);assert.equal(witness.snapshot.yard.placedGoodies[0].uses,0);}
});

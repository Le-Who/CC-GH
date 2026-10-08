import {canonicalItemCapabilities} from '../../game-logic/yard-v2/canonical-locations.mjs';
import {canonicalFoodCapabilities} from '../../game-logic/yard-v2/canonical-food-contract.mjs';
import {CANONICAL_FOOD_NONCE_PREFIX} from '../../game-logic/yard-v2/canonical-food-protocol.mjs';
export const ARRIVAL=1000,LEAVES=2701000,RELEASE=2269000;
export function pickupSnapshot({id='pickup-owner',seq=10,now=RELEASE,removed=false,departed=false}={}){
 const row={slotId:'canonical:a',goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x:98,y:118,condition:'new',uses:1,placedAt:1};
 const original=canonicalItemCapabilities({canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:true});
 const plan={format:'yard-canonical-stay/v3',profile:'r1-peek-release84-neutral-rest/v1',visitId:'visit-pickup-wire',arrivedAt:ARRIVAL,releaseAt:RELEASE,leavesAt:LEAVES,inspectionPlan:{target:{...row}}};
 const cap={...original,protocol:'yard-canonical-saved-pickup-capability/v1',actions:['yard.pickupGoodie'],replayNoncePrefixes:[CANONICAL_FOOD_NONCE_PREFIX],
  pickupReadySlotIds:!removed&&!departed&&now>=RELEASE&&now<LEAVES?[row.slotId]:[],items:{leaf_pot:{...original.items.leaf_pot,place:false,move:false,pickup:true}}};
 return {player:{id,syncSeq:seq},serverTime:now,resources:{gold:100},garden:{plants:[]},gardenR2:null,merge:{schemaVersion:3,board:[],itemCounts:{}},
  yard:{placedGoodies:[],currencies:{treats:80,shinyTreats:3},foodInventory:{kibble:3},goodieInventory:{},bowls:[{id:'bowl-1',foodId:'kibble',servings:3,placedAt:1,expiresAt:7200000}]},
  yardRuntime:{version:1,storageVersion:3,canonicalVisitProtocol:'yard-canonical-authoritative/v1',status:'ready',mutable:false,serverNow:now,actionProtocol:'yard-v2:',
   canonicalFoodActions:{protocol:'yard-canonical-food-actions/v1',enabled:true,actions:['yard.buyFood','yard.setFood']},
   canonicalInventoryActions:{protocol:'yard-canonical-inventory-actions/v1',enabled:true,actions:['yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter']},
   canonicalPickupActions:{protocol:'yard-canonical-released-pickup-actions/v1',enabled:true,actions:['yard.pickupGoodie']},
   supportedActions:['yard.buyFood','yard.setFood','yard.buyGoodie','yard.collectGifts','yard.claimDailyLetter','yard.pickupGoodie'],
   supportedBindings:{goodies:{leaf_pot:{buy:true,pickup:true,place:false,move:false,fix:false}},foods:{kibble:{buy:true,set:true}},bowls:{'bowl-1':{set:true}}},
   canonicalPlacements:removed?[]:[row],canonicalVisits:departed?[]:[{visitId:plan.visitId,plan}],visits:[],targetReserved:now<RELEASE,
   foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true}),itemPlacementCapabilities:cap}};
}
export function pickupScene(snapshot){return {canonicalSavedVisits:true,canonicalItems:true,mutable:false,itemMutable:false,mediaReady:true,runtime:snapshot.yardRuntime,
 canonicalFood:{loading:false,reentryRequired:false,reserved:true,render:{available:true,state:'kibble'}},
 visualPrototype:{ready:true,canonicalSavedVisits:true,actorUnitsPerSource:16,restartPending:false,viewportBlocked:false,plannerWorkerActive:false,itemEditing:false,itemActionPending:false,pauseReasons:[],phase:'neutral-rest',savedVisit:{status:'ready',visitId:'visit-pickup-wire'}}};}

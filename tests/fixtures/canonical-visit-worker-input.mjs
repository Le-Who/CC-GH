export function request(ownerId='worker-owner'){
 return {ownerId,operation:'prepare',fence:{yardRevision:'yard-revision-1',layoutRevision:'layout-1',cursor:'opportunity:1000',reservationDigest:'0'.repeat(64)},input:{
  candidate:{visitId:'visit_v2_source_45',visitorId:'pip_hamster',goodieId:'leaf_pot',activityId:'peek',slotId:'canonical:a',arrivedAt:1000,leavesAt:2701000},
  rows:[{slotId:'canonical:a',goodieId:'leaf_pot',locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',itemGeometryRevision:'yard-succulent-T2',x:98,y:118,condition:'new',uses:0,placedAt:1}],
  bowl:{id:'bowl-1',foodId:'kibble',servings:4,placedAt:1,expiresAt:7200000},
 }};
}

/** Catalog semantics are exact baseline inputs. New art and Merge behaviors are separately authored. */
import * as legacy from './catalog.mjs';
import { deepFreeze, clone } from './util.mjs';
export const CATALOG_REVISION = 'yard-catalog-foundation/r1';
export const INTERACTION_FAMILIES = deepFreeze({
  'sniff-nibble': ['sniff','nibble'], 'play-roll': ['pounce','roll'],
  'sit-observe': ['sit','watch','listen','glow'], 'rest-stretch': ['nap','rest','curl','stretch'],
  'hide-peek': ['peek'], 'water-soak': ['soak'],
});
const familyFor = pose => Object.keys(INTERACTION_FAMILIES).find(id => INTERACTION_FAMILIES[id].includes(pose)) || 'unbound';
export const AUTHORED_MERGE_ADDITIONS = deepFreeze({
  alchemy_living_arbor: { id:'alchemy_living_arbor', name:'Living Arbor', source:'authored-addition/r1',
    legacyRecovered:false, enabled:false, acquisition:'merge-output-integer-count', size:'large',
    proposedCapacity:2, proposedFamilies:['rest-stretch','hide-peek'], proposedTags:['nap','quiet','fresh'],
    cost:null, fixCost:null, durability:null, activities:null, footprint:null,
    missing:['approved-behavior-values','authored-sockets-and-footprint','prop-art','species-interaction-media'],
    inventoryPolicy:'preserve-exact-count-no-auto-placement-no-guaranteed-visitor' },
  alchemy_echo_chimes: { id:'alchemy_echo_chimes', name:'Echo Chimes', source:'authored-addition/r1',
    legacyRecovered:false, enabled:false, acquisition:'merge-output-integer-count', size:'small',
    proposedCapacity:1, proposedFamilies:['sit-observe'], proposedTags:['quiet','night'],
    cost:null, fixCost:null, durability:null, activities:null, footprint:null,
    missing:['approved-behavior-values','authored-sockets-and-footprint','prop-art','species-interaction-media'],
    inventoryPolicy:'preserve-exact-count-no-auto-placement-no-guaranteed-visitor' },
});
export const MERGE_OUTPUT_BINDINGS = deepFreeze({
  night_beacon:'moon_lamp', listening_fountain:'fountain_bowl', dream_nest:'cloud_bed',
  living_arbor:'alchemy_living_arbor', echo_chimes:'alchemy_echo_chimes', stargazer_nook:'book_nook',
});
export const MERGE_OUTPUT_CONTRACT = deepFreeze({source:'recovered-Merge-v3-preview',
  input:['projectId','variantId','quantity','quote'], destination:'player.yard.goodieInventory[output.itemId]',
  operation:'additive-integer-count', projectCounter:'player.merge.projects.crafted[projectId]',
  placementRequired:true,visitorGranted:false,requiresYardV3:['alchemy_living_arbor','alchemy_echo_chimes'],
  grantOnMigration:false, projectCountsAreNotUnappliedReceipts:true, automaticCurrencyExchange:false});
export const CATALOG_BINDINGS = deepFreeze({
  revision:CATALOG_REVISION, baselineSha:legacy.BASELINE_SHA,
  foods:Object.fromEntries(Object.values(legacy.YARD_FOODS).map(food => [food.id, {
    id:food.id, source:'legacy-baseline', definition:clone(food), mediaStatus:food.id === 'kibble' ? 'preview-static' : 'unbound',
    runtimeKey:`foods.${food.id}`, durationClock:'authoritative-ms', remainingServings:'yard.bowls[].servings',
  }])),
  goodies:Object.fromEntries([...Object.values(legacy.YARD_GOODIES).map(goodie => [goodie.id, {
    id:goodie.id, source:'legacy-baseline', definition:clone(goodie),
    placementLimitSource:'expansion-level-8-or-14-not-slot-count', capacity:legacy.getYardGoodieCapacity(goodie),
    conditions:Object.fromEntries(['new','worn','broken'].map(condition => [condition, {
      profile:legacy.getYardConditionProfile(goodie,condition),
      activities:legacy.getYardGoodieActivities(goodie,condition).map(activity => ({...activity,family:familyFor(activity.pose)})),
    }])), mediaStatus:['yarn_mouse','sun_cushion'].includes(goodie.id) ? 'partial-mika-preview' : 'unbound',
    visualOwnership:legacy.getYardGoodieCapacity(goodie)>1 ? 'requires-layered-or-joint-choreography' : 'exclusive-composite-or-layered',
  }]), ...Object.values(AUTHORED_MERGE_ADDITIONS).map(def => [def.id,{id:def.id,source:def.source,definition:def,mediaStatus:'unbound',enabled:false}])]),
  visitors:Object.fromEntries(Object.values(legacy.YARD_VISITORS).map(visitor => [visitor.id, {
    id:visitor.id, source:'legacy-baseline', definition:clone(visitor), identity:visitor.id, rigFamily:visitor.species,
    mediaStatus:visitor.id==='mika_cat'?'two-interaction-preview':'unbound',
    locomotionRequired:['enter','walk','turn','align','leave'], interactionFamilies:[...new Set(visitor.poses.map(familyFor))],
    eligibility:visitor.requires ? clone(visitor.requires) : {matchingTags:true}, guaranteedVisit:false,
  }])),
  styles:Object.fromEntries(Object.values(legacy.YARD_REMODELS).map(style => [style.id, {
    id:style.id,source:'legacy-baseline',definition:clone(style),ownedField:'yard.ownedRemodels',
    activeField:'yard.remodel',placementPolicy:'preserve-saved-coordinates-or-reposition-needed',
    mediaStatus:style.id==='meadow'?'preview-scene':'unbound',
  }])),
  expansion:{definitions:clone(legacy.YARD_EXPANSIONS),placementLimits:clone(legacy.PLACEMENT_LIMITS),legacySlotLayouts:clone(legacy.YARD_SLOT_LAYOUTS)},
  balances:{yard:['treats','shinyTreats'],shared:['resources.gold','resources.gachaTokens'],merge:'merge.alchemyEssence',automaticExchange:false},
});
export function missingCatalogBindings() {
  return { visitors:Object.values(CATALOG_BINDINGS.visitors).filter(x=>x.mediaStatus==='unbound').map(x=>x.id),
    props:Object.values(CATALOG_BINDINGS.goodies).filter(x=>x.mediaStatus==='unbound').map(x=>x.id),
    foods:Object.values(CATALOG_BINDINGS.foods).filter(x=>x.mediaStatus==='unbound').map(x=>x.id),
    styles:Object.values(CATALOG_BINDINGS.styles).filter(x=>x.mediaStatus==='unbound').map(x=>x.id),
    partial:[{id:'mika_cat',missing:['other-props','worn-mouse-sniff','worn-cushion-stretch','long-stay-live-presentation']}],
    layeredCapacityTwo:Object.values(legacy.YARD_GOODIES).filter(g=>legacy.getYardGoodieCapacity(g)>1).map(g=>g.id) };
}

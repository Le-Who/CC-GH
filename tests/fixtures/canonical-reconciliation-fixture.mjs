import {selectOpportunity} from '../../game-logic/yard-v2/opportunity-selection.mjs';
import {YARD_GOODIES,getYardGoodieActivities} from '../../game-logic/yard-v2/catalog.mjs';
import {request} from './canonical-visit-worker-input.mjs';
export const row=request().input.rows[0],bowl=request().input.bowl;
export const selectedSeed=(()=>{for(let n=0;n<100000;n++){
 const seed='durable:'+n,selected=selectOpportunity({seed,at:1000,placed:row,goodie:YARD_GOODIES.leaf_pot,
  available:getYardGoodieActivities(YARD_GOODIES.leaf_pot,'new').sort((a,b)=>a.id.localeCompare(b.id)),bowls:[bowl]});
 if(selected?.visitor.id==='pip_hamster'&&selected.activity.id==='peek'&&selected.leavesAt===2701000)return seed;
}throw Error('NO_FIXTURE_SEED');})();
export function fixture(p){
 p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.bowls=[structuredClone(bowl)];
 p._yardV2={format:'yard-persistent/v1',version:3,runtime:{version:1,canonicalRevision:'fixture-initial',seed:selectedSeed,cursorMs:999,nextOpportunityAt:1000,
  visits:{},canonicalVisits:{},canonicalVisitReceipts:{},canonicalPlacements:[structuredClone(row)],giftLedger:{},commandReceipts:{},events:[]}};
}

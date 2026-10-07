/** Fresh-account constructor only. The account owner calls this instead of its
 * initial Yard construction, before persistence. No existing player/save input,
 * migration, reset, extra starter grant or admission is accepted here. */
import {createDefaultYardState} from '../yard.js';
import {YARD_HOUR_MS} from './catalog.mjs';
import {digest,integer} from './util.mjs';
export function createFreshCanonicalYard(ownerId,now){
 const next=(Math.floor(now/YARD_HOUR_MS)+1)*YARD_HOUR_MS;
 if(typeof ownerId!=='string'||!ownerId||ownerId.length>160||!integer(now)||!integer(next)||next>8640000000000000)throw Error('INVALID_NEW_CANONICAL_YARD_INPUT');
 return {yard:createDefaultYardState(now),_yardV2:{format:'yard-persistent/v1',version:3,runtime:{version:1,seed:ownerId,
  canonicalRevision:digest({ownerId,createdAt:now,format:'yard-fresh-canonical/v1'}),cursorMs:now,nextOpportunityAt:next,
  canonicalPlacements:[],canonicalVisits:{},canonicalVisitReceipts:{},visits:{},giftLedger:{},commandReceipts:{},actionReceipts:{},events:[]}}};
}

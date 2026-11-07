/** Reviewed, source-owned development availability. This is not production art
 * acceptance and does not add any actor, visit, reward or economic binding.
 * The image source selects this exact mode; HTTP fields, saved player data,
 * environment variables and display URLs cannot select or extend it. */
import {releaseActionPolicy} from './availability.mjs';
import {getYardServerOptions} from './yard-media.mjs';

export const YARD_DEVELOPMENT_RELEASE_POLICY=Object.freeze({
  revision:'yard-development-capabilities/20261006-r1',
  mode:'development-live',
  enabled:true,
  productionAccepted:false,
  canonicalVisitAdmission:false,
});

/** The policy parameter is a pure server-side seam for checking the closed
 * state. Ordinary released entrypoints always select the source policy above.
 * Only existing clock/receipt controls survive the release boundary. */
export function yardDevelopmentOptions({now,simulate,actionId}={},policy=YARD_DEVELOPMENT_RELEASE_POLICY) {
  const enabled=policy.enabled===true;
  return {now,simulate,actionId,
    canonicalItemPlacementEnabled:enabled,
    canonicalFoodLocationEnabled:enabled,
    actionPolicy:candidate=>enabled&&candidate.action==='yard.buyGoodie'&&candidate.payload.goodieId==='leaf_pot'
      ?{ok:true}
      :releaseActionPolicy({...candidate,mediaRegistry:getYardServerOptions().mediaRegistry}),
  };
}

/** Buying one catalog pot is a development capability, independent of whether
 * an actor interaction has passed its artistic admission gate. Ordinary action
 * validation still owns price, funds, quantity, inventory and durable receipts.
 * Existing binding metadata is preserved; it is not upgraded by this policy. */
export function yardDevelopmentSnapshot(runtime,policy=YARD_DEVELOPMENT_RELEASE_POLICY) {
  const enabled=policy.enabled===true;
  return {...runtime,developmentRelease:{revision:policy.revision,mode:enabled?policy.mode:'disabled',
    enabled,productionAccepted:false,canonicalVisitAdmission:false},
    ...(enabled&&runtime.mutable===true&&runtime.status==='ready'?{
      supportedBindings:{...runtime.supportedBindings,goodies:{...runtime.supportedBindings.goodies,
        leaf_pot:{...runtime.supportedBindings.goodies.leaf_pot,buy:true,developmentPurchase:true}}},
    }:{}),
  };
}

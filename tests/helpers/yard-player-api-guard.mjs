/** Test-only, fail closed before loading a server, browser, or database client. */
import {assertDisposableYardV2Database} from './yard-v2-pg-guard.mjs';
export const YARD_API_PORTS=Object.freeze({closed:3215,active:3216,activePeer:3217});
export function assertYardPlayerApiEnvironment(env=process.env){
  assertDisposableYardV2Database(env);
  if(env.YARD_PLAYER_API_TEST!=='1'||env.YARD_V2_PG_TARGET!=='integrated'||env.DEV_AUTH_ENABLED!=='true'||env.YARD_CANDIDATE_CI||env.YARD_PLAYER_WIRING_TEST){
    throw Error('Explicit disposable integrated Yard API test required; no overlays or inherited policy loader');
  }
}
export function assertYardPlayerFixture(externalId,accountId){
  if(!/^yard_player_api_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(externalId||''))throw Error('Only generated Yard API fixture identities may be touched');
  if(accountId!==undefined&&!/^acct:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(accountId))throw Error('Expected a canonical fixture account');
  return externalId;
}

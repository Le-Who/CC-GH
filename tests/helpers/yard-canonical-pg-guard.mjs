/** Test-only. Validate before importing application, PostgreSQL or server modules. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertDisposableYardV2Database} from './yard-v2-pg-guard.mjs';
import {assertYardPlayerApiEnvironment} from './yard-player-api-guard.mjs';

export const CANONICAL_PG_NOW=Date.UTC(2026,9,6,12),CANONICAL_PG_HOUR=3600000;
// Pin the reviewed source, never accept a runtime-provided digest or arbitrary replacement.
export const CANONICAL_PG_SOURCE_SHA256='95920c2c086631a3afe87492e204fbe5a56d7d34565ddf9774334fd90e818429';
export const CANONICAL_PG_DATA_SHA256=Object.freeze({
  'canonical-item-protocol.json':'8f098f5d32d70f2b06157967c094c24b04e955ba29a509181a1eb3e101be2dc4',
  'canonical-location-geometry.json':'13da6998467168a065adbc2431ead832d736cdea2c5067b25adfddb11cd040ba',
});
export function assertCanonicalPgData(name,source){
  if(!Object.hasOwn(CANONICAL_PG_DATA_SHA256,name)||createHash('sha256').update(source).digest('hex')!==CANONICAL_PG_DATA_SHA256[name])throw Error('Canonical descriptor or geometry changed: review and explicitly repin before acceptance');
}
export function assertCanonicalPgEnvironment(env=process.env,{api=false}={}) {
  assertDisposableYardV2Database(env);
  if(env.YARD_CANONICAL_PG_TEST!=='1'||env.YARD_V2_PG_TARGET!=='integrated')throw Error('Explicit integrated canonical PostgreSQL test required');
  if(Object.entries(env).some(([key,value])=>value&&(/^(PGHOST|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGSERVICE|PGSERVICEFILE|PGPASSFILE|PGOPTIONS|DOTENV_CONFIG_.*)$/.test(key))))throw Error('No inherited PostgreSQL or dotenv overrides permitted');
  if(api){
    assertYardPlayerApiEnvironment(env);
    if(env.YARD_CANONICAL_API_TEST!=='1')throw Error('Explicit isolated canonical API subprocess required');
  }else if(env.YARD_CANONICAL_API_TEST||env.YARD_PLAYER_API_TEST||env.YARD_PLAYER_WIRING_TEST)throw Error('PostgreSQL fixture must not inherit API or policy preload switches');
}
export function canonicalTestSource(source) {
  const closed='export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;';
  if(createHash('sha256').update(source).digest('hex')!==CANONICAL_PG_SOURCE_SHA256||source.split(closed).length!==2)throw Error('Canonical source changed: review and explicitly repin the closed source before acceptance');
  return source.replace(closed,'export const CANONICAL_ITEM_PLACEMENT_ENABLED = true;');
}
/** The IPC worker accepts only these finite fixture commands, never arbitrary actions. */
export function assertCanonicalPgCommand(command) {
  const {action,payload,clientActionId,now,operation}=command;
  if(operation==='canonical.advance'&&now===CANONICAL_PG_NOW+CANONICAL_PG_HOUR&&isDeepStrictEqual(payload,{})&&!action&&!clientActionId)return;
  if(operation!==undefined)throw Error('Unknown fixture operation');
  const uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
  if(['yard.placeGoodie','yard.moveGoodie','yard.pickupGoodie'].includes(action)&&now===CANONICAL_PG_NOW
    &&new RegExp(`^yard-v2:canonical-v1/pg-${uuid}$`).test(clientActionId||'')
    &&['canonical:pg-one','canonical:pg-two','canonical:pg-three','canonical:pg-four'].includes(payload?.slotId)
    &&[[98,118],[72,145],[88,172],[49,120]].some(([x,y])=>isDeepStrictEqual(payload,{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',slotId:payload.slotId,goodieId:'leaf_pot',x,y})))return;
  if(action==='match3.syncMode'&&now===CANONICAL_PG_NOW&&new RegExp(`^canonical-pg:match3:${uuid}$`).test(clientActionId||'')
    &&isDeepStrictEqual(payload,{savedModes:{classic:{score:7}}}))return;
  if(action==='yard.capturePhoto'&&now===CANONICAL_PG_NOW+CANONICAL_PG_HOUR&&new RegExp(`^yard-v2:pg-photo:${uuid}$`).test(clientActionId||'')
    &&isDeepStrictEqual(payload,{visitId:'canonical:pg-one'}))return;
  throw Error('Only finite canonical PostgreSQL fixture commands permitted');
}

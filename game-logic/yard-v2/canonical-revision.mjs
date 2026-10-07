/** ABA-safe Yard fence, maintained by the existing transaction owner. Unrelated
 * account writes and processed-through watermarks do not invalidate a route;
 * actual Yard-domain changes receive a fresh generation on the winning save.
 */
import {randomUUID} from 'node:crypto';
import {digest} from './util.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const newCanonicalRevision=()=>randomUUID();
function domain(player){
 const store=player?._yardV2,runtime=store?.runtime;
 if(store?.format!=='yard-persistent/v1'||store.version!==3||!object(runtime)||runtime.version!==1
  ||typeof runtime.canonicalRevision!=='string'||!runtime.canonicalRevision||runtime.canonicalRevision.length>160||!object(player.yard))return null;
 const yard={...player.yard},state={...runtime};
 delete yard.lastSimulatedAt;
 // Audit/nonce indexes and a no-event clock watermark cannot change actor
 // geometry, stock, target lifetime, visit identity or reservation ownership.
 for(const key of ['canonicalRevision','cursorMs','events','commandReceipts','actionReceipts'])delete state[key];
 return digest({yard,runtime:state});
}
export function captureCanonicalRevision(player){
 const fingerprint=domain(player);return fingerprint===null?null:{fingerprint,revision:player._yardV2.runtime.canonicalRevision};
}
export function stampCanonicalRevision(player,before){
 const fingerprint=domain(player);if(fingerprint===null)return false;
 if(!before||before.fingerprint!==fingerprint){player._yardV2.runtime.canonicalRevision=newCanonicalRevision();return true;}
 // Domain revision is owned here, not by an individual callback or payload.
 player._yardV2.runtime.canonicalRevision=before.revision;return false;
}

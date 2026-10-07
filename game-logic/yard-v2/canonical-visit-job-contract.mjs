/** Server-only transport. No compiler imports, simulation, permissions or writes. */
import {createHash} from 'node:crypto';
import manifest from './canonical-visit-worker-sources.json' with {type:'json'};

export const VISIT_JOB_PROTOCOL='yard-canonical-visit-worker/v2';
// Deliberately exhaustive, not a prefix match. These finite source searches have
// validated preparation inputs and cannot succeed for this exact source/key.
// No restore, validation, stock, source-integrity or execution failure qualifies.
export const VISIT_JOB_TERMINAL_PREPARE_CODES=Object.freeze([
 'R1_SAVED_NO_NEUTRAL_REST_ANCHOR',
 'R1_SAVED_REST_TIMING_UNAVAILABLE',
 'R1_STAY_TOO_SHORT_FOR_REAL_ROUTES',
]);
export const isTerminalVisitRefusal=(operation,sourceCode)=>operation==='prepare'&&VISIT_JOB_TERMINAL_PREPARE_CODES.includes(sourceCode);
export const VISIT_JOB_SOURCE_HASH=sha256(JSON.stringify(manifest));
export const VISIT_WORKER_SOURCES=Object.freeze(manifest.map(row=>Object.freeze(row)));
export function sha256(text){return createHash('sha256').update(text).digest('hex');}

export function freeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const item of Object.values(value))freeze(item);
  Object.freeze(value);
 }
 return value;
}

/** Bound traversal before cloning/serializing. Reject coercion, accessors, cycles,
 * non-JSON values and custom prototypes so key bytes mean exactly one snapshot. */
export function boundedJSON(value,maxBytes,{maxNodes=50000,maxDepth=48}={}){
 let bytes=0,nodes=0;const active=new Set();
 const add=text=>{bytes+=Buffer.byteLength(text);if(bytes>maxBytes)throw Error('INPUT_TOO_LARGE');return text;};
 function visit(v,depth){
  if(++nodes>maxNodes||depth>maxDepth)throw Error('INPUT_TOO_COMPLEX');
  if(v===null||typeof v==='boolean')return add(String(v));
  if(typeof v==='string'){if(v.length>maxBytes)throw Error('INPUT_TOO_LARGE');return add(JSON.stringify(v));}
  if(typeof v==='number'&&Number.isFinite(v))return add(JSON.stringify(v));
  if(!v||typeof v!=='object'||active.has(v))throw Error('INPUT_NOT_JSON');
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  if(!array&&proto!==Object.prototype&&proto!==null)throw Error('INPUT_NOT_JSON');
  const keys=Reflect.ownKeys(v);
  if(keys.length>maxNodes-nodes+1||keys.some(k=>typeof k!=='string'))throw Error('INPUT_TOO_COMPLEX');
  active.add(v);let result;
  if(array){
   if(keys.length!==v.length+1||v.length>maxNodes-nodes)throw Error('INPUT_NOT_JSON');
   const parts=[];add('[');for(let i=0;i<v.length;i++){
    if(i)add(',');const descriptor=Object.getOwnPropertyDescriptor(v,String(i));
    if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('INPUT_NOT_JSON');
    parts.push(visit(descriptor.value,depth+1));
   }add(']');result='['+parts.join(',')+']';
  }else{
   const parts=[];add('{');for(const key of keys.sort()){
    if(key.length>maxBytes)throw Error('INPUT_TOO_LARGE');
    const descriptor=Object.getOwnPropertyDescriptor(v,key);
    if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('INPUT_NOT_JSON');
    if(parts.length)add(',');const encodedKey=add(JSON.stringify(key)+':');
    parts.push(encodedKey+visit(descriptor.value,depth+1));
   }add('}');result='{'+parts.join(',')+'}';
  }
  active.delete(v);return result;
 }
 const json=visit(value,0);return {json,bytes,nodes};
}

const identity=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function snapshotRequest(request,maxBytes){
 const encoded=boundedJSON(request,maxBytes),snapshot=JSON.parse(encoded.json);
 if(!exactKeys(snapshot,['ownerId','fence','operation','input'])||!identity(snapshot.ownerId))throw Error('REQUEST_INVALID');
 if(!exactKeys(snapshot.fence,['yardRevision','layoutRevision','cursor','reservationDigest'])||!['yardRevision','layoutRevision','cursor'].every(k=>identity(snapshot.fence[k]))||!/^[a-f0-9]{64}$/.test(snapshot.fence.reservationDigest))throw Error('FENCE_INVALID');
 const keys=snapshot.operation==='prepare'?['candidate','rows','bowl']:snapshot.operation==='restore'?['record','rows','serverNow']:null;
 if(!keys||!exactKeys(snapshot.input,keys))throw Error('OPERATION_INVALID');
 if(snapshot.operation==='restore'&&(!Number.isSafeInteger(snapshot.input.serverNow)||snapshot.input.serverNow<0))throw Error('SERVER_TIME_INVALID');
 return {...encoded,ownerId:snapshot.ownerId,operation:snapshot.operation,key:sha256(VISIT_JOB_PROTOCOL+'\n'+VISIT_JOB_SOURCE_HASH+'\n'+encoded.json)};
}

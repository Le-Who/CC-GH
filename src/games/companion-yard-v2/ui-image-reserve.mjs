import inventory from './ui-image-inventory.json' with {type:'json'};
import {pageOwnerLedger} from './decoded-capacity.mjs';
export const UI_IMAGE_INVENTORY=inventory;
export function uiImageReserve(catalog=null,input=inventory){
 if(input.unresolved?.length)throw Error('UI image capacity is incomplete: '+input.unresolved.join(', '));
 const rows=[...input.rows];
 if(catalog){
  for(const row of [...Object.values(catalog.foods||{}),...Object.values(catalog.goodies||{}).flatMap(Object.values)]){
   const url=new URL(row.src,catalog.baseURL||'https://yard.invalid/assets/yard-scene45/').href;
   rows.push({url,owner:'dom-url:'+url,width:row.canvas?.[0],height:row.canvas?.[1]});
  }
 }
 const owners=pageOwnerLedger(rows.map(row=>row.url?resolveResourceOwner(row,catalog?.baseURL||defaultOrigin()):row));
 return{bytes:[...owners.values()].reduce((n,row)=>n+row.bytes,0),owners:owners.size,complete:true};
}
/** A reservation starts before an img receives src and is never refunded just
 * because its component unmounts. CSS resources are reserved from construction. */
const defaultOrigin=()=>globalThis.location?.origin||'https://yard.invalid';
function resolveResourceOwner(row,origin=defaultOrigin()){
 const url=new URL(row.url,origin).href;
 const kind=row.owner?.startsWith('css-url:')?'css-url':'dom-url';
 return{...row,url,owner:`${kind}:${url}`};
}
export function createUiImageReserve(input=inventory,{limitBytes=64*1024*1024,origin=defaultOrigin()}={}){
 if(input.unresolved?.length)throw Error('UI image capacity is incomplete');
 const known=new Map(),seen=new Map();let admissionCheck=null,disposed=false;
 const key=url=>new URL(url,origin).href;
 const insert=inputRow=>{const row=resolveResourceOwner(inputRow,origin),url=row.url,previous=known.get(url);pageOwnerLedger(previous?[previous]:[],[row]);if(previous&&(previous.owner!==row.owner))throw Error('Conflicting UI resource ownership');known.set(url,row);};
 input.rows.forEach(insert);
 for(const row of known.values())if(row.alwaysReserved)seen.set(row.owner,row);
 const describe=rows=>({bytes:[...pageOwnerLedger([...rows.values()]).values()].reduce((n,row)=>n+row.bytes,0),owners:rows.size,complete:true});
 if(describe(seen).bytes>limitBytes)throw Error('Fixed UI images exceed the decoded capacity');
 return{
  snapshot:()=>describe(seen),
  ledger:()=>[...seen.values()].map(row=>({...row,bytes:row.width*row.height*4})),
  registerCatalog(catalog){for(const row of [...Object.values(catalog.foods||{}),...Object.values(catalog.goodies||{}).flatMap(Object.values)]){const url=new URL(row.src,catalog.baseURL).href;insert({url,owner:'dom-url:'+url,width:row.canvas[0],height:row.canvas[1]});}},
  setAdmissionCheck(check){admissionCheck=check;},
  admit(urls){
   if(disposed)return false;const proposed=new Map(seen);
   for(const url of urls.filter(Boolean)){const row=known.get(key(url));if(!row)throw Error('Unregistered UI image resource');proposed.set(row.owner,row);}
   const next=describe(proposed);if(next.bytes>limitBytes||admissionCheck&&!admissionCheck(next))return false;
   for(const [id,row]of proposed)seen.set(id,row);return true;
  },
  dispose(){disposed=true;seen.clear();admissionCheck=null;},
 };
}

/** Exact source URLs that this screen can expose over its lifetime. Retired
 * old-camera food/prop paths stay excluded even during loading or failure.
 * Seen reachable resources keep their charge after replacement or unmount. */
export function uiImageLifetimeLedger(catalog=null,input=inventory,{origin=catalog?.baseURL||defaultOrigin()}={}){
 const reserve=createUiImageReserve(input,{limitBytes:Number.MAX_SAFE_INTEGER,origin});
 try{
  if(catalog)reserve.registerCatalog(catalog);
  const catalogRows=catalog?[...Object.values(catalog.foods||{}),...Object.values(catalog.goodies||{}).flatMap(Object.values)]:[];
  const urls=[...input.rows.map(row=>row.url),...catalogRows.map(row=>new URL(row.src,catalog.baseURL).href)];
  if(!reserve.admit(urls))throw Error('Complete UI lifetime reservation failed');
  return{...reserve.snapshot(),ownerRows:reserve.ledger(),historicalResourceRows:input.rows.length,catalogResourceRows:catalogRows.length,
   reservation:'All reachable historical and new-pack resource URLs; no unmount or replacement refund',browserSharingQualified:false};
 }finally{reserve.dispose();}
}

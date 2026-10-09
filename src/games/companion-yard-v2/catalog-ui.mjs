/** Current UI artwork only. Scene food and item images come from the renderer's
 * canonical catalogue. Historic save fields never select scenery or prop art. */
export const CURRENT_VISITOR_PORTRAITS=Object.freeze({
  "mochi_bunny": "/assets/yard-ui/current-portraits/7ca2483da48df88bcd09fd164166b1f6a0f817699d14933f4813eb84f69e7730.png",
  "mika_cat": "/assets/yard-ui/current-portraits/4d8d146daecb44098c0584e7f6e01872e85398693664b1b177769a24aa3e1093.png",
  "pip_hamster": "/assets/yard-ui/r1-pip/e95729164c758816ed9952a037b085cdfaf9242bd6bd96926acd30b04dcbde7b.png",
  "pebble_pup": "/assets/yard-ui/current-portraits/083c1d6bafe2a330717c12d92d1eb7fff19c2b8186b1a3aaa7d5b564e6b6b7b6.png",
  "willow_fox": "/assets/yard-ui/current-portraits/c64172fa6fa82700fc1f31441ad75eb4963299835f5746440b6c35e1167a7179.png",
  "starlit_fox": "/assets/yard-ui/current-portraits/83fd535cb6ecc1103959e72962fef0a43de73d038d84984cce09090b3e87b2c2.png",
  "basil_turtle": "/assets/yard-ui/current-portraits/56f5eea3755f59b02f980b976c41597d2264652224bd59987264fee772507e0e.png",
  "sage_turtle": "/assets/yard-ui/current-portraits/93674ae9fab636cc95278ba0cc21f27fcff59a67ea0bc9d758314b298ee99481.png"
});
export const YARD_UI_ART=Object.freeze({
  food:'/assets/yard-ui/previews/ba0eb9cb82af.webp',
  decor:'/assets/yard-ui/previews/2da963c7e75d.webp',
  guests:CURRENT_VISITOR_PORTRAITS.pip_hamster,
  album:'/games/hud-redesign/room/semantic-icons/dock-album.png',
});

/** An absent catalogue remains absent while the clean scene loads or fails.
 * Historical portraits ignore saved poses, props, backgrounds and remodels. */
export function sceneCatalogPreview(catalog,kind,id,{condition='new'}={}){
  if(kind==='visitor')return Object.hasOwn(CURRENT_VISITOR_PORTRAITS,id)?CURRENT_VISITOR_PORTRAITS[id]:null;
  if(!catalog||kind==='goodie'&&id!=='leaf_pot')return null;
  const own=(value,key)=>Object.hasOwn(value||{},key);
  const conditions=own(catalog.goodies,id)?catalog.goodies[id]:null;
  const row=kind==='goodie'&&own(conditions,condition)?conditions[condition]:kind==='food'&&own(catalog.foods,id)?catalog.foods[id]:null;
  return row?new URL(row.src,catalog.baseURL).href:null;
}

/** A display guard using the canonical price; the reliable server action remains authoritative. */
export function canAffordCatalogCost(cost = {}, currencies = {}) {
  return ['treats', 'shinyTreats'].every(key => Number(cost[key] || 0) <= Number(currencies[key] || 0));
}

const placementMessages = Object.freeze({
  CANONICAL_ACTOR_OCCUPIED: 'actor',
  FOOTPRINT_OUTSIDE_PLAYZONE: 'outside', FOOTPRINT_COLLISION: 'overlap',
  EXCLUSION_COLLISION: 'exclusion', VISITOR_PATH_RESERVED: 'reservedPath',
  PROP_RESERVED: 'occupied', PROP_UNREACHABLE: 'unreachable', ENTRY_BLOCKED: 'entry',
  YARD_READ_ONLY: 'readOnly', MEDIA_UNAVAILABLE: 'unsupported', INVENTORY_ONLY: 'unsupported',
});
export function placementMessageKey(code) {
  return `yard.persistent.placement.${Object.hasOwn(placementMessages,code)?placementMessages[code]:'blocked'}`;
}

/** Match the saved Decor card's name and number without exposing storage IDs. */
export function occupiedDecorLabels(slotIds,placedItems,name,fallback){
 const labels=(slotIds||[]).map(slotId=>{
  const index=placedItems.findIndex(item=>item.slotId===slotId);
  return index<0?fallback:`${name(placedItems[index].goodieId)} · ${index+1}`;
 });
 return labels.join(', ')||fallback;
}

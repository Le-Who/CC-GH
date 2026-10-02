/** Semantic recovery from owned Merge v3 hf1 preview, not original authored source.
 * Global names are descriptive recovery labels; local names retain compiled spelling.
 * See evidence/recovery.json and scripts/recover-source.mjs. No framework/runtime is embedded.
 */
import {compileMergeLabCatalog, createMergeLabState, hashCanonical} from "./merge-lab-domain.js";
const LEGACY_CHAINS={
  flora:{
    id:"flora",
    name:"Flora",
    items:["seed","sprout","herb","blossom","vine","grove","lifebloom","world_tree"],
    names:["Seed","Sprout","Herb","Blossom","Vine","Grove","Lifebloom","World Tree"],
    emoji:["🌰","🌱","🌿","🌼","🍃","🌳","💚","🌍"]
  },
  earth:{
    id:"earth",
    name:"Earth",
    items:["dust","clay","sand","stone","ore","crystal","geode","monolith"],
    names:["Dust","Clay","Sand","Stone","Ore","Crystal","Geode","Monolith"],
    emoji:["💨","🟫","🏖️","🪨","⛏️","💎","🪬","🗿"]
  },
  water:{
    id:"water",
    name:"Water",
    items:["dew","droplet","stream","spring","pond","tide","rainstone","ocean_heart"],
    names:["Dew","Droplet","Stream","Spring","Pond","Tide","Rainstone","Ocean Heart"],
    emoji:["💧","💦","〰️","♨️","🪷","🌊","🔷","💙"]
  },
  fire:{
    id:"fire",
    name:"Fire",
    items:["ember","flame","coal","kiln","forge","sunshard","phoenix_ash","solar_core"],
    names:["Ember","Flame","Coal","Kiln","Forge","Sunshard","Phoenix Ash","Solar Core"],
    emoji:["🔥","🔥","⚫","🧱","⚒️","☀️","🪶","🔆"]
  },
  air:{
    id:"air",
    name:"Air",
    items:["breeze","cloud","spark","bolt","lightning","storm_cell","aurora","tempest_crown"],
    names:["Breeze","Cloud","Spark","Bolt","Lightning","Storm Cell","Aurora","Tempest Crown"],
    emoji:["🍃","☁️","✨","⚡","🌩️","⛈️","🌌","👑"]
  },
  alchemy:{
    id:"alchemy",
    name:"Alchemy",
    items:["mud","brick","glass","vial","elixir","lens","astrolabe","philosopher_stone"],
    names:["Mud","Brick","Glass","Vial","Elixir","Lens","Astrolabe","Philosopher Stone"],
    emoji:["🟤","🧱","🔍","🧪","✨","🔎","🧭","🜍"]
  }
},LEGACY_CHAIN_ALIASES={
  textile:"flora",
  wood:"earth",
  storm:"air",
  craft:"alchemy"
},LEGACY_ITEM_ALIASES={
  thread:"seed",
  yarn:"sprout",
  fabric:"herb",
  shirt:"blossom",
  jacket:"vine",
  sweater:"grove",
  coat:"lifebloom",
  tapestry:"world_tree",
  twig:"dust",
  branch:"clay",
  log:"sand",
  plank:"stone",
  chair:"ore",
  table:"crystal",
  wardrobe:"geode",
  throne:"monolith",
  stone:"stone",
  ore:"ore",
  crystal:"crystal",
  prism:"geode",
  bundle:"mud",
  toolkit:"brick",
  camp_chair:"glass",
  loom:"vial",
  workbench:"elixir",
  atelier:"lens",
  guild_hall:"astrolabe",
  relic_workshop:"philosopher_stone"
};
const hasLegacyOwn=(s,r)=>Object.prototype.hasOwnProperty.call(s,r),isRecord=s=>s&&typeof s=="object"&&!Array.isArray(s),isCount=s=>Number.isSafeInteger(s)&&s>=0,cloneLegacy=s=>structuredClone(s);
function serializeLegacy(s){
  return s===void 0?{
    $type:"undefined"
  }:typeof s=="number"&&!Number.isFinite(s)?{
    $type:String(s)
  }:Array.isArray(s)?Array.from(s,serializeLegacy):isRecord(s)?Object.fromEntries(Object.entries(s).map(([r,f])=>[r,serializeLegacy(f)])):s
}
function isNumericRecord(s){
  return isRecord(s)&&Object.keys(s).every(r=>/^(0|[1-9]\d*)$/.test(r))
}
function resolveLegacyItem(s,r){
  const f=typeof s=="string"?s:s?.id??s?.itemId;
  if(typeof f=="string"){
    if(r.items.has(f))return f;
    const E=LEGACY_ITEM_ALIASES[f];
    return E&&r.items.has(E)?E:null
  }
  if(!isRecord(s))return null;
  const c=hasLegacyOwn(LEGACY_CHAINS,s.chainId)?s.chainId:hasLegacyOwn(LEGACY_CHAIN_ALIASES,s.chainId)?LEGACY_CHAIN_ALIASES[s.chainId]:null,y=s.level;
  if(!c||!Number.isSafeInteger(y)||y<0||y>=LEGACY_CHAINS[c].items.length)return null;
  const m=LEGACY_CHAINS[c].items[y];
  return r.items.has(m)?m:null
}
function parseLegacyJson(s,r,f){
  if(typeof s!="string")return s;
  const c=s.trim();
  if(c.startsWith("[")||c.startsWith("{")||c.startsWith('"'))try{
    return JSON.parse(c)
  }
  catch{
    f.push({
      source:r,
      reason:"invalid_json",
      raw:cloneLegacy(s)
    });
    return
  }
  return s
}
function readLegacyEntries(s,r,f,c,{
  countMap:y=!1
}={
}){
  const m=[],E=(A,v,p=0)=>{
    if(A==null)return;
    if(p>100){
      c.push({
        source:v,
        reason:"excessive_nesting",
        raw:cloneLegacy(A)
      });
      return
    }
    const g=parseLegacyJson(A,v,c);
    if(g===void 0)return;
    if(Array.isArray(g)||isNumericRecord(g)){
      const X=Object.keys(g).sort((J,G)=>Number(J)-Number(G));
      for(const J
      of X)E(g[J],`${v}.${J}`,p+1);
      return
    }
    if(isRecord(g)&&!hasLegacyOwn(g,"id")&&!hasLegacyOwn(g,"itemId")&&!hasLegacyOwn(g,"chainId")&&y){
      for(const[X,J]
      of Object.entries(g))E({
        id:X,
        quantity:J
      },`${v}.${X}`,p+1);
      return
    }
    const _=resolveLegacyItem(g,f);
    if(!_){
      c.push({
        source:v,
        reason:"unknown_or_malformed_item",
        raw:cloneLegacy(A)
      });
      return
    }
    const M=isRecord(g)?g.quantity??g.count??1:1;
    if(!isCount(M)){
      c.push({
        source:v,
        reason:"invalid_quantity",
        raw:cloneLegacy(A)
      });
      return
    }
    if(M===0)return;
    const Z=isRecord(g)?g.instanceId??g.uid??null:null;
    if(Z!==null&&typeof Z!="string"&&typeof Z!="number"){
      c.push({
        source:v,
        reason:"invalid_instance_id",
        raw:cloneLegacy(A)
      });
      return
    }
    m.push({
      id:_,
      quantity:M,
      instanceId:Z===null?null:String(Z),
      source:v,
      raw:cloneLegacy(A)
    })
  }
  ;
  return E(s,r),m
}
function totalLegacyEntries(s){
  const r={
  };
  for(const f
  of s){
    const c=(r[f.id]??0)+f.quantity;
    if(!isCount(c))return null;
    r[f.id]=c
  }
  return r
}
function sameLegacyTotals(s,r){
  const f=totalLegacyEntries(s),c=totalLegacyEntries(r);
  return f&&c&&hashCanonical(f)===hashCanonical(c)
}
function getLegacyPath(s,r){
  return r.split(".").reduce((f,c)=>f?.[c],s)
}
function migrateMergeLabPlayer(s,r,{
  now:f=0,
  inventorySources:c={
  }
}={
}){
  if(!isRecord(s))throw new TypeError("Raw player must be an object");
  if(!isCount(f))throw new TypeError("Server time must be a non-negative safe integer");
  const y=compileMergeLabCatalog(r);
  if(s.merge?.schemaVersion===3)return{
    player:cloneLegacy(s),
    migrated:!1,
    report:cloneLegacy(s.merge.migration?.report??{
      alreadyMigrated:!0
    })
  };
  if(s.merge?.schemaVersion>3)throw new Error("Cannot downgrade a newer Merge schema");
  const m=cloneLegacy(s),E=isRecord(s.merge)?s.merge:{
  },A=[],v=[],p={
  },g=new Map,_={
    version:3,
    acceptedUnits:0,
    acceptedEntries:0,
    duplicateInstances:0,
    mirroredSources:[],
    ambiguousSources:[],
    sourceTotals:{
    },
    quarantinedEntries:0
  },M={
    merge:cloneLegacy(s.merge),
    mergeBoard:cloneLegacy(s.mergeBoard),
    mergeInventory:cloneLegacy(s.mergeInventory),
    inventoryMergeInventory:cloneLegacy(s.inventory?.mergeInventory),
    inventoryMergeItems:cloneLegacy(s.inventory?.mergeItems)
  },Z=(V,te)=>{
    _.sourceTotals[te]={
    };
    for(const w
    of V){
      if(w.instanceId!==null&&g.has(w.instanceId)){
        const B=g.get(w.instanceId);
        if(B.id===w.id&&B.quantity===w.quantity){
          _.duplicateInstances++;
          continue
        }
        A.push({
          source:w.source,
          reason:"conflicting_instance_id",
          raw:w.raw
        });
        continue
      }
      const ue=(p[w.id]??0)+w.quantity;
      if(!isCount(ue)){
        A.push({
          source:w.source,
          reason:"quantity_overflow",
          raw:w.raw
        });
        continue
      }
      p[w.id]=ue;
      const q=BigInt(_.acceptedUnits)+BigInt(w.quantity);
      _.acceptedUnits=q<=BigInt(Number.MAX_SAFE_INTEGER)?Number(q):q.toString(),_.acceptedEntries++,_.sourceTotals[te][w.id]=(_.sourceTotals[te][w.id]??0)+w.quantity,w.instanceId!==null&&g.set(w.instanceId,w)
    }
  }
  ,X=hasLegacyOwn(E,"board")?"merge.board":hasLegacyOwn(s,"mergeBoard")?"mergeBoard":null;
  if(X){
    const V=readLegacyEntries(getLegacyPath(s,X),X,y,A);
    Z(V,X)
  }
  hasLegacyOwn(E,"board")&&hasLegacyOwn(s,"mergeBoard")&&_.mirroredSources.push("mergeBoard");
  for(const V
  of["merge.inventory","mergeInventory","inventory.mergeInventory"]){
    const te=getLegacyPath(s,V);
    te!==void 0&&v.push({
      path:V,
      raw:te,
      entries:readLegacyEntries(te,V,y,A,{
        countMap:!0
      })
    })
  }
  const J=v.find(V=>c[V.path]!=="mirror");
  J&&Z(J.entries,J.path);
  for(const V
  of v)if(V!==J){
    if(c[V.path]==="independent"){
      Z(V.entries,V.path);
      continue
    }
    c[V.path]==="mirror"||J&&sameLegacyTotals(J.entries,V.entries)?_.mirroredSources.push(V.path):(_.ambiguousSources.push(V.path),A.push({
      source:V.path,
      reason:"ambiguous_inventory_source",
      raw:cloneLegacy(V.raw)
    }))
  }
  s.inventory?.mergeItems!==void 0&&_.mirroredSources.push("inventory.mergeItems");
  const G=createMergeLabState(r,{
    now:f
  });
  for(const V
  of["alchemyEssence","exchangeClaims","freeTapCharges","lastFreeTaps","lastFreePull","generatorState","generators"])hasLegacyOwn(E,V)&&(G[V]=cloneLegacy(E[V]));
  for(const V
  of["alchemyEssence","freeTapCharges","lastFreeTaps","lastFreePull"])isCount(G[V])||A.push({
    source:`merge.${V}`,
    reason:"invalid_preserved_balance_or_timestamp",
    raw:cloneLegacy(G[V])
  });
  G.stock=p;
  const k=new Set([...G.knowledge.itemIds,...Object.keys(p)]),ie=new Set(G.knowledge.recipeIds),b=parseLegacyJson(E.discoveredItems??[],"merge.discoveredItems",A);
  if(Array.isArray(b)||isNumericRecord(b))for(const[V,te]
  of Object.entries(b)){
    const w=resolveLegacyItem(te,y);
    w?k.add(w):A.push({
      source:`merge.discoveredItems.${V}`,
      reason:"unknown_knowledge_item",
      raw:cloneLegacy(te)
    })
  }
  else A.push({
    source:"merge.discoveredItems",
    reason:"malformed_knowledge",
    raw:cloneLegacy(b)
  });
  const K=parseLegacyJson(E.discoveredRecipes??[],"merge.discoveredRecipes",A);
  if(Array.isArray(K)||isNumericRecord(K))for(const[V,te]
  of Object.entries(K)){
    const w=typeof te=="string"?te:te?.id;
    if(y.recipes.has(w)){
      ie.add(w);
      const ue=y.recipes.get(w);
      k.add(ue.result),ue.ingredients.forEach(q=>k.add(q))
    }
    else A.push({
      source:`merge.discoveredRecipes.${V}`,
      reason:"unknown_knowledge_recipe",
      raw:cloneLegacy(te)
    })
  }
  else A.push({
    source:"merge.discoveredRecipes",
    reason:"malformed_knowledge",
    raw:cloneLegacy(K)
  });
  return G.knowledge.itemIds=[...k],G.knowledge.recipeIds=[...ie],G.rewards.itemIds=[...k],G.rewards.recipeIds=[...ie],G.supply.rechargeInitialized=isCount(G.lastFreeTaps)&&G.lastFreeTaps>0,isCount(G.lastFreePull)&&G.lastFreePull>0&&G.lastFreePull<=864e13&&(G.supply.dailyClaimDate=new Date(G.lastFreePull).toISOString().slice(0,10)),G.supply.starterKitClaimed=E.supply?.starterKitClaimed===!0||E.starterKitClaimed===!0,_.quarantinedEntries=A.length,G.migration={
    id:`merge-v3:${hashCanonical(serializeLegacy(M))}`,
    fromSchemaVersion:E.schemaVersion??1,
    completedAt:f,
    rawBackup:M,
    quarantine:A,
    report:cloneLegacy(_)
  },m.merge=G,delete m.mergeBoard,delete m.mergeInventory,isRecord(m.inventory)&&(delete m.inventory.mergeItems,delete m.inventory.mergeInventory),{
    player:m,
    migrated:!0,
    report:_
  }
}

export {migrateMergeLabPlayer};

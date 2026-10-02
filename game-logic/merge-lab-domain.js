/** Semantic recovery from owned Merge v3 hf1 preview, not original authored source.
 * Global names are descriptive recovery labels; local names retain compiled spelling.
 * See evidence/recovery.json and scripts/recover-source.mjs. No framework/runtime is embedded.
 */
const DEFAULT_EXCHANGE_OFFERS=[{
  id:"yard_treats_small",
  labelKey:"merge.exchange.treatsSmall",
  descriptionKey:"merge.exchange.treatsSmallHint",
  targetGame:"yard",
  cost:50,
  reward:{
    treats:120
  },
  perDayLimit:4
},{
  id:"yard_shiny_treat",
  labelKey:"merge.exchange.shinyTreat",
  descriptionKey:"merge.exchange.shinyTreatHint",
  targetGame:"yard",
  cost:120,
  reward:{
    shinyTreats:1
  },
  perDayLimit:2
},{
  id:"future_game_slot",
  labelKey:"merge.exchange.futureSlot",
  descriptionKey:"merge.exchange.futureSlotHint",
  targetGame:"future",
  cost:0,
  reward:{
  },
  locked:!0
}];
const MERGE_LAB_RECEIPT_LIMIT=128,DEFAULT_LAB_ECONOMY=Object.freeze({
  firstDiscoveryEssence:2,
  freeChargeCapacity:30,
  rechargeMs:1200*1e3,
  dailyQuantity:3,
  tokenCost:10,
  tokenQuantity:6,
  cropCost:1,
  cropQuantity:2,
  quoteLifetimeMs:300*1e3,
  maxBatch:100
}),DEFAULT_BASE_SUPPLIES=["seed","dust","dew","ember","breeze"],LAB_ID_PATTERN=/^[a-z][a-z0-9_]{0,119}$/,hasOwn=(s,r)=>Object.prototype.hasOwnProperty.call(s,r),clone=s=>structuredClone(s);
class MergeLabError extends Error{
  constructor(r,f,c=400){
    super(f),this.code=r,this.status=c
  }
}
function assertLab(s,r,f,c=400){
  if(!s)throw new MergeLabError(r,f,c)
}
function plainObject(s,r){
  return assertLab(s&&typeof s=="object"&&!Array.isArray(s)&&(Object.getPrototypeOf(s)===Object.prototype||Object.getPrototypeOf(s)===null),"INVALID_DATA",`${r} must be a plain object`),s
}
function safeInteger(s,r,f=0,c=Number.MAX_SAFE_INTEGER){
  return assertLab(Number.isSafeInteger(s)&&s>=f&&s<=c,"INVALID_INTEGER",`${r} must be an integer in ${f}..${c}`),s
}
function validId(s,r){
  return assertLab(typeof s=="string"&&LAB_ID_PATTERN.test(s)&&!["constructor","prototype","__proto__"].includes(s),"INVALID_ID",`Invalid ${r}`),s
}
function addCounts(s,r){
  return safeInteger(s+r,"quantity sum")
}
function multiplyCounts(s,r){
  return safeInteger(s*r,"quantity product")
}
function pairKey(s,r){
  return[validId(s,"item ID"),validId(r,"item ID")].sort().join("+")
}
function canonicalJson(s){
  return s===null||typeof s=="boolean"||typeof s=="string"?JSON.stringify(s):typeof s=="number"?(assertLab(Number.isFinite(s),"INVALID_DATA","Non-finite number"),JSON.stringify(s)):Array.isArray(s)?`[${s.map(canonicalJson).join(",")}]`:(plainObject(s,"JSON value"),assertLab(Object.getPrototypeOf(s)===Object.prototype||Object.getPrototypeOf(s)===null,"INVALID_DATA","Non-JSON object"),`{${Object.keys(s).sort().map(r=>`${JSON.stringify(r)}:${canonicalJson(s[r])}`).join(",")}}`)
}
function hashCanonical(s){
  const r=new TextEncoder().encode(canonicalJson(s)),f=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298],c=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],y=new Uint8Array(Math.ceil((r.length+9)/64)*64);
  y.set(r),y[r.length]=128;
  const m=new DataView(y.buffer);
  m.setUint32(y.length-8,Math.floor(r.length/536870912)),m.setUint32(y.length-4,r.length*8);
  const E=(v,p)=>v>>>p|v<<32-p,A=new Uint32Array(64);
  for(let v=0
  ;v<y.length;v+=64){
    for(let k=0
    ;k<16;k++)A[k]=m.getUint32(v+k*4);
    for(let k=16
    ;k<64;k++)A[k]=A[k-16]+(E(A[k-15],7)^E(A[k-15],18)^A[k-15]>>>3)+A[k-7]+(E(A[k-2],17)^E(A[k-2],19)^A[k-2]>>>10)>>>0;
    let[p,g,_,M,Z,X,J,G]=c;
    for(let k=0
    ;k<64;k++){
      const ie=G+(E(Z,6)^E(Z,11)^E(Z,25))+(Z&X^~Z&J)+f[k]+A[k]>>>0,b=(E(p,2)^E(p,13)^E(p,22))+(p&g^p&_^g&_)>>>0;
      G=J,J=X,X=Z,Z=M+ie>>>0,M=_,_=g,g=p,p=ie+b>>>0
    }
    [p,g,_,M,Z,X,J,G].forEach((k,ie)=>{
      c[ie]=c[ie]+k>>>0
    }
    )
  }
  return c.map(v=>v.toString(16).padStart(8,"0")).join("")
}
function arrayValue(s,r){
  return assertLab(Array.isArray(s),"INVALID_CATALOG",`${r} must be an array`),s
}
function countMap(s,r,f=null){
  plainObject(s,r);
  const c={
  };
  for(const[y,m]
  of Object.entries(s))validId(y,r),f&&assertLab(f.has(y),"UNKNOWN_ITEM",`Unknown item: ${y}`),c[y]=safeInteger(m,`${r}.${y}`);
  return c
}
function recipeInputs(s,r){
  if(!Array.isArray(s))return countMap(s,"inputs",r);
  const f={
  };
  for(const c
  of s){
    typeof c!="string"&&plainObject(c,"ingredient");
    const y=typeof c=="string"?c:c.itemId;
    assertLab(r.has(y),"INVALID_CATALOG",`Unknown ingredient ${y}`),f[y]=addCounts(f[y]||0,typeof c=="string"?1:safeInteger(c.quantity,"ingredient quantity",1))
  }
  return f
}
function projectInputs(s,r){
  const f=recipeInputs(s,r);
  return assertLab(Object.keys(f).length>0&&Object.values(f).every(c=>c>0),"INVALID_CATALOG","Project recipes must consume positive material quantities"),f
}
function compileMergeLabCatalog(s){
  plainObject(s,"catalog");
  const r=s.version??s.catalogVersion;
  assertLab(typeof r=="string"&&r.length>0&&r.length<100||Number.isSafeInteger(r)&&r>0,"INVALID_CATALOG","catalog.version required");
  const f=Array.isArray(s.items)?s.items:Object.values(plainObject(s.items,"items")),c=new Map;
  for(const b
  of f){
    plainObject(b,"catalog item");
    const K=validId(b.id,"item");
    assertLab(!c.has(K),"INVALID_CATALOG",`Duplicate item ${K}`),c.set(K,b)
  }
  const y=new Map,m=new Map;
  for(const b
  of arrayValue(s.recipes,"recipes")){
    plainObject(b,"catalog recipe"),validId(b.id,"recipe"),assertLab(!y.has(b.id),"INVALID_CATALOG",`Duplicate recipe ${b.id}`),assertLab(Array.isArray(b.ingredients)&&b.ingredients.length===2,"INVALID_CATALOG","Recipes require exactly two operands");
    const K=recipeInputs(b.ingredients,c),V=typeof b.result=="string"?b.result:b.result?.itemId;
    assertLab(c.has(V),"INVALID_CATALOG",`Unknown result ${V}`);
    const te=pairKey(...b.ingredients);
    assertLab(!m.has(te),"INVALID_CATALOG",`Duplicate pair ${te}`);
    const w={
      ...b,
      result:V,
      input:K,
      outputQuantity:safeInteger(b.outputQuantity??1,"recipe output",1)
    };
    assertLab(w.outputQuantity<=1,"INVALID_CATALOG","Unreviewed multiplying recipe"),y.set(b.id,w),m.set(te,w)
  }
  const E=new Map;
  for(const b
  of arrayValue(s.projects,"projects")){
    plainObject(b,"catalog project"),validId(b.id,"project"),assertLab(!E.has(b.id),"INVALID_CATALOG",`Duplicate project ${b.id}`),assertLab(b.output?.game==="yard","INVALID_CATALOG","Project output must be Yard"),validId(b.output.itemId,"Yard output");
    const K=projectInputs(b.inputs,c),V=safeInteger(b.essenceCost??0,"project essence"),te=new Map;
    for(const w
    of arrayValue(b.variants??[],"project variants")){
      plainObject(w,"project variant"),validatePayloadFields(w,["id","names","description","inputs","essenceCost","output"]),validId(w.id,"project variant"),assertLab(w.id!=="base"&&!te.has(w.id),"INVALID_CATALOG",`Duplicate or reserved variant ${w.id}`);
      for(const q
      of["names","description"]){
        plainObject(w[q],`variant ${q}`);
        for(const B
        of["en","ru"])assertLab(typeof w[q][B]=="string"&&w[q][B].trim().length>0,"INVALID_CATALOG",`Missing variant ${q}.${B}`)
      }
      w.output!==void 0&&(plainObject(w.output,"variant output"),validatePayloadFields(w.output,["game","itemId","newId"]),assertLab(w.output.game===b.output.game&&w.output.itemId===b.output.itemId&&(!hasOwn(w.output,"newId")||w.output.newId===b.output.newId),"INVALID_CATALOG","A variant must grant exactly the same project output"));
      const ue=safeInteger(w.essenceCost,"variant essence");
      assertLab(ue<=V,"INVALID_CATALOG","A material alternative cannot increase the essence cost"),te.set(w.id,{
        ...w,
        input:projectInputs(w.inputs,c),
        essenceCost:ue,
        output:{
          ...b.output
        }
      })
    }
    E.set(b.id,{
      ...b,
      input:K,
      essenceCost:V,
      variants:te
    })
  }
  const A=[...new Set(arrayValue(s.starterItemIds,"starter items"))];
  A.forEach(b=>assertLab(c.has(b),"INVALID_CATALOG",`Unknown starter ${b}`));
  const v=arrayValue(s.starterRecipeIds??[],"starter recipes");
  v.forEach(b=>assertLab(y.has(b),"INVALID_CATALOG",`Unknown starter recipe ${b}`));
  const p={
    ...DEFAULT_LAB_ECONOMY,
    firstDiscoveryEssence:s.economy?.discoveryEssence??DEFAULT_LAB_ECONOMY.firstDiscoveryEssence,
    freeChargeCapacity:s.economy?.chargeCap??DEFAULT_LAB_ECONOMY.freeChargeCapacity,
    rechargeMs:s.economy?.rechargeMs??DEFAULT_LAB_ECONOMY.rechargeMs,
    distillDivisor:s.economy?.distillDivisor??4,
    distillCap:s.economy?.distillCap??6
  };
  for(const[b,K]
  of Object.entries(p))safeInteger(K,`economy.${b}`,b==="firstDiscoveryEssence"?0:1);
  const g=arrayValue(s.baseSupplyItemIds??DEFAULT_BASE_SUPPLIES,"base supplies");
  g.forEach(b=>assertLab(c.has(b),"INVALID_CATALOG",`Unknown base supply ${b}`));
  const _=Object.fromEntries(g.map(b=>[b,1]));
  for(let b=0
  ;b<c.size;b++)for(const K
  of y.values()){
    const V=K.ingredients.reduce((te,w)=>te+(_[w]??1/0),0);
    V<(_[K.result]??1/0)&&(_[K.result]=V)
  }
  assertLab([...c.keys()].every(b=>Number.isFinite(_[b])),"INVALID_CATALOG","Every item needs a deterministic base-supply path");
  const M=arrayValue(s.supplyItemIds??Object.keys(_).filter(b=>_[b]<=8),"common supplies");
  M.forEach(b=>assertLab(c.has(b)&&_[b]<=8,"INVALID_CATALOG",`Unreviewed supply ${b}`)),assertLab(g.every(b=>M.includes(b)&&A.includes(b)),"INVALID_CATALOG","Base supplies must always be known and available");
  for(const b
  of c.values())b.baseCost!==void 0&&assertLab(b.baseCost===_[b.id],"INVALID_CATALOG",`Stale minimum material cost for ${b.id}`);
  const Z=countMap(s.starterKit??{
  },"starter kit",c),X=new Map(arrayValue(s.tokenPacks??[],"token packs").map(b=>(plainObject(b,"token pack"),validId(b.id,"pack"),safeInteger(b.cost,"token pack price",1),[b.id,{
    ...b,
    items:countMap(b.items,"token pack",c)
  }]))),J=new Map(Object.entries(s.cropSupplies??{
  }).map(([b,K])=>(validId(b,"crop"),assertLab(K.cropId===b,"INVALID_CATALOG","Crop supply ID mismatch"),safeInteger(K.quantity,"crop quantity",1),[b,{
    ...K,
    items:countMap(K.items,"crop supply",c)
  }]))),G=countMap(s.economy?.dailySupply??{
    seed:1,
    dew:1,
    breeze:1
  },"daily supply",c),k=arrayValue(s.exchangeOffers??DEFAULT_EXCHANGE_OFFERS,"exchange offers");
  for(const b
  of k.filter(K=>!K.locked))validId(b.id,"exchange offer"),safeInteger(b.cost,"exchange price",1),safeInteger(b.perDayLimit,"exchange limit",1),plainObject(b.reward,"exchange reward"),Object.values(b.reward).forEach(K=>safeInteger(K,"exchange reward")),assertLab(Object.keys(b.reward).every(K=>["treats","shinyTreats"].includes(K)),"INVALID_CATALOG","Unsupported exchange currency");
  const ie=s.defaultProjectId??[...E.keys()][0]??null;
  return assertLab(ie===null||E.has(ie),"INVALID_CATALOG","Unknown default project"),{
    version:r,
    defaultProjectId:ie,
    items:c,
    recipes:y,
    pairs:m,
    projects:E,
    starterItemIds:A,
    starterRecipeIds:v,
    economy:p,
    baseIds:g,
    supplyItemIds:M,
    starterKit:Z,
    minimumCost:_,
    tokenPacks:X,
    cropSupplies:J,
    dailySupply:G,
    exchangeOffers:k
  }
}
function createMergeLabState(s,{
  now:r=0
}={
}){
  const f=compileMergeLabCatalog(s);
  return safeInteger(r,"server time"),{
    schemaVersion:3,
    catalogVersion:f.version,
    mergeRevision:0,
    knowledge:{
      itemIds:[...f.starterItemIds],
      recipeIds:[...f.starterRecipeIds],
      testedPairs:{
      },
      hintStages:{
      }
    },
    stock:{
    },
    projects:{
      unlockedIds:[...f.projects.keys()],
      selectedId:f.defaultProjectId,
      crafted:{
      }
    },
    alchemyEssence:0,
    exchangeClaims:{
    },
    freeTapCharges:0,
    lastFreeTaps:r,
    lastFreePull:0,
    supply:{
      dailyClaimDate:null,
      starterKitClaimed:!1,
      rechargeInitialized:!1
    },
    rewards:{
      itemIds:[...f.starterItemIds],
      recipeIds:[...f.starterRecipeIds]
    },
    actionLedger:[],
    ui:{
      laboratory:[null,null]
    }
  }
}
function validateMergeLabPlayer(s,r){
  plainObject(s,"player");
  const f=plainObject(s.merge,"merge");
  assertLab(f.schemaVersion===3,"MIGRATION_REQUIRED","Merge v3 migration required",409),safeInteger(f.mergeRevision,"merge revision"),safeInteger(f.alchemyEssence,"essence"),safeInteger(f.freeTapCharges,"free charges"),safeInteger(f.lastFreeTaps,"last recharge"),safeInteger(f.lastFreePull,"last daily pull"),countMap(f.stock,"stock",r.items),plainObject(f.knowledge,"knowledge"),plainObject(f.projects,"projects"),plainObject(f.supply,"supply"),plainObject(f.rewards,"rewards");
  for(const c
  of["itemIds","recipeIds"])for(const y
  of["knowledge","rewards"]){
    const m=arrayValue(f[y][c],`${y}.${c}`);
    m.forEach(E=>validId(E,`${y}.${c}`)),assertLab(m.length===new Set(m).size,"INVALID_DATA",`Duplicate ${y}.${c}`)
  }
  assertLab(f.knowledge.itemIds.every(c=>r.items.has(c)),"UNKNOWN_ITEM","Knowledge contains an unsupported catalog item"),plainObject(f.knowledge.testedPairs,"tested pairs"),plainObject(f.knowledge.hintStages,"hint stages"),countMap(f.projects.crafted,"crafted projects"),arrayValue(f.projects.unlockedIds,"unlocked projects"),arrayValue(f.actionLedger,"ledger");
  for(const c
  of f.actionLedger)plainObject(c,"receipt"),assertLab(typeof c.actionId=="string"&&typeof c.payloadHash=="string","INVALID_DATA","Invalid saved receipt"),safeInteger(c.revision,"receipt revision",1);
  assertLab(new Set(f.actionLedger.map(c=>c.actionId)).size===f.actionLedger.length,"INVALID_DATA","Duplicate saved receipt"),assertLab(f.actionLedger.length<=MERGE_LAB_RECEIPT_LIMIT,"INVALID_DATA","Oversized action ledger"),assertLab(typeof f.supply.starterKitClaimed=="boolean"&&typeof f.supply.rechargeInitialized=="boolean","INVALID_DATA","Invalid supply flags"),plainObject(f.exchangeClaims,"exchange claims");
  for(const c
  of Object.values(f.exchangeClaims))plainObject(c,"daily claims"),Object.values(c).forEach(y=>safeInteger(y,"daily claim count"));
  return s.yard?.goodieInventory!==void 0&&countMap(s.yard.goodieInventory,"Yard inventory"),s.yard?.currencies!==void 0&&(plainObject(s.yard.currencies,"Yard currencies"),Object.values(s.yard.currencies).forEach(c=>safeInteger(c,"Yard currency"))),s.farm?.harvested!==void 0&&countMap(s.farm.harvested,"harvested crops"),s.resources&&hasOwn(s.resources,"gachaTokens")&&safeInteger(s.resources.gachaTokens,"tokens"),f
}
function hashMergeLabAction(s){
  const{
    payloadHash:r,...f
  }=s;
  return hashCanonical(f)
}
function createMergeLabAction(s,r,f,c,{
  actionId:y
}={
}){
  const m=safeInteger(s?.merge?.mergeRevision,"revision");
  assertLab(typeof y=="string"&&y.length>0,"ACTION_ID_REQUIRED","Pass a stable caller-generated actionId nonce");
  const E=y.startsWith(`${m}:`)?y:`${m}:${y}`,A=clone(f??{
  });
  A.quote&&(A.quote={
    quoteId:A.quote.quoteId,
    expiresAt:A.quote.expiresAt
  });
  const v={
    type:r,
    actionId:E,
    expectedMergeRevision:m,
    catalogVersion:c.version??c.catalogVersion,
    payload:A
  };
  return v.payloadHash=hashMergeLabAction(v),v
}
function normalizeLabActionType(s){
  return assertLab(typeof s=="string","INVALID_ACTION","Action type required"),s.startsWith("merge.")?s.slice(6):s
}
function validatePayloadFields(s,r){
  plainObject(s,"payload");
  for(const f
  of Object.keys(s))assertLab(r.includes(f),"INVALID_PAYLOAD",`Unexpected payload field ${f}`)
}
const MERGE_LAB_ACTION_FIELDS={
  researchPair:["leftItemId","rightItemId"],
  craft:["recipeId","quantity","quote"],
  craftProject:["projectId","variantId","quantity","quote"],
  claimSupply:["itemId","quantity","quote"],
  claimDailySupply:["quote"],
  buySupply:["packId","quote"],
  useCropSupply:["cropId","quote"],
  distillStock:["itemId","quantity","quote"],
  claimFreeCharges:[],
  claimStarterKit:["quote"],
  requestHint:["recipeId","stage"],
  selectProject:["projectId"],
  exchange:["offerId","quote"]
};
function calculateMergeLabTerms(s,r,f,c){
  const y=s.merge,m={
    stockCost:{
    },
    stockGrant:{
    },
    essenceCost:0,
    tokenCost:0,
    freeChargeCost:0,
    cropCost:{
    },
    yardGrant:{
    },
    yardCurrencyGrant:{
    },
    essenceGrant:0
  };
  if(r==="craft"){
    const E=c.recipes.get(f.recipeId);
    assertLab(E,"UNKNOWN_RECIPE","Unknown recipe"),assertLab(y.knowledge.recipeIds.includes(E.id),"RECIPE_LOCKED","Research this recipe first");
    const A=safeInteger(f.quantity,"quantity",1,c.economy.maxBatch);
    for(const[v,p]
    of Object.entries(E.input))m.stockCost[v]=multiplyCounts(p,A);
    m.stockGrant[E.result]=multiplyCounts(E.outputQuantity,A)
  }
  else if(r==="craftProject"){
    const E=c.projects.get(f.projectId);
    assertLab(E,"UNKNOWN_PROJECT","Unknown project"),assertLab(y.projects.unlockedIds.includes(E.id),"PROJECT_LOCKED","Project locked");
    const A=f.variantId===void 0?"base":validId(f.variantId,"project variant"),v=A==="base"?E:E.variants.get(A);
    assertLab(v,"VARIANT_UNAVAILABLE","Choose an available project recipe");
    const p=safeInteger(f.quantity===void 0?1:f.quantity,"quantity",1,c.economy.maxBatch);
    for(const[g,_]
    of Object.entries(v.input))assertLab(y.knowledge.itemIds.includes(g),"ITEM_LOCKED",`Unknown project material ${g}`),m.stockCost[g]=multiplyCounts(_,p);
    m.essenceCost=multiplyCounts(v.essenceCost,p),m.yardGrant[E.output.itemId]=p
  }
  else if(r==="claimSupply"){
    assertLab(c.supplyItemIds.includes(f.itemId)&&y.knowledge.itemIds.includes(f.itemId),"SUPPLY_UNAVAILABLE","Choose a known common material");
    const E=safeInteger(f.quantity,"quantity",1,c.economy.maxBatch);
    m.freeChargeCost=E,m.stockGrant[f.itemId]=E
  }
  else if(r==="claimDailySupply")assertLab(Object.keys(c.dailySupply).every(E=>y.knowledge.itemIds.includes(E)),"PACK_LOCKED","All daily materials must be known"),m.stockGrant={
    ...c.dailySupply
  };
  else if(r==="buySupply"){
    const E=c.tokenPacks.get(f.packId);
    assertLab(E,"UNKNOWN_PACK","Choose a disclosed token pack"),assertLab(Object.keys(E.items).every(A=>y.knowledge.itemIds.includes(A)),"PACK_LOCKED","All pack materials must be known first"),m.stockGrant={
      ...E.items
    },m.tokenCost=E.cost
  }
  else if(r==="useCropSupply"){
    const E=c.cropSupplies.get(f.cropId);
    assertLab(E,"INVALID_CROP","Explicit supported crop required"),assertLab(Object.keys(E.items).every(A=>y.knowledge.itemIds.includes(A)),"PACK_LOCKED","All supply materials must be known first"),m.stockGrant={
      ...E.items
    },m.cropCost[f.cropId]=E.quantity
  }
  else if(r==="distillStock"){
    assertLab(c.items.has(f.itemId)&&y.knowledge.itemIds.includes(f.itemId),"UNKNOWN_ITEM","Choose a known material");
    const E=safeInteger(f.quantity,"quantity",1,c.economy.maxBatch);
    m.stockCost[f.itemId]=E,m.essenceGrant=multiplyCounts(E,Math.min(c.economy.distillCap,Math.ceil(c.minimumCost[f.itemId]/c.economy.distillDivisor)))
  }
  else if(r==="claimStarterKit")assertLab(Object.keys(c.starterKit).length>0,"STARTER_KIT_UNAVAILABLE","No configured starter kit"),assertLab(Object.keys(c.starterKit).every(E=>y.knowledge.itemIds.includes(E)),"PACK_LOCKED","All starter materials must be known"),m.stockGrant={
    ...c.starterKit
  };
  else if(r==="exchange"){
    const E=c.exchangeOffers.find(A=>A.id===f.offerId&&!A.locked);
    assertLab(E,"UNKNOWN_OFFER","Unknown exchange offer"),m.essenceCost=E.cost,m.yardCurrencyGrant={
      ...E.reward
    }
  }
  else throw new MergeLabError("QUOTE_NOT_REQUIRED","This action has no material quote");
  return m
}
function quoteContents(s,r,f,c,y){
  const{
    quote:m,...E
  }=f;
  return{
    type:r,
    parameters:E,
    catalogVersion:c.version,
    mergeRevision:s.merge.mergeRevision,
    expiresAt:y,
    terms:calculateMergeLabTerms(s,r,f,c)
  }
}
function createMergeLabQuote(s,r,f,c,{
  now:y=0
}={
}){
  const m=compileMergeLabCatalog(c);
  validateMergeLabPlayer(s,m),safeInteger(y,"server time");
  const E=normalizeLabActionType(r);
  assertLab(MERGE_LAB_ACTION_FIELDS[E],"INVALID_ACTION","Unknown action"),validatePayloadFields(f,MERGE_LAB_ACTION_FIELDS[E]);
  const A=quoteContents(s,E,f,m,addCounts(y,m.economy.quoteLifetimeMs));
  return{
    ...A,
    quoteId:hashCanonical(A)
  }
}
function validateQuote(s,r,f,c,y){
  const m=plainObject(f.quote,"quote");
  validatePayloadFields(m,["quoteId","expiresAt"]),safeInteger(m.expiresAt,"quote expiry"),assertLab(m.expiresAt>y&&m.expiresAt<=addCounts(y,c.economy.quoteLifetimeMs),"QUOTE_EXPIRED","Request a fresh displayed quote",409);
  const E=quoteContents(s,r,f,c,m.expiresAt);
  return assertLab(m.quoteId===hashCanonical(E),"QUOTE_CONFLICT","Price, catalog or revision changed; request a fresh quote",409),E.terms
}
function grantCounts(s,r){
  plainObject(s,"count inventory");
  for(const[f,c]
  of Object.entries(r))s[f]=addCounts(safeInteger(s[f]??0,`${f} count`),c)
}
function debitCounts(s,r,f){
  s!=null&&plainObject(s,"count inventory");
  for(const[c,y]
  of Object.entries(r))assertLab(safeInteger(s?.[c]??0,`${c} count`)>=y,f,`Not enough ${c}`);
  for(const[c,y]
  of Object.entries(r))s[c]-=y,s[c]||delete s[c]
}
function applyTerms(s,r){
  const f=s.merge;
  assertLab(f.alchemyEssence>=r.essenceCost,"INSUFFICIENT_ESSENCE","Not enough essence"),assertLab(f.freeTapCharges>=r.freeChargeCost,"SUPPLY_EXHAUSTED","No free charges available; claim earned charges or choose another explicit source"),r.tokenCost&&assertLab(safeInteger(s.resources?.gachaTokens??0,"tokens")>=r.tokenCost,"INSUFFICIENT_TOKENS","Not enough tokens"),debitCounts(f.stock,r.stockCost,"INSUFFICIENT_STOCK"),Object.keys(r.cropCost).length&&debitCounts(s.farm?.harvested,r.cropCost,"INSUFFICIENT_CROPS"),f.alchemyEssence=addCounts(f.alchemyEssence-r.essenceCost,r.essenceGrant),f.freeTapCharges-=r.freeChargeCost,r.tokenCost&&(s.resources.gachaTokens-=r.tokenCost),grantCounts(f.stock,r.stockGrant),(Object.keys(r.yardGrant).length||Object.keys(r.yardCurrencyGrant).length)&&(s.yard??={
  },s.yard.goodieInventory??={
  },s.yard.currencies??={
  },grantCounts(s.yard.goodieInventory,r.yardGrant),grantCounts(s.yard.currencies,r.yardCurrencyGrant))
}
function utcDate(s){
  return assertLab(s<=864e13,"INVALID_INTEGER","Server date out of range"),new Date(s).toISOString().slice(0,10)
}
function applyLabOperation(s,r,f,c,y){
  const m=s.merge;
  if(r==="researchPair"){
    const{
      leftItemId:A,
      rightItemId:v
    }=f,p=pairKey(A,v);
    assertLab(c.items.has(A)&&c.items.has(v),"UNKNOWN_ITEM","Unknown sample"),assertLab(m.knowledge.itemIds.includes(A)&&m.knowledge.itemIds.includes(v),"ITEM_LOCKED","Both samples must be known");
    const g=c.pairs.get(p);
    if(m.knowledge.testedPairs[p]={
      catalogVersion:c.version,
      recipeId:g?.id??null
    },!g)return{
      outcome:"failed",
      pair:p,
      stockChanged:!1,
      essenceGranted:0
    };
    const _=!m.knowledge.itemIds.includes(g.result),M=!m.knowledge.recipeIds.includes(g.id);
    _&&m.knowledge.itemIds.push(g.result),M&&m.knowledge.recipeIds.push(g.id);
    let Z=0;
    return m.rewards.itemIds.includes(g.result)||(Z=c.economy.firstDiscoveryEssence,m.rewards.itemIds.push(g.result),m.alchemyEssence=addCounts(m.alchemyEssence,Z)),m.rewards.recipeIds.includes(g.id)||m.rewards.recipeIds.push(g.id),{
      outcome:_||M?"new":"known",
      pair:p,
      recipeId:g.id,
      itemId:g.result,
      newItem:_,
      newRecipe:M,
      stockChanged:!1,
      essenceGranted:Z
    }
  }
  if(r==="requestHint"){
    const A=safeInteger(f.stage,"hint stage",1,3);
    let v=f.recipeId?c.recipes.get(f.recipeId):[...c.recipes.values()].find(g=>!m.knowledge.recipeIds.includes(g.id)&&!m.knowledge.itemIds.includes(g.result)&&g.ingredients.every(_=>m.knowledge.itemIds.includes(_)));
    assertLab(v&&!m.knowledge.recipeIds.includes(v.id)&&!m.knowledge.itemIds.includes(v.result)&&v.ingredients.every(g=>m.knowledge.itemIds.includes(g)),"NO_REACHABLE_HINT","No reachable undiscovered recipe for this hint");
    const p=m.knowledge.hintStages[v.id]??0;
    return assertLab(A<=p+1,"HINT_STAGE_ORDER","Request the preceding hint first"),m.knowledge.hintStages[v.id]=Math.max(A,p),{
      recipeId:v.id,
      stage:A,
      hint:A===1?v.hints?.[0]??"Look for materials whose properties can work together.":A===2?v.hints?.[1]??v.ingredients[0]:[...v.ingredients]
    }
  }
  if(r==="selectProject")return assertLab(m.projects.unlockedIds.includes(f.projectId),"UNKNOWN_PROJECT","Unknown project"),m.projects.selectedId=f.projectId,{
    projectId:f.projectId
  };
  if(r==="claimFreeCharges"){
    let A=0;
    if(!m.supply.rechargeInitialized)A=Math.max(0,c.economy.freeChargeCapacity-m.freeTapCharges),m.supply.rechargeInitialized=!0,m.lastFreeTaps=y;
    else if(y>=m.lastFreeTaps){
      const v=Math.floor((y-m.lastFreeTaps)/c.economy.rechargeMs);
      A=Math.min(Math.max(0,c.economy.freeChargeCapacity-m.freeTapCharges),v),m.lastFreeTaps=addCounts(m.lastFreeTaps,multiplyCounts(v,c.economy.rechargeMs))
    }
    return m.freeTapCharges=addCounts(m.freeTapCharges,A),{
      chargesGranted:A,
      freeTapCharges:m.freeTapCharges,
      nextFreeTapAt:addCounts(m.lastFreeTaps,c.economy.rechargeMs)
    }
  }
  const E=validateQuote(s,r,f,c,y);
  if(r==="claimStarterKit"&&assertLab(!m.supply.starterKitClaimed,"STARTER_KIT_CLAIMED","Starter kit already claimed",409),r==="claimDailySupply"){
    const A=utcDate(y);
    assertLab(m.supply.dailyClaimDate!==A&&(!m.lastFreePull||utcDate(m.lastFreePull)!==A),"DAILY_ALREADY_CLAIMED","Daily supply already claimed",409)
  }
  if(r==="exchange"){
    const A=c.exchangeOffers.find(p=>p.id===f.offerId),v=m.exchangeClaims[utcDate(y)]??{
    };
    assertLab(safeInteger(v[A.id]??0,"daily claim count")<A.perDayLimit,"EXCHANGE_LIMIT","Daily exchange limit reached",409)
  }
  if(applyTerms(s,E),r==="claimStarterKit"&&(m.supply.starterKitClaimed=!0),r==="claimDailySupply"&&(m.supply.dailyClaimDate=utcDate(y),m.lastFreePull=y),r==="craftProject"){
    const A=f.projectId;
    m.projects.crafted[A]=addCounts(m.projects.crafted[A]??0,f.quantity??1)
  }
  if(r==="exchange"){
    const A=utcDate(y);
    m.exchangeClaims[A]??={
    },m.exchangeClaims[A][f.offerId]=addCounts(m.exchangeClaims[A][f.offerId]??0,1)
  }
  return{
    outcome:"completed",...E,...r==="craftProject"?{
      projectId:f.projectId,
      variantId:f.variantId??"base",
      placementRequired:!0,
      visitorGranted:!1
    }:{
    }
  }
}
function applyMergeLabAction(s,r,f,{
  now:c=0
}={
}){
  try{
    const y=compileMergeLabCatalog(f),m=validateMergeLabPlayer(s,y);
    safeInteger(c,"server time"),plainObject(r,"action"),validatePayloadFields(r,["type","actionId","expectedMergeRevision","catalogVersion","payload","payloadHash"]),assertLab(typeof r.actionId=="string"&&/^\d+:[A-Za-z0-9_:.\-]{1,120}$/.test(r.actionId),"ACTION_ID_REQUIRED","A revision-prefixed stable actionId is required"),safeInteger(r.expectedMergeRevision,"expected revision");
    const E=hashMergeLabAction(r);
    assertLab(typeof r.payloadHash=="string"&&r.payloadHash===E,"PAYLOAD_HASH_MISMATCH","Payload hash missing or changed",409);
    const A=m.actionLedger.find(M=>M.actionId===r.actionId);
    if(A)return assertLab(A.payloadHash===E,"ACTION_ID_CONFLICT","Action ID already used with another payload",409),{
      ok:!0,
      player:clone(s),
      result:clone(A.result),
      replayed:!0
    };
    assertLab(r.actionId.startsWith(`${r.expectedMergeRevision}:`),"ACTION_ID_REVISION_CONFLICT","Action ID belongs to another revision",409),assertLab(r.expectedMergeRevision===m.mergeRevision,"REVISION_CONFLICT","Merge state changed; refresh before another transaction",409),assertLab(r.catalogVersion===y.version,"CATALOG_CONFLICT","Catalog changed; refresh before another transaction",409);
    const v=normalizeLabActionType(r.type);
    assertLab(hasOwn(MERGE_LAB_ACTION_FIELDS,v),"INVALID_ACTION","Unsupported Merge v3 action"),validatePayloadFields(r.payload,MERGE_LAB_ACTION_FIELDS[v]);
    const p=clone(s),g=p.merge;
    g.catalogVersion!==y.version&&(g.knowledge.testedPairs=Object.fromEntries(Object.entries(g.knowledge.testedPairs).filter(([,M])=>M.catalogVersion===y.version||M.recipeId!==null)),g.catalogVersion=y.version);
    const _=applyLabOperation(p,v,r.payload,y,c);
    return g.mergeRevision=addCounts(g.mergeRevision,1),g.actionLedger.push({
      actionId:r.actionId,
      payloadHash:E,
      revision:g.mergeRevision,
      result:clone(_)
    }),g.actionLedger=g.actionLedger.slice(-MERGE_LAB_RECEIPT_LIMIT),{
      ok:!0,
      player:p,
      result:_,
      replayed:!1
    }
  }
  catch(y){
    if(!(y instanceof MergeLabError))throw y;
    return{
      ok:!1,
      player:s,
      error:{
        code:y.code,
        message:y.message,
        status:y.status
      }
    }
  }
}

export {compileMergeLabCatalog, createMergeLabState, validateMergeLabPlayer, hashMergeLabAction, createMergeLabAction, createMergeLabQuote, applyMergeLabAction, hashCanonical, MergeLabError, MERGE_LAB_ACTION_FIELDS, MERGE_LAB_RECEIPT_LIMIT};

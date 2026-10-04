/** Semantic recovery from owned Merge v3 hf1 preview, not original authored source.
 * Global names are descriptive recovery labels; local names retain compiled spelling.
 * See evidence/recovery.json and scripts/recover-source.mjs. No framework/runtime is embedded.
 */
import * as React from 'react';
import {installPresentationMotion,settlePresentationMotion,sampleWellAtPoint} from '../shared/presentationMotion.js';
import * as jsxRuntime from 'react/jsx-runtime';
import {BookOpen, ChevronLeft, CircleQuestionMark, FlaskConical, House, Leaf, PackageOpen, Pause, Search, Sparkles, Star, Volume2, VolumeX, X as LabCloseIcon} from 'lucide-react';
import {audioManager} from '../../services/audioManager.js';
import {createDialogFocusManager} from '../../app/dialogFocus.js';
const mergeDialogFocusManager=createDialogFocusManager();
import {MERGE_LAB_CATALOG, mergeLabName} from '../../../game-logic/merge-lab-catalog.js';
// All displayed economic quotes must come from the authenticated server.
function estimateServerTime(s,r=Date.now()){
  const f=Number(s?.serverTime);
  if(!Number.isFinite(f)||f<=0)return r;
  const c=Number(s?.receivedAt||s?._receivedAt||s?.clientReceivedAt);
  return!Number.isFinite(c)||c<=0?f:f+Math.max(0,r-c)
}
const EN_COPY={
  yardUpdateShort:"Needs the Yard update",
  yardUpdateRequired:"Unlocks with the Yard update. No materials can be spent yet.",
  title:"The Alchemy Workshop",
  essence:"Essence",
  tokens:"Tokens",
  supplies:"Supplies",
  pause:"Pause",
  samples:"Samples",
  journal:"Journal",
  yard:"For the Yard",
  close:"Close",
  back:"Back",
  chooseSample:"Choose a sample",
  slot:"Sample {n}",
  clearSlot:"Clear sample {n}",
  sample:"Reusable sample",
  mix:"Combine",
  working:"Researching…",
  again:"Another experiment",
  freeResearch:"Experiments never consume your stock",
  knowledge:"Knowledge",
  opened:"Discovered",
  unknown:"Not discovered",
  inStock:"In stock: {n}",
  owned:"Owned",
  empty:"Choose two samples to begin",
  one:"Choose a second sample. You can use the same sample twice",
  ready:"Ready to combine",
  tested:"You have tried this pair. You can test it again",
  failed:"This pair gives nothing new yet. Both samples are safe",
  known:"Already discovered",
  new:"New discovery",
  noStock:"Knowledge saved. No physical copy created",
  useMaterials:"To make a physical copy, use real materials",
  why:"Game alchemy",
  tryAgain:"Try again",
  network:"No confirmed reply yet. Check the result before trying another action",
  conflict:"Your stock or catalog changed. Review a fresh quote before continuing",
  genericError:"Could not complete this action. Your last confirmed stock is shown",
  pending:"Waiting for confirmation…",
  retry:"Check result",
  received:"Received in your stock",
  crafted:"Physical item created",
  projectMade:"Added to your Yard inventory",
  discoveredBonus:"+{n} essence for a first discovery",
  category:"Category",
  categoryNames:{
    flora:"Plants",
    earth:"Earth",
    water:"Water",
    fire:"Fire",
    air:"Air",
    energy:"Energy",
    ideas:"Ideas"
  },
  search:"Search samples",
  searchPlaceholder:"Name or property…",
  all:"All",
  favorites:"Favorites",
  favorite:"Favorite {name}",
  unfavorite:"Remove {name} from favorites",
  goal:"For my goal",
  newFilter:"New",
  canTry:"Can try",
  noResults:"No samples match this filter",
  chooseFor:"Choose sample {n}",
  pickHint:"Tap a sample, then tap another. Or drag a recent sample into a well",
  nextSlot:"Next choice: sample {n}",
  traits:"Properties",
  source:"Source",
  starterSource:"Starting knowledge",
  savedSource:"Saved knowledge",
  researchSource:"Known reaction",
  connections:"Known connections",
  noConnections:"No connection recorded yet",
  testedTitle:"Experiments tried",
  failedPair:"No reaction",
  projectRecipe:"Material recipe",
  baseRecipe:"Base recipe",
  sameProjectOutput:"All recipes make the same Yard item.",
  essenceSaving:"Uses {n} less essence; spends the materials below instead.",
  zeroEssenceAlternative:"This material recipe costs 0 essence, just like the base recipe.",
  alternativeMaterials:"Uses the materials below.",
  recipe:"Physical recipe",
  craft:"Make",
  craftOne:"Make 1",
  review:"Review exact cost",
  cost:"You spend",
  result:"You receive",
  free:"Free",
  copies:"physical copies",
  confirm:"Confirm",
  refreshQuote:"Refresh quote",
  quoteExpired:"This quote expired. Review a fresh one",
  quoteValid:"Exact quote · valid {n} min",
  insufficient:"Not enough materials for this quote",
  available:"Have {have} / Need {need}",
  quantity:"Quantity",
  selectGoal:"Choose this goal",
  selected:"Current goal",
  projects:"Yard projects",
  stockKnowledge:"Samples are reusable. Crafting spends stock",
  needsDiscovery:"Discover the materials first",
  needsRecipe:"Research this connection first",
  projectOutput:"1 item in Yard inventory",
  yardFuture:"Saved in Yard inventory. Live interaction comes with the Yard update",
  yardReady:"Saved in Yard inventory. Open the Yard and place it from inventory",
  openYard:"Open Yard",
  projectOwned:"In Yard inventory: {n}",
  madeCount:"Made: {n}",
  hint:"Hint",
  hintFree:"Free hints; no discoveries or items granted",
  hintPropertyFallback:"Look for two known materials whose properties can work together",
  hint1:"Hint: a property",
  hint2:"Hint: one sample",
  hint3:"Reveal the pair",
  noHint:"All currently available discoveries are known. Make an item or try a known pair",
  usePair:"Try this pair",
  starterKit:"First workshop kit",
  starterKitBody:"One-time physical materials for your first useful project",
  claimed:"Already collected",
  getKit:"Collect free kit",
  charges:"Supply charges",
  getCharges:"Collect {n} free charges",
  recharge:"One charge every {n} min, up to {cap}",
  nextCharge:"Next in {n} min",
  fullCharges:"Charge bank is full",
  freeMaterial:"Choose a physical material",
  getMaterial:"1 charge → 1 copy",
  daily:"Daily supplies",
  collectDaily:"Collect free supplies",
  dailyClaimed:"Collected today · next reset at 00:00 UTC",
  tokenPacks:"Fixed token packs",
  fixedPack:"Exact contents. No random items",
  packLocked:"Discover every material in this pack first",
  buyPack:"{n} tokens → this pack",
  crops:"Use a selected harvest",
  cropHelp:"Spends only the selected crop. No automatic harvest use",
  chooseCrop:"Choose a crop",
  cropPrice:"{n} harvested {name}",
  useCrop:"Exchange selected harvest",
  noCrop:"No supported harvested crops available",
  realStock:"Real stock",
  stockEmpty:"No physical materials yet. Collect your free workshop kit",
  distill:"Distill stock",
  distillHelp:"Consumes real copies and gives essence. Your reusable sample remains known",
  distillOne:"Distill 1",
  exchange:"Essence exchange",
  treats:"Yard treats",
  shinyTreats:"Shiny treats",
  dailyLimit:"Daily limit: {n}",
  remaining:"Remaining today: {n}",
  resume:"Continue",
  exit:"Exit workshop",
  sound:"Sound",
  motion:"Reduced motion",
  on:"On",
  off:"Off",
  pauseNote:"Your experiment is safe. Supply timers keep running",
  version:"Catalog {version}",
  effectUnavailable:"No visit or guest is created by crafting",
  itemDetails:"Details",
  settings:"Workshop settings",
  firstGoal:"Discover the materials for your goal",
  stage:"Step {n} of 3",
  tryKnown:"Use these samples",
  inventoryOnly:"Inventory item",
  stockTab:"Make / stock",
  reactionTab:"Connections",
  noFailed:"No unsuccessful experiments recorded",
  busyElsewhere:"An action is awaiting confirmation",
  language:"Language",
  minute:"min",
  cancel:"Cancel",
  outputZero:"Research creates no physical items",
  requirements:"Materials required",
  cropNames:{
    strawberry:"Strawberry",
    blueberry:"Blueberry",
    tomato:"Tomato",
    golden:"Golden rose",
    corn:"Corn",
    sunflower:"Sunflower",
    watermelon:"Watermelon",
    pumpkin:"Pumpkin"
  }
},RU_COPY={
  yardUpdateShort:"Нужно обновление Двора",
  yardUpdateRequired:"Откроется с обновлением Двора. Пока материалы не расходуются.",
  title:"Алхимическая мастерская",
  essence:"Эссенция",
  tokens:"Жетоны",
  supplies:"Поставки",
  pause:"Пауза",
  samples:"Образцы",
  journal:"Журнал",
  yard:"Для двора",
  close:"Закрыть",
  back:"Назад",
  chooseSample:"Выберите образец",
  slot:"Образец {n}",
  clearSlot:"Убрать образец {n}",
  sample:"Многоразовый образец",
  mix:"Смешать",
  working:"Идёт опыт…",
  again:"Ещё опыт",
  freeResearch:"Опыты не расходуют запасы",
  knowledge:"Знания",
  opened:"Открыто",
  unknown:"Не открыто",
  inStock:"В запасе: {n}",
  owned:"Есть",
  empty:"Выберите два образца для опыта",
  one:"Выберите второй образец. Можно взять тот же дважды",
  ready:"Можно смешать",
  tested:"Эта пара уже проверена. Можно повторить опыт",
  failed:"Пока ничего нового. Оба образца сохранены",
  known:"Уже открыто",
  new:"Новое открытие",
  noStock:"Знание сохранено. Экземпляр ещё не изготовлен",
  useMaterials:"Для изготовления нужны настоящие материалы",
  why:"Игровая алхимия",
  tryAgain:"Попробовать ещё",
  network:"Ответ ещё не подтверждён. Проверьте результат перед новым действием",
  conflict:"Запасы или каталог изменились. Проверьте новую смету",
  genericError:"Не удалось завершить действие. Показаны последние подтверждённые запасы",
  pending:"Ждём подтверждения…",
  retry:"Проверить результат",
  received:"Получено в запасы",
  crafted:"Экземпляр изготовлен",
  projectMade:"Добавлено в инвентарь двора",
  discoveredBonus:"+{n} эссенции за первое открытие",
  category:"Раздел",
  categoryNames:{
    flora:"Растения",
    earth:"Земля",
    water:"Вода",
    fire:"Огонь",
    air:"Воздух",
    energy:"Энергия",
    ideas:"Идеи"
  },
  search:"Поиск образцов",
  searchPlaceholder:"Название или свойство…",
  all:"Все",
  favorites:"Избранное",
  favorite:"В избранное: {name}",
  unfavorite:"Убрать из избранного: {name}",
  goal:"Для моей цели",
  newFilter:"Новое",
  canTry:"Можно попробовать",
  noResults:"Нет образцов по этому фильтру",
  chooseFor:"Выберите образец {n}",
  pickHint:"Нажмите на два образца или перетащите недавний образец в гнездо",
  nextSlot:"Следующий выбор: образец {n}",
  traits:"Свойства",
  source:"Источник",
  starterSource:"Начальные знания",
  savedSource:"Сохранённые знания",
  researchSource:"Известная реакция",
  connections:"Известные связи",
  noConnections:"Связи ещё не записаны",
  testedTitle:"Проверенные опыты",
  failedPair:"Нет реакции",
  projectRecipe:"Рецепт изготовления",
  baseRecipe:"Базовый рецепт",
  sameProjectOutput:"Все рецепты дают один и тот же предмет двора.",
  essenceSaving:"На {n} эссенции меньше; вместо неё расходуются материалы ниже.",
  zeroEssenceAlternative:"Этот рецепт, как и базовый, требует 0 эссенции.",
  alternativeMaterials:"Нужны материалы ниже.",
  recipe:"Изготовление экземпляра",
  craft:"Изготовить",
  craftOne:"Изготовить 1",
  review:"Посмотреть точную смету",
  cost:"Вы расходуете",
  result:"Вы получаете",
  free:"Бесплатно",
  copies:"экземпляры",
  confirm:"Подтвердить",
  refreshQuote:"Обновить смету",
  quoteExpired:"Смета устарела. Проверьте новую",
  quoteValid:"Точная смета · ещё {n} мин",
  insufficient:"Не хватает материалов по этой смете",
  available:"Есть {have} / Нужно {need}",
  quantity:"Количество",
  selectGoal:"Выбрать эту цель",
  selected:"Текущая цель",
  projects:"Проекты для двора",
  stockKnowledge:"Образцы многоразовые. Изготовление расходует запасы",
  needsDiscovery:"Сначала откройте материалы",
  needsRecipe:"Сначала исследуйте эту связь",
  projectOutput:"1 предмет в инвентарь двора",
  yardFuture:"Сохранено в инвентаре двора. Живое взаимодействие появится с обновлением двора",
  yardReady:"Сохранено в инвентаре двора. Откройте двор и разместите предмет из инвентаря",
  openYard:"Открыть двор",
  projectOwned:"В инвентаре двора: {n}",
  madeCount:"Изготовлено: {n}",
  hint:"Подсказка",
  hintFree:"Бесплатные подсказки без открытий и предметов",
  hintPropertyFallback:"Ищите два известных материала, свойства которых работают вместе",
  hint1:"Подсказка: свойство",
  hint2:"Подсказка: один образец",
  hint3:"Раскрыть пару",
  noHint:"Все доступные открытия найдены. Изготовьте предмет или проверьте известную пару",
  usePair:"Проверить эту пару",
  starterKit:"Первый набор мастера",
  starterKitBody:"Настоящие материалы для первого полезного проекта. Только один раз",
  claimed:"Уже получено",
  getKit:"Получить бесплатный набор",
  charges:"Заряды поставок",
  getCharges:"Забрать заряды: {n}",
  recharge:"1 заряд за {n} мин, максимум {cap}",
  nextCharge:"Следующий через {n} мин",
  fullCharges:"Все заряды накоплены",
  freeMaterial:"Выберите настоящий материал",
  getMaterial:"1 заряд → 1 экземпляр",
  daily:"Ежедневные поставки",
  collectDaily:"Получить бесплатно",
  dailyClaimed:"Сегодня получено · обновление в 00:00 UTC",
  tokenPacks:"Наборы за жетоны",
  fixedPack:"Точный состав. Без случайных предметов",
  packLocked:"Сначала откройте все материалы набора",
  buyPack:"{n} жетонов → этот набор",
  crops:"Выбранный урожай",
  cropHelp:"Расходуется только выбранная культура. Автоматического списания нет",
  chooseCrop:"Выберите культуру",
  cropPrice:"{n} ед. урожая: {name}",
  useCrop:"Обменять выбранный урожай",
  noCrop:"Нет подходящего собранного урожая",
  realStock:"Настоящие запасы",
  stockEmpty:"Пока нет настоящих материалов. Получите бесплатный первый набор",
  distill:"Перегонка запасов",
  distillHelp:"Расходует реальные экземпляры и даёт эссенцию. Образец остаётся открытым",
  distillOne:"Перегнать 1",
  exchange:"Обмен эссенции",
  treats:"Лакомства для двора",
  shinyTreats:"Сияющие лакомства",
  dailyLimit:"В сутки: {n}",
  remaining:"Сегодня осталось: {n}",
  resume:"Продолжить",
  exit:"Выйти из мастерской",
  sound:"Звук",
  motion:"Меньше движения",
  on:"Вкл.",
  off:"Выкл.",
  pauseNote:"Опыт сохранён. Время поставок продолжает идти",
  version:"Каталог {version}",
  effectUnavailable:"Изготовление не вызывает визит и не создаёт гостя",
  itemDetails:"Подробнее",
  settings:"Настройки мастерской",
  firstGoal:"Откройте материалы для своей цели",
  stage:"Шаг {n} из 3",
  tryKnown:"Взять эти образцы",
  inventoryOnly:"Предмет инвентаря",
  stockTab:"Изготовление / запасы",
  reactionTab:"Связи",
  noFailed:"Неудачных опытов пока нет",
  busyElsewhere:"Действие ожидает подтверждения",
  language:"Язык",
  minute:"мин",
  cancel:"Отмена",
  outputZero:"Опыт не выдаёт настоящих предметов",
  requirements:"Нужные материалы",
  cropNames:{
    strawberry:"Клубника",
    blueberry:"Черника",
    tomato:"Помидор",
    golden:"Золотая роза",
    corn:"Кукуруза",
    sunflower:"Подсолнух",
    watermelon:"Арбуз",
    pumpkin:"Тыква"
  }
},COPY_BY_LANGUAGE={
  en:EN_COPY,
  ru:RU_COPY
};
function translateMergeLab(s="ru"){
  const r=COPY_BY_LANGUAGE[s]||RU_COPY;
  return(f,c={
  })=>{
    let y=r[f]??EN_COPY[f]??f;
    if(typeof y!="string")return y;
    for(const[m,E]
    of Object.entries(c))y=y.replaceAll(`{${m}}`,String(E));
    return y
  }
}
function localizedText(s,r="ru"){
  return typeof s=="string"?s:s?.[r]||s?.en||s?.ru||""
}
function labErrorMessage(s,r){
  const f=s?.code||"";
  return/CONFLICT|EXPIRED|MIGRATION/.test(f)?r("conflict"):/INSUFFICIENT|EXHAUSTED/.test(f)?r("insufficient"):/LOCKED|NO_REACHABLE_HINT/.test(f)?r("needsDiscovery"):/CLAIMED|LIMIT/.test(f)?r("claimed"):r("genericError")
}
function calculateLabLayout(s,r,f={
}){
  const c=V=>Number.isFinite(Number(V))?Math.max(0,Number(V)):0,y=Math.max(1,c(s)),m=Math.max(1,c(r)),E=Math.min(c(f.top),m-1),A=Math.min(c(f.bottom),Math.max(0,m-E-1)),v=Math.min(c(f.left),y-1),p=Math.min(c(f.right),Math.max(0,y-v-1)),g=Math.max(1,y-v-p),_=Math.max(1,m-E-A),M=g>=480&&g>_,Z=g<360||_<(M?420:700),X=Z?8:12,J=Z?6:8,G=Math.max(1,Math.min(1024,g-X*2)),k=M?Math.min(360,Math.max(240,G*.38)):G,ie=M?Z?12:24:0,b=M?Math.max(1,G-k-ie):G,K=M?Z?314:510:Z?548:738;
  return{
    width:y,
    height:m,
    availableWidth:g,
    availableHeight:_,
    safeInsets:{
      top:E,
      right:p,
      bottom:A,
      left:v
    },
    landscape:M,
    compact:Z,
    padding:X,
    gap:J,
    contentWidth:G,
    railWidth:k,
    columnGap:ie,
    laboratoryWidth:b,
    minimumHeight:K,
    requiresScroll:_<K,
    recentCount:Z?4:8
  }
}
function countIngredients(s=[]){
  return Array.isArray(s)?s.reduce((r,f)=>{
    const c=typeof f=="string"?f:f.itemId;
    return r[c]=(r[c]||0)+(typeof f=="string"?1:f.quantity),r
  }
  ,{
  }):{
    ...s
  }
}
function uiPairKey(s,r){
  return[s,r].sort().join("+")
}
function projectDependencyIds(s,r,{
  includeVariants:f=!0
}={
}){
  const c=[...Object.keys(countIngredients(r?.inputs)),...f?(r?.variants||[]).flatMap(E=>Object.keys(countIngredients(E.inputs))):[]],y=new Set(c);
  let m=!0;
  for(;m;){
    m=!1;
    for(const E
    of s.recipes)if(y.has(E.result))for(const A
    of E.ingredients)y.has(A)||(y.add(A),m=!0)
  }
  return y
}
function selectReachableHint(s,r,f){
  const c=new Set(r.itemIds),y=new Set(r.recipeIds),m=s.recipes.filter(v=>!y.has(v.id)&&!c.has(v.result)&&v.ingredients.every(p=>c.has(p))),E=projectDependencyIds(s,f,{
    includeVariants:!1
  }),A=projectDependencyIds(s,f);
  return m.find(v=>E.has(v.result))||m.find(v=>A.has(v.result))||m[0]||null
}
function laboratoryStatus(s,r,f,c,y){
  if(r)return"pending";
  if(f?.error)return"error";
  if(f?.outcome)return f.outcome;
  if(!s[0]&&!s[1])return"empty";
  if(!s[0]||!s[1])return"one";
  const m=c?.[uiPairKey(...s)];
  return m&&(m.recipeId||m.catalogVersion===y)?"tested":"ready"
}
function quoteShortages(s,r){
  const f=r.merge||{
  },c=[];
  for(const[y,m]
  of Object.entries(s.stockCost||{
  }))(f.stock?.[y]||0)<m&&c.push({
    kind:"stock",
    id:y,
    required:m,
    available:f.stock?.[y]||0
  });
  for(const[y,m]
  of Object.entries(s.cropCost||{
  }))(r.farm?.harvested?.[y]||0)<m&&c.push({
    kind:"crop",
    id:y,
    required:m,
    available:r.farm?.harvested?.[y]||0
  });
  for(const[y,m,E]
  of[["essence",s.essenceCost,f.alchemyEssence],["tokens",s.tokenCost,r.resources?.gachaTokens],["charges",s.freeChargeCost,f.freeTapCharges]])(m||0)>(E||0)&&c.push({
    kind:y,
    required:m,
    available:E||0
  });
  return c
}
function supplyChargeStatus(s,r,f){
  const c=r.chargeCap,y=r.rechargeMs,m=s.freeTapCharges||0,E=Math.max(0,Math.floor((f-(s.lastFreeTaps||0))/y)),A=s.supply?.rechargeInitialized?Math.min(Math.max(0,c-m),E):Math.max(0,c-m),v=m>=c?0:Math.max(0,y-Math.max(0,f-(s.lastFreeTaps||f))%y);
  return{
    bank:m,
    capacity:c,
    earned:A,
    waitMs:v
  }
}
const MERGE_LAB_ASSET_ROOT="/games/merge-lab-v3/",formatCount=(s,r)=>new Intl.NumberFormat(r==="ru"?"ru-RU":"en-US").format(Number(s)||0),noop=()=>{
}
,newRequestId=()=>globalThis.crypto?.randomUUID?.()||`lab_${Date.now()}_${Math.random().toString(36).slice(2)}`,indexCatalogItems=s=>Object.fromEntries(s.items.map(r=>[r.id,r])),catalogNameFor=(s,r)=>{
  const f=indexCatalogItems(s);
  return c=>mergeLabName(f[c]||s.projects.find(y=>y.output.itemId===c)||{
    id:c
  },r)
}
;
function itemPropertyText(s,r){
  const f=s?.properties||s?.traits,c=Array.isArray(f)?f:f?.[r]||f?.en;
  return Array.isArray(c)?c.map(y=>localizedText(y,r)).filter(Boolean).slice(0,2).join(" · "):localizedText(c,r)
}
function readPreference(s,r){
  try{
    return JSON.parse(localStorage.getItem(s))??r
  }
  catch{
    return r
  }
}
function savePreference(s,r){
  try{
    localStorage.setItem(s,JSON.stringify(r))
  }
  catch{
  }
}
function useLabLayout(s,r){
  const[f,c]=React.useState({
    width:390,
    height:844
  });
  return React.useEffect(()=>{
    const y=s.current;
    if(!y)return;
    const m=()=>{
      const A=y.getBoundingClientRect();
      A.width&&A.height&&c(v=>v.width===A.width&&v.height===A.height?v:{
        width:A.width,
        height:A.height
      })
    }
    ;
    m();
    const E=typeof ResizeObserver<"u"?new ResizeObserver(m):null;
    return E?.observe(y),window.addEventListener("resize",m),window.addEventListener("orientationchange",m),window.visualViewport?.addEventListener("resize",m),()=>{
      E?.disconnect(),window.removeEventListener("resize",m),window.removeEventListener("orientationchange",m),window.visualViewport?.removeEventListener("resize",m)
    }
  }
  ,[s]),calculateLabLayout(f.width,f.height,r)
}
function LabItemArt({
  id:s,
  catalog:r=MERGE_LAB_CATALOG,
  className:f=""
}){
  const c=r.items.find(y=>y.id===s);
  return c?jsxRuntime.jsx("img",{
    className:`ml-item-art ${f}`,
    src:c.asset||`${MERGE_LAB_ASSET_ROOT}items/${s}.webp`,
    alt:"",
    draggable:"false",
    decoding:"async"
  }):null
}
function LabButton({
  children:s,
  className:r="",
  primary:f=!1,...c
}){
  return jsxRuntime.jsx("button",{
    type:"button",
    className:`ml-button ${f?"ml-button-primary":""} ${r}`,...c,
    children:s
  })
}
function LabItemLine({
  id:s,
  quantity:r,
  catalog:f,
  language:c,
  children:y
}){
  const m=catalogNameFor(f,c)(s);
  return jsxRuntime.jsxs("li",{
    className:"ml-item-line",
    children:[jsxRuntime.jsx(LabItemArt,{
      id:s,
      catalog:f
    }),jsxRuntime.jsx("span",{
      className:"ml-item-line-name",
      children:m
    }),r!==void 0&&jsxRuntime.jsxs("strong",{
      children:["×",formatCount(r,c)]
    }),y]
  })
}
function LabContents({
  values:s,
  catalog:r,
  language:f
}){
  return jsxRuntime.jsx("ul",{
    className:"ml-contents",
    children:Object.entries(s||{
    }).map(([c,y])=>jsxRuntime.jsx(LabItemLine,{
      id:c,
      quantity:y,
      catalog:r,
      language:f
    },c))
  })
}
function LabNotice({
  notice:s,
  retry:r,
  pending:f,
  t:c
}){
  return s?jsxRuntime.jsxs("div",{
    className:`ml-notice ${s.error?"ml-notice-error":""}`,
    role:s.error?"alert":"status",
    children:[jsxRuntime.jsx("span",{
      children:s.text
    }),s.retry&&jsxRuntime.jsx(LabButton,{
      onClick:r,
      disabled:f,
      children:c("retry")
    })]
  }):null
}
function LabDialog({
  title:s,
  children:r,
  onClose:f,
  onBack:c,
  t:y,
  id:m
}){
  const E=React.useId(),A=m||E,v=React.useRef(null),opener=React.useRef(null);
  // Keep one opener for this mounted dialog through Supplies → Quote → Back.
  // Title changes refresh the focus trap but must not replace the outside return target.
  React.useEffect(()=>{
    const dialog=v.current;
    opener.current??=document.activeElement;
    const ownership=mergeDialogFocusManager.begin(dialog);
    return()=>{
      const mayRestore=ownership.end();
      // Parent cleanup releases workspace inertness after the child unmounts.
      window.requestAnimationFrame(()=>{
        const target=opener.current,focused=document.activeElement===document.body?null:document.activeElement;
        if(mayRestore(target,focused)&&!target.closest?.('[inert]'))target.focus({preventScroll:true});
      });
    };
  },[]);
  return React.useEffect(()=>{
    const g=v.current,_=()=>[...g.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(X=>!X.hidden&&!X.closest("[hidden]"));
    (_()[0]||g).focus({
      preventScroll:!0
    });
    const M=X=>{
      if(X.key==="Escape"&&!X.defaultPrevented&&!X.isComposing&&[...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1)===g){
        X.preventDefault();
        X.stopPropagation();
        f();
        return
      }
      if(X.key==="Tab"){
        const J=_(),G=J[0],k=J.at(-1);
        G?X.shiftKey&&(document.activeElement===G||document.activeElement===g)?(X.preventDefault(),k.focus()):!X.shiftKey&&document.activeElement===k&&(X.preventDefault(),G.focus()):(X.preventDefault(),g.focus())
      }
    }
    ;
    document.addEventListener("keydown",M,!0);
    const Z=X=>{
      g&&!g.contains(X.target)&&(_()[0]||g).focus({
        preventScroll:!0
      })
    }
    ;
    return document.addEventListener("focusin",Z),()=>{
      document.removeEventListener("keydown",M,!0),document.removeEventListener("focusin",Z)
    }
  }
  ,[f,s]),jsxRuntime.jsx("div",{
    className:"ml-modal-backdrop",
    children:jsxRuntime.jsxs("section",{
      ref:v,
      className:"ml-dialog",
      "data-testid":"ml-drawer",
      "data-hud-region":"mergeLabDialog",
      role:"dialog",
      "aria-modal":"true",
      "aria-labelledby":A,
      tabIndex:-1,
      children:[jsxRuntime.jsxs("header",{
        className:"ml-dialog-heading",
        children:[c&&jsxRuntime.jsx(LabButton,{
          className:"ml-icon-button",
          "aria-label":y("back"),
          onClick:c,
          children:jsxRuntime.jsx(ChevronLeft,{
          })
        }),jsxRuntime.jsx("h2",{
          id:A,
          children:s
        }),jsxRuntime.jsx(LabButton,{
          className:"ml-icon-button",
          "data-testid":"ml-drawer-close",
          "aria-label":y("close"),
          onClick:f,
          children:jsxRuntime.jsx(LabCloseIcon,{
          })
        })]
      }),jsxRuntime.jsx("div",{
        className:"ml-dialog-scroll",
        children:r
      })]
    })
  })
}
function LabSamples({
  player:s,
  catalog:r=MERGE_LAB_CATALOG,
  language:f="ru",
  favorites:c=[],
  newIds:y=[],
  activeSlot:m=0,
  onPick:E=noop,
  onFavorite:A=noop,
  onDetail:v=noop
}){
  const p=translateMergeLab(f),[g,_]=React.useState(""),[M,Z]=React.useState("all"),[X,J]=React.useState("all"),G=s.merge.knowledge,k=r.projects.find(q=>q.id===s.merge.projects.selectedId),ie=projectDependencyIds(r,k),b=new Set(G.itemIds),K=g.trim().toLocaleLowerCase(f),V=q=>q.category||q.legacyChain||"ideas",te=[...new Set(r.items.filter(q=>b.has(q.id)).map(V))],w=q=>localizedText(Array.isArray(r.categories)?r.categories.find(B=>B.id===q)?.names:r.categories?.[q]?.names,f)||p("categoryNames")[q]||q,ue=r.items.filter(q=>b.has(q.id)&&(X==="all"||V(q)===X)&&(!K||`${mergeLabName(q,f)} ${itemPropertyText(q,f)}`.toLocaleLowerCase(f).includes(K))&&(M==="all"||M==="favorites"&&c.includes(q.id)||M==="goal"&&ie.has(q.id)||M==="newFilter"&&y.includes(q.id)||M==="canTry"&&G.itemIds.some(B=>!G.testedPairs[uiPairKey(q.id,B)])));
  return jsxRuntime.jsxs(jsxRuntime.Fragment,{
    children:[jsxRuntime.jsx("p",{
      className:"ml-lead",
      children:p("chooseFor",{
        n:m+1
      })
    }),jsxRuntime.jsx("p",{
      className:"ml-muted",
      children:p("freeResearch")
    }),jsxRuntime.jsxs("label",{
      className:"ml-search",
      children:[jsxRuntime.jsx(Search,{
        "aria-hidden":"true"
      }),jsxRuntime.jsx("span",{
        className:"ml-sr-only",
        children:p("search")
      }),jsxRuntime.jsx("input",{
        "data-testid":"ml-sample-search",
        type:"search",
        value:g,
        onChange:q=>_(q.target.value),
        placeholder:p("searchPlaceholder")
      })]
    }),jsxRuntime.jsxs("label",{
      className:"ml-field",
      children:[p("category"),jsxRuntime.jsxs("select",{
        "data-testid":"ml-sample-category",
        value:X,
        onChange:q=>J(q.target.value),
        children:[jsxRuntime.jsx("option",{
          value:"all",
          children:p("all")
        }),te.map(q=>jsxRuntime.jsx("option",{
          value:q,
          children:w(q)
        },q))]
      })]
    }),jsxRuntime.jsx("div",{
      className:"ml-filter-row",
      "aria-label":p("samples"),
      children:["all","favorites","goal","newFilter","canTry"].map(q=>jsxRuntime.jsx(LabButton,{
        "aria-pressed":M===q,
        onClick:()=>Z(q),
        children:p(q)
      },q))
    }),jsxRuntime.jsx("div",{
      className:"ml-catalog-grid",
      "data-testid":"ml-sample-list",
      children:ue.map(q=>jsxRuntime.jsxs("article",{
        className:"ml-catalog-card",
        "data-testid":`ml-sample-${q.id}`,
        children:[jsxRuntime.jsxs("button",{
          type:"button",
          className:"ml-sample-pick",
          "data-testid":`ml-sample-pick-${q.id}`,
          onClick:()=>E(q.id),
          children:[jsxRuntime.jsx(LabItemArt,{
            id:q.id,
            catalog:r
          }),jsxRuntime.jsx("strong",{
            children:mergeLabName(q,f)
          }),jsxRuntime.jsx("span",{
            className:"ml-muted",
            children:itemPropertyText(q,f)||p("opened")
          })]
        }),jsxRuntime.jsxs("div",{
          className:"ml-catalog-tools",
          children:[jsxRuntime.jsx(LabButton,{
            className:"ml-icon-button",
            "data-testid":`ml-sample-details-${q.id}`,
            "aria-label":`${p("itemDetails")}: ${mergeLabName(q,f)}`,
            onClick:()=>v(q.id),
            children:jsxRuntime.jsx(BookOpen,{
              "aria-hidden":"true"
            })
          }),jsxRuntime.jsx(LabButton,{
            className:"ml-icon-button",
            "aria-pressed":c.includes(q.id),
            "aria-label":p(c.includes(q.id)?"unfavorite":"favorite",{
              name:mergeLabName(q,f)
            }),
            onClick:()=>A(q.id),
            children:jsxRuntime.jsx(Star,{
              "aria-hidden":"true",
              fill:c.includes(q.id)?"currentColor":"none"
            })
          })]
        })]
      },q.id))
    }),!ue.length&&jsxRuntime.jsx("p",{
      className:"ml-empty",
      children:p("noResults")
    })]
  })
}
function LabItemDetails({
  player:s,
  catalog:r,
  language:f,
  run:c,
  busy:y,
  onPair:m
}){
  const E=translateMergeLab(f),A=r.projects.find(Z=>Z.id===s.merge.projects.selectedId),v=selectReachableHint(r,s.merge.knowledge,A),p=v&&s.merge.knowledge.hintStages[v.id]||0,g=catalogNameFor(r,f),_=v?.hints,M=p===1?localizedText(_?.[0],f)||localizedText(v?.hint?.property,f)||E("hintPropertyFallback"):p===2?localizedText(_?.[1],f)||g(v?.ingredients[0]):p===3?v.ingredients.map(g).join(" + "):"";
  return jsxRuntime.jsxs("section",{
    className:"ml-section ml-hint",
    "data-testid":"ml-hint",
    children:[jsxRuntime.jsxs("h3",{
      children:[jsxRuntime.jsx(CircleQuestionMark,{
        "aria-hidden":"true"
      }),E("hint")]
    }),jsxRuntime.jsx("p",{
      className:"ml-muted",
      children:E("hintFree")
    }),v?jsxRuntime.jsxs(jsxRuntime.Fragment,{
      children:[p>0&&jsxRuntime.jsxs("p",{
        className:"ml-hint-reveal",
        role:"status",
        children:[jsxRuntime.jsx("small",{
          children:E("stage",{
            n:p
          })
        }),M]
      }),p<3?jsxRuntime.jsx(LabButton,{
        "data-testid":p===2?"ml-hint-reveal":"ml-hint-next",
        disabled:y,
        onClick:()=>c("requestHint",{
          recipeId:v.id,
          stage:p+1
        }),
        children:E(`hint${p+1}`)
      }):jsxRuntime.jsx(LabButton,{
        onClick:()=>m(v.ingredients),
        children:E("usePair")
      })]
    }):jsxRuntime.jsx("p",{
      children:E("noHint")
    })]
  })
}
function LabJournal({
  player:s,
  catalog:r=MERGE_LAB_CATALOG,
  language:f="ru",
  itemId:c,
  onItem:y=noop,
  onQuote:m=noop,
  onPair:E=noop,
  run:A=noop,
  busy:v=!1
}){
  const p=translateMergeLab(f),g=catalogNameFor(r,f),_=s.merge,M=indexCatalogItems(r),Z=M[c]||M[_.knowledge.itemIds.at(-1)]||r.items[0],X=r.recipes.filter(b=>_.knowledge.recipeIds.includes(b.id)),J=X.filter(b=>b.result===Z.id||b.ingredients.includes(Z.id)),G=Object.entries(_.knowledge.testedPairs).filter(([,b])=>!b.recipeId&&b.catalogVersion===r.version),k=r.starterItemIds.includes(Z.id)?p("starterSource"):X.some(b=>b.result===Z.id)?p("researchSource"):p("savedSource"),ie=r.projects.filter(b=>projectDependencyIds(r,b).has(Z.id));
  return jsxRuntime.jsxs("div",{
    className:"ml-panel-body",
    "data-testid":"ml-journal",
    children:[jsxRuntime.jsxs("p",{
      className:"ml-info",
      children:p("stockKnowledge")
    }),jsxRuntime.jsxs("label",{
      className:"ml-field",
      children:[p("knowledge"),jsxRuntime.jsx("select",{
        value:Z.id,
        onChange:b=>y(b.target.value),
        children:_.knowledge.itemIds.filter(b=>M[b]).map(b=>jsxRuntime.jsx("option",{
          value:b,
          children:g(b)
        },b))
      })]
    }),jsxRuntime.jsxs("section",{
      className:"ml-item-detail",
      "data-testid":"ml-journal-item",
      children:[jsxRuntime.jsx(LabItemArt,{
        id:Z.id,
        catalog:r
      }),jsxRuntime.jsxs("div",{
        children:[jsxRuntime.jsx("h3",{
          children:g(Z.id)
        }),jsxRuntime.jsx("p",{
          children:itemPropertyText(Z,f)
        }),jsxRuntime.jsxs("p",{
          className:"ml-good",
          children:[p("opened")," · ",p("inStock",{
            n:formatCount(_.stock[Z.id],f)
          })]
        }),jsxRuntime.jsxs("p",{
          className:"ml-muted",
          children:[p("source"),": ",k]
        })]
      })]
    }),ie.length>0&&jsxRuntime.jsxs("p",{
      className:"ml-info",
      children:[p("goal"),": ",ie.map(b=>mergeLabName(b,f)).join(" · ")]
    }),jsxRuntime.jsx("h3",{
      children:p("connections")
    }),J.map(b=>jsxRuntime.jsxs("article",{
      className:"ml-recipe-card",
      children:[jsxRuntime.jsxs("div",{
        className:"ml-recipe-equation",
        children:[b.ingredients.map((K,V)=>jsxRuntime.jsxs(React.Fragment,{
          children:[V>0&&jsxRuntime.jsx("span",{
            children:"+"
          }),jsxRuntime.jsxs("span",{
            children:[jsxRuntime.jsx(LabItemArt,{
              id:K,
              catalog:r
            }),g(K)]
          })]
        },`${K}-${V}`)),jsxRuntime.jsx("span",{
          children:"→"
        }),jsxRuntime.jsxs("span",{
          children:[jsxRuntime.jsx(LabItemArt,{
            id:b.result,
            catalog:r
          }),g(b.result)]
        })]
      }),jsxRuntime.jsxs("p",{
        children:[jsxRuntime.jsxs("strong",{
          children:[p("why"),": "]
        }),localizedText(b.why,f)]
      }),jsxRuntime.jsxs("div",{
        className:"ml-actions",
        children:[jsxRuntime.jsx(LabButton,{
          disabled:v,
          onClick:()=>E(b.ingredients),
          children:p("tryKnown")
        }),jsxRuntime.jsx(LabButton,{
          "data-testid":`ml-recipe-quote-${b.id}`,
          disabled:v,
          onClick:()=>m("craft",{
            recipeId:b.id,
            quantity:1
          },`${p("craft")}: ${g(b.result)}`),
          children:p("craftOne")
        })]
      }),jsxRuntime.jsx("p",{
        className:"ml-muted",
        children:p("useMaterials")
      })]
    },b.id)),!J.length&&jsxRuntime.jsx("p",{
      className:"ml-empty",
      children:p("noConnections")
    }),jsxRuntime.jsx(LabItemDetails,{
      player:s,
      catalog:r,
      language:f,
      run:A,
      busy:v,
      onPair:E
    }),jsxRuntime.jsxs("details",{
      className:"ml-section",
      children:[jsxRuntime.jsxs("summary",{
        children:[p("testedTitle")," · ",G.length]
      }),G.length?G.map(([b])=>jsxRuntime.jsxs("div",{
        className:"ml-tested-row",
        children:[jsxRuntime.jsx("span",{
          children:b.split("+").map(g).join(" + ")
        }),jsxRuntime.jsx("span",{
          className:"ml-muted",
          children:p("failedPair")
        })]
      },b)):jsxRuntime.jsx("p",{
        children:p("noFailed")
      })]
    })]
  })
}
function LabProjects({
  player:s,
  catalog:r=MERGE_LAB_CATALOG,
  language:f="ru",
  onQuote:c=noop,
  run:y=noop,
  busy:m=!1,
  onItem:E=noop,
  onOpenYard:A,
  selectedVariantIds:v,
  onVariantChange:p
}){
  const g=translateMergeLab(f),_=s.merge,[M,Z]=React.useState({
  }),X=v??M,J=(G,k)=>{
    p?p(G,k):Z(ie=>({
      ...ie,
      [G]:k
    }))
  }
  ;
  return jsxRuntime.jsxs("div",{
    className:"ml-panel-body",
    "data-testid":"ml-projects",
    children:[jsxRuntime.jsx("p",{
      className:"ml-info",
      children:g("stockKnowledge")
    }),jsxRuntime.jsx("div",{
      className:"ml-project-list",
      children:r.projects.map(G=>{
        const releaseBlocked=G.requiresYardV3===true && _.releasePolicy?.yardV3ProjectsEnabled!==true;
        const k=_.projects.selectedId===G.id,ie=(G.variants||[]).find(B=>B.id===X[G.id]),b=ie?.id||"base",K=countIngredients(ie?.inputs||G.inputs),V=ie?.essenceCost??G.essenceCost,te=Object.keys(K).every(B=>_.knowledge.itemIds.includes(B)),w=s.yard?.goodieInventory?.[G.output.itemId]||0,ue=ie?mergeLabName(ie,f):g("baseRecipe"),q=Math.max(0,G.essenceCost-V);
        return jsxRuntime.jsxs("article",{
          className:`ml-project-card ${k?"ml-selected":""}`,
          "data-testid":`ml-project-${G.id}`,
          children:[jsxRuntime.jsxs("header",{
            children:[jsxRuntime.jsxs("div",{
              children:[jsxRuntime.jsx("span",{
                className:"ml-eyebrow",
                children:g(k?"selected":"projects")
              }),jsxRuntime.jsx("h3",{
                children:mergeLabName(G,f)
              })]
            }),G.asset?jsxRuntime.jsx("img",{
              className:"ml-item-art",
              src:G.asset,
              alt:"",
              draggable:"false"
            }):jsxRuntime.jsxs("span",{
              className:"ml-project-preview",
              children:[jsxRuntime.jsx(House,{
                "aria-hidden":"true"
              }),jsxRuntime.jsx("small",{
                children:g("inventoryOnly")
              })]
            })]
          }),jsxRuntime.jsx("p",{
            children:localizedText(G.use,f)
          }),(G.variants||[]).length>0&&jsxRuntime.jsxs("div",{
            className:"ml-variant-choice",
            children:[jsxRuntime.jsxs("label",{
              className:"ml-field",
              children:[g("projectRecipe"),jsxRuntime.jsxs("select",{
                "data-testid":`ml-project-variant-${G.id}`,
                "aria-label":`${g("projectRecipe")}: ${mergeLabName(G,f)}`,
                value:b,
                disabled:m,
                onChange:B=>J(G.id,B.target.value),
                children:[jsxRuntime.jsxs("option",{
                  value:"base",
                  children:[g("baseRecipe")," · ",G.essenceCost," ",g("essence").toLocaleLowerCase(f)]
                }),G.variants.map(B=>jsxRuntime.jsxs("option",{
                  value:B.id,
                  children:[mergeLabName(B,f)," · ",B.essenceCost," ",g("essence").toLocaleLowerCase(f)]
                },B.id))]
              })]
            }),jsxRuntime.jsx("p",{
              className:"ml-muted",
              children:g("sameProjectOutput")
            })]
          }),ie&&jsxRuntime.jsxs("div",{
            className:"ml-variant-summary",
            "data-testid":`ml-project-variant-summary-${G.id}`,
            "aria-live":"polite",
            children:[jsxRuntime.jsx("p",{
              children:localizedText(ie.description,f)
            }),jsxRuntime.jsx("p",{
              className:"ml-good",
              children:q>0?g("essenceSaving",{
                n:formatCount(q,f)
              }):g(V===0?"zeroEssenceAlternative":"alternativeMaterials")
            })]
          }),jsxRuntime.jsx("h4",{
            children:g("requirements")
          }),jsxRuntime.jsx("ul",{
            className:"ml-contents",
            children:Object.entries(K).map(([B,Ee])=>jsxRuntime.jsx(LabItemLine,{
              id:B,
              quantity:Ee,
              catalog:r,
              language:f,
              children:jsxRuntime.jsxs("div",{
                className:"ml-material-state",
                children:[jsxRuntime.jsx("span",{
                  className:_.knowledge.itemIds.includes(B)?"ml-good":"ml-muted",
                  children:g(_.knowledge.itemIds.includes(B)?"opened":"unknown")
                }),jsxRuntime.jsx("span",{
                  className:(_.stock[B]||0)>=Ee?"ml-good":"ml-shortage",
                  children:g("available",{
                    have:formatCount(_.stock[B],f),
                    need:Ee
                  })
                }),jsxRuntime.jsx(LabButton,{
                  onClick:()=>E(B),
                  disabled:!_.knowledge.itemIds.includes(B),
                  children:g("journal")
                })]
              })
            },B))
          }),jsxRuntime.jsxs("p",{
            className:`ml-cost-line ${(_.alchemyEssence||0)>=V?"ml-good":"ml-shortage"}`,
            children:[g("essence"),": ",g("available",{
              have:formatCount(_.alchemyEssence,f),
              need:V
            })," · ",g("projectOutput")]
          }),jsxRuntime.jsxs("p",{
            className:"ml-muted",
            children:[g("projectOwned",{
              n:formatCount(w,f)
            })," · ",g("madeCount",{
              n:formatCount(_.projects.crafted[G.id],f)
            })]
          }),jsxRuntime.jsx("p",{
            className:"ml-info",
            children:g(releaseBlocked?"yardUpdateRequired":G.requiresYardV3?"yardFuture":"yardReady")
          }),jsxRuntime.jsxs("div",{
            className:"ml-actions",
            children:[!k&&jsxRuntime.jsx(LabButton,{
              "data-testid":`ml-project-select-${G.id}`,
              disabled:m,
              onClick:()=>y("selectProject",{
                projectId:G.id
              }),
              children:g("selectGoal")
            }),jsxRuntime.jsx(LabButton,{
              "data-testid":`ml-project-quote-${G.id}`,
              primary:!0,
              disabled:m||!te||releaseBlocked,
              onClick:()=>c("craftProject",{
                projectId:G.id,
                variantId:b,
                quantity:1
              },`${mergeLabName(G,f)} · ${ue}`),
              children:g(releaseBlocked?"yardUpdateRequired":te?"review":"needsDiscovery")
            }),w>0&&!G.requiresYardV3&&A&&jsxRuntime.jsx(LabButton,{
              onClick:A,
              children:g("openYard")
            })]
          })]
        },G.id)
      }
      )
    }),jsxRuntime.jsx("p",{
      className:"ml-muted",
      children:g("effectUnavailable")
    })]
  })
}
function LabSupplies({
  player:s,
  catalog:r=MERGE_LAB_CATALOG,
  language:f="ru",
  onQuote:c=noop,
  run:y=noop,
  busy:m=!1,
  now:E=Date.now()
}){
  const A=translateMergeLab(f),v=s.merge,p=catalogNameFor(r,f),[g,_]=React.useState("breeze"),[M,Z]=React.useState(""),X=supplyChargeStatus(v,r.economy,E),J=new Date(E).toISOString().slice(0,10),G=v.supply.dailyClaimDate===J||v.lastFreePull>0&&new Date(v.lastFreePull).toISOString().slice(0,10)===J,k=r.cropSupplies[M],ie=A("cropNames");
  return jsxRuntime.jsxs("div",{
    className:"ml-panel-body",
    "data-testid":"ml-supplies",
    children:[jsxRuntime.jsx("p",{
      className:"ml-info",
      children:A("stockKnowledge")
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsx("h3",{
        children:A("starterKit")
      }),jsxRuntime.jsx("p",{
        children:A("starterKitBody")
      }),jsxRuntime.jsx(LabContents,{
        values:r.starterKit,
        catalog:r,
        language:f
      }),jsxRuntime.jsx(LabButton,{
        "data-testid":"ml-starter-kit",
        primary:!0,
        disabled:m||v.supply.starterKitClaimed,
        onClick:()=>c("claimStarterKit",{
        },A("starterKit")),
        children:A(v.supply.starterKitClaimed?"claimed":"getKit")
      })]
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsxs("h3",{
        children:[A("charges")," · ",X.bank,"/",X.capacity]
      }),jsxRuntime.jsx("p",{
        children:A("recharge",{
          n:r.economy.rechargeMs/6e4,
          cap:X.capacity
        })
      }),jsxRuntime.jsx("p",{
        className:"ml-muted",
        children:X.bank===X.capacity?A("fullCharges"):A("nextCharge",{
          n:Math.ceil(X.waitMs/6e4)
        })
      }),jsxRuntime.jsx(LabButton,{
        "data-testid":"ml-claim-charges",
        disabled:m||X.earned<1,
        onClick:()=>y("claimFreeCharges",{
        }),
        children:A("getCharges",{
          n:X.earned
        })
      }),jsxRuntime.jsxs("label",{
        className:"ml-field",
        children:[A("freeMaterial"),jsxRuntime.jsx("select",{
          "data-testid":"ml-supply-material",
          value:g,
          onChange:b=>_(b.target.value),
          children:r.supplyItemIds.filter(b=>v.knowledge.itemIds.includes(b)).map(b=>jsxRuntime.jsxs("option",{
            value:b,
            children:[p(b)," · ",A("inStock",{
              n:v.stock[b]||0
            })]
          },b))
        })]
      }),jsxRuntime.jsx(LabButton,{
        "data-testid":"ml-claim-material",
        disabled:m||X.bank<1,
        onClick:()=>c("claimSupply",{
          itemId:g,
          quantity:1
        },p(g)),
        children:A("getMaterial")
      })]
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsx("h3",{
        children:A("daily")
      }),jsxRuntime.jsx(LabContents,{
        values:r.economy.dailySupply,
        catalog:r,
        language:f
      }),jsxRuntime.jsx(LabButton,{
        "data-testid":"ml-daily-supply",
        disabled:m||G,
        onClick:()=>c("claimDailySupply",{
        },A("daily")),
        children:A(G?"dailyClaimed":"collectDaily")
      })]
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsxs("h3",{
        children:[A("tokenPacks")," · ",A("tokens"),": ",formatCount(s.resources?.gachaTokens,f)]
      }),jsxRuntime.jsx("p",{
        className:"ml-muted",
        children:A("fixedPack")
      }),r.tokenPacks.map(b=>{
        const K=Object.keys(b.items).every(V=>v.knowledge.itemIds.includes(V));
        return jsxRuntime.jsxs("article",{
          className:"ml-pack",
          children:[jsxRuntime.jsx("h4",{
            children:mergeLabName(b,f)
          }),jsxRuntime.jsx(LabContents,{
            values:b.items,
            catalog:r,
            language:f
          }),jsxRuntime.jsx(LabButton,{
            "data-testid":`ml-pack-${b.id}`,
            disabled:m||!K,
            onClick:()=>c("buySupply",{
              packId:b.id
            },mergeLabName(b,f)),
            children:A("buyPack",{
              n:b.cost
            })
          }),!K&&jsxRuntime.jsx("p",{
            className:"ml-muted",
            children:A("packLocked")
          })]
        },b.id)
      }
      )]
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsx("h3",{
        children:A("crops")
      }),jsxRuntime.jsx("p",{
        children:A("cropHelp")
      }),jsxRuntime.jsxs("label",{
        className:"ml-field",
        children:[A("chooseCrop"),jsxRuntime.jsxs("select",{
          "data-testid":"ml-crop-select",
          value:M,
          onChange:b=>Z(b.target.value),
          children:[jsxRuntime.jsx("option",{
            value:"",
            children:A("chooseCrop")
          }),Object.values(r.cropSupplies).map(b=>jsxRuntime.jsxs("option",{
            value:b.cropId,
            children:[ie[b.cropId]||b.cropId," · ",A("inStock",{
              n:s.farm?.harvested?.[b.cropId]||0
            })]
          },b.cropId))]
        })]
      }),k&&jsxRuntime.jsxs(jsxRuntime.Fragment,{
        children:[jsxRuntime.jsxs("p",{
          children:[A("cost"),": ",A("cropPrice",{
            n:k.quantity,
            name:ie[M]||M
          })]
        }),jsxRuntime.jsx(LabContents,{
          values:k.items,
          catalog:r,
          language:f
        }),jsxRuntime.jsx(LabButton,{
          "data-testid":"ml-crop-exchange",
          disabled:m,
          onClick:()=>c("useCropSupply",{
            cropId:M
          },A("useCrop")),
          children:A("useCrop")
        })]
      })]
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsxs("h3",{
        children:[A("realStock")," · ",A("distill")]
      }),jsxRuntime.jsx("p",{
        children:A("distillHelp")
      }),Object.entries(v.stock).filter(([,b])=>b>0).length?jsxRuntime.jsx("ul",{
        className:"ml-contents",
        children:Object.entries(v.stock).filter(([,b])=>b>0).map(([b,K])=>jsxRuntime.jsx(LabItemLine,{
          id:b,
          quantity:K,
          catalog:r,
          language:f,
          children:jsxRuntime.jsx(LabButton,{
            "data-testid":`ml-distill-${b}`,
            disabled:m,
            onClick:()=>c("distillStock",{
              itemId:b,
              quantity:1
            },`${A("distill")}: ${p(b)}`),
            children:A("distillOne")
          })
        },b))
      }):jsxRuntime.jsx("p",{
        className:"ml-empty",
        children:A("stockEmpty")
      })]
    }),jsxRuntime.jsxs("section",{
      className:"ml-section",
      children:[jsxRuntime.jsx("h3",{
        children:A("exchange")
      }),r.exchangeOffers.filter(b=>!b.locked).map(b=>{
        const K=b.perDayLimit-(v.exchangeClaims?.[J]?.[b.id]||0);
        return jsxRuntime.jsxs("article",{
          className:"ml-pack",
          children:[jsxRuntime.jsx("h4",{
            children:Object.entries(b.reward).map(([V,te])=>`${te} ${A(V)}`).join(" + ")
          }),jsxRuntime.jsxs("p",{
            children:[A("essence"),": ",b.cost," · ",A("remaining",{
              n:K
            })]
          }),jsxRuntime.jsx(LabButton,{
            "data-testid":`ml-exchange-${b.id}`,
            disabled:m||K<=0,
            onClick:()=>c("exchange",{
              offerId:b.id
            },A("exchange")),
            children:A("review")
          })]
        },b.id)
      }
      )]
    })]
  })
}
function LabQuote({
  transaction:s,
  player:r,
  catalog:f=MERGE_LAB_CATALOG,
  language:c="ru",
  onConfirm:y=noop,
  busy:m=!1,
  now:E=Date.now(),
  getQuote:A
}){
  const v=translateMergeLab(c),p=React.useRef(!0),[g,_]=React.useState(()=>{
    if(A)return{
      loading:!0
    };
    try{
      throw Object.assign(new Error("Authenticated server quote required"), {code:"SERVER_QUOTE_REQUIRED"})
    }
    catch(q){
      return{
        error:q
      }
    }
  }
  ),[M,Z]=React.useState(s.payload.quantity||1),X=async()=>{
    const q={
      ...s.payload,..."quantity"in s.payload?{
        quantity:M
      }:{
      }
    };
    try{
      if(A){
        _({
          loading:!0
        });
        const B=await A(s.type,q);
        p.current&&_(B)
      }
      else throw Object.assign(new Error("Authenticated server quote required"), {code:"SERVER_QUOTE_REQUIRED"})
    }
    catch(B){
      p.current&&_({
        error:B
      })
    }
  }
  ;
  if(React.useEffect(()=>(p.current=!0,A&&X(),()=>{
    p.current=!1
  }
  ),[A]),g.loading)return jsxRuntime.jsx("p",{
    className:"ml-info",
    role:"status",
    children:v("pending")
  });
  if(g.error)return jsxRuntime.jsxs("div",{
    className:"ml-empty",
    role:"alert",
    children:[jsxRuntime.jsx("p",{
      children:labErrorMessage(g.error,v)
    }),jsxRuntime.jsx(LabButton,{
      disabled:m,
      onClick:X,
      children:v("refreshQuote")
    })]
  });
  const J=g.terms,G=quoteShortages(J,r),k=g.mergeRevision!==r.merge.mergeRevision||g.catalogVersion!==f.version||E>=g.expiresAt,ie="quantity"in s.payload&&M!==g.parameters.quantity,b=[["essence",J.essenceCost],["tokens",J.tokenCost],["charges",J.freeChargeCost]].filter(([q,B])=>B>0||q==="essence"&&s.type==="craftProject"),K=!Object.keys(J.stockCost).length&&!Object.keys(J.cropCost).length&&!b.length,V=v("cropNames"),te=s.type==="craftProject"?f.projects.find(q=>q.id===g.parameters.projectId):null,w=te?.variants?.find(q=>q.id===g.parameters.variantId),ue=te?Math.max(0,te.essenceCost*(g.parameters.quantity||1)-J.essenceCost):0;
  return jsxRuntime.jsxs(jsxRuntime.Fragment,{
    children:[jsxRuntime.jsx("p",{
      className:"ml-info",
      children:v("stockKnowledge")
    }),te&&jsxRuntime.jsxs("section",{
      className:"ml-variant-summary",
      "data-testid":"ml-quote-variant",
      children:[jsxRuntime.jsxs("h3",{
        children:[v("projectRecipe"),": ",w?mergeLabName(w,c):v("baseRecipe")]
      }),w&&jsxRuntime.jsx("p",{
        children:localizedText(w.description,c)
      }),w&&jsxRuntime.jsx("p",{
        className:"ml-good",
        children:ue>0?v("essenceSaving",{
          n:formatCount(ue,c)
        }):J.essenceCost===0?v("zeroEssenceAlternative"):v("alternativeMaterials")
      }),jsxRuntime.jsx("p",{
        className:"ml-muted",
        children:v("sameProjectOutput")
      })]
    }),"quantity"in s.payload&&jsxRuntime.jsxs("label",{
      className:"ml-field",
      children:[v("quantity"),jsxRuntime.jsx("input",{
        "data-testid":"ml-quote-quantity",
        type:"number",
        min:"1",
        max:"100",
        step:"1",
        inputMode:"numeric",
        value:M,
        onChange:q=>Z(Math.min(100,Math.max(1,Math.trunc(Number(q.target.value)||1))))
      })]
    }),jsxRuntime.jsxs("div",{
      className:"ml-quote-columns",
      "data-testid":"ml-quote",
      children:[jsxRuntime.jsxs("section",{
        className:"ml-quote-cost",
        children:[jsxRuntime.jsx("h3",{
          children:v("cost")
        }),K&&jsxRuntime.jsx("p",{
          className:"ml-good",
          children:v("free")
        }),jsxRuntime.jsx("ul",{
          className:"ml-contents",
          children:Object.entries(J.stockCost).map(([q,B])=>jsxRuntime.jsx(LabItemLine,{
            id:q,
            quantity:B,
            catalog:f,
            language:c,
            children:jsxRuntime.jsx("span",{
              className:(r.merge.stock[q]||0)<B?"ml-shortage":"ml-good",
              children:v("available",{
                have:formatCount(r.merge.stock[q],c),
                need:B
              })
            })
          },q))
        }),b.map(([q,B])=>{
          const Ee=q==="essence"?r.merge.alchemyEssence:q==="tokens"?r.resources?.gachaTokens:r.merge.freeTapCharges;
          return jsxRuntime.jsxs("p",{
            className:`ml-currency-row ${(Ee||0)>=B?"ml-good":"ml-shortage"}`,
            children:[jsxRuntime.jsx("span",{
              children:v(q)
            }),jsxRuntime.jsx("strong",{
              children:v("available",{
                have:formatCount(Ee,c),
                need:formatCount(B,c)
              })
            })]
          },q)
        }
        ),Object.entries(J.cropCost).map(([q,B])=>jsxRuntime.jsxs("p",{
          className:"ml-currency-row",
          children:[v("cropPrice",{
            n:B,
            name:V[q]||q
          }),jsxRuntime.jsx("span",{
            children:v("inStock",{
              n:r.farm?.harvested?.[q]||0
            })
          })]
        },q))]
      }),jsxRuntime.jsxs("section",{
        className:"ml-quote-result",
        children:[jsxRuntime.jsx("h3",{
          children:v("result")
        }),jsxRuntime.jsx(LabContents,{
          values:J.stockGrant,
          catalog:f,
          language:c
        }),J.essenceGrant>0&&jsxRuntime.jsxs("p",{
          children:[v("essence"),": +",formatCount(J.essenceGrant,c)]
        }),Object.entries(J.yardGrant).map(([q,B])=>{
          const Ee=f.projects.find(Qe=>Qe.output.itemId===q);
          return jsxRuntime.jsxs("div",{
            children:[jsxRuntime.jsxs("strong",{
              children:[mergeLabName(Ee,c)," ×",B]
            }),jsxRuntime.jsx("p",{
              children:v(Ee?.requiresYardV3?"yardFuture":"yardReady")
            })]
          },q)
        }
        ),Object.entries(J.yardCurrencyGrant).map(([q,B])=>jsxRuntime.jsxs("p",{
          children:[v(q),": +",formatCount(B,c)]
        },q))]
      })]
    }),G.length>0&&jsxRuntime.jsxs("p",{
      className:"ml-shortage",
      role:"status",
      children:[v("insufficient"),": ",G.map(q=>`${q.id?q.kind==="crop"?V[q.id]:catalogNameFor(f,c)(q.id):v(q.kind)} ${q.available}/${q.required}`).join(" · ")]
    }),jsxRuntime.jsx("p",{
      className:"ml-muted",
      children:k?v("quoteExpired"):v("quoteValid",{
        n:Math.max(1,Math.ceil((g.expiresAt-E)/6e4))
      })
    }),k||ie?jsxRuntime.jsx(LabButton,{
      "data-testid":"ml-quote-refresh",
      primary:!0,
      disabled:m,
      onClick:X,
      children:v("refreshQuote")
    }):jsxRuntime.jsx(LabButton,{
      "data-testid":"ml-quote-confirm",
      primary:!0,
      disabled:m||G.length>0,
      onClick:()=>y(s.type,{
        ...g.parameters,
        quote:{
          quoteId:g.quoteId,
          expiresAt:g.expiresAt
        }
      }),
      "aria-busy":m,
      children:v("confirm")
    })]
  })
}
function MergeLabView({
  player:s,
  onAction:r=noop,
  getQuote:f,
  language:c="ru",
  onExit:y=noop,
  onOpenYard:m,
  safeInsets:E={
  },
  onShellStateChange:A,
  clockSnapshot:v,
  backgroundNode:p,
  catalog:g=MERGE_LAB_CATALOG,
  initialViewState:_={
  }
}){
  const M=React.useMemo(()=>translateMergeLab(c),[c]),Z=React.useRef(null),X=React.useRef(null),J=React.useRef([]),G=React.useRef(!0),k=useLabLayout(Z,E),[ie,b]=React.useState(null),[K,V]=React.useState(_.slots||[null,null]),[te,w]=React.useState(_.activeSlot===1?1:0),[ue,q]=React.useState(_.result||null),[B,Ee]=React.useState(_.panel||null),[Qe,dt]=React.useState(null),[Je,pt]=React.useState(!1),z=React.useRef(!1),Q=React.useRef(null),le=React.useRef(null),[Te,Ne]=React.useState(Date.now()),[x,H]=React.useState([]),[I,F]=React.useState([]),[ce,de]=React.useState(null),me=React.useRef(null),$e=React.useRef(!1),qe=`merge-lab-favorites:${s?.player?.id||s?.id||s?.playerId||"local"}`,[Dl,na]=React.useState(()=>readPreference(qe,[])),[ia,ji]=React.useState(()=>readPreference("merge-lab-reduced-motion",!1)),[Ut,Tn]=React.useState(!1),[sl,Ku]=React.useState(()=>audioManager.isEnabled()),el=ie?.merge?.serverEpoch===s?.merge?.serverEpoch && ie?.merge?.mergeRevision>(s?.merge?.mergeRevision??-1)?ie:s,za=estimateServerTime(v,Te),Lt=el?.merge,ua=React.useMemo(()=>indexCatalogItems(g),[g]),ca=React.useMemo(()=>catalogNameFor(g,c),[g,c]);
  React.useEffect(()=>installPresentationMotion(Z.current),[]);
  React.useEffect(()=>{settlePresentationMotion(Z.current);},[B]);
  React.useEffect(()=>{
    G.current=!0;
    const R=setInterval(()=>Ne(Date.now()),1e3);
    return()=>{
      G.current=!1,clearInterval(R)
    }
  }
  ,[]),React.useEffect(()=>{
    const R=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if(!R)return;
    const $=()=>Tn(R.matches);
    return $(),R.addEventListener?.("change",$),()=>R.removeEventListener?.("change",$)
  }
  ,[]),React.useEffect(()=>{
    na(readPreference(qe,[]))
  }
  ,[qe]);
  const $t=React.useCallback(()=>{
    const R=me.current;
    if(me.current=null,R?.node?.hasPointerCapture?.(R.pointerId))try{
      R.node.releasePointerCapture(R.pointerId)
    }
    catch{
    }
    me.current=null,de(null)
  }
  ,[]),We=React.useCallback(()=>{
    X.current&&(X.current.inert=!1),Ee(null)
  }
  ,[]),Ei=React.useCallback(()=>Ee({
    type:"pause"
  }),[]);
  React.useEffect(()=>{
    const R=()=>$t();
    return window.addEventListener("blur",R),window.addEventListener("resize",R),window.addEventListener("orientationchange",R),document.addEventListener("visibilitychange",R),()=>{
      window.removeEventListener("blur",R),window.removeEventListener("resize",R),window.removeEventListener("orientationchange",R),document.removeEventListener("visibilitychange",R),$t()
    }
  }
  ,[$t]),React.useEffect(()=>{
    $t()
  }
  ,[k.availableWidth,k.availableHeight,B,$t]),React.useEffect(()=>{
    const R=X.current;
    return R&&(R.inert=!!B),A?.({
      paused:B?.type==="pause",
      modalOpen:!!B,
      close:We,
      pause:Ei,
      pending:Je
    }),()=>{
      R&&(R.inert=!1)
    }
  }
  ,[B,A,We,Ei,Je]);
  const Da=React.useCallback(async R=>{
    if(z.current)return null;
    z.current=!0,Q.current=R.type,pt(!0),dt(null);
    try{
      const $=await r(R.type,R.payload,{
        requestId:R.requestId
      });
      if(!$||typeof $.ok!="boolean")throw new Error("No confirmed transaction envelope");
      if(le.current=null,!G.current)return $;
      if($.player&&b($.player),!$.ok){
        const we=labErrorMessage($.error,M);
        return dt({
          error:!0,
          text:we
        }),R.type==="researchPair"&&q({
          error:!0
        }),$
      }
      const Se=$.result||{
      };
      return R.type==="researchPair"?(q(Se),Se.outcome==="new"&&Se.itemId&&H(we=>[...new Set([Se.itemId,...we])]),Se.itemId&&F(we=>[...new Set([Se.itemId,...we])]),sl&&audioManager.play(Se.outcome==="failed"?"tap":"merge").catch(noop)):R.type==="requestHint"||R.type==="selectProject"?dt(null):(dt(null),R.origin&&Ee(we=>we?.type==="quote"?R.origin:we)),$
    }
    catch{
      return le.current=R,G.current&&dt({
        error:!0,
        retry:!0,
        text:M("network")
      }),null
    }
    finally{
      z.current=!1,Q.current=null,G.current&&pt(!1)
    }
  }
  ,[r,sl,M]),Rl=React.useCallback((R,$,Se)=>le.current||z.current?Promise.resolve(null):Da({
    type:R,
    payload:$,
    origin:Se,
    requestId:newRequestId()
  }),[Da]),sa=()=>le.current&&Da(le.current),vt=Je||!!le.current,st=(R,$={
  })=>{
    $t(),Ee({
      type:R,...$
    })
  }
  ,Zu=R=>na($=>{
    const Se=$.includes(R)?$.filter(we=>we!==R):[...$,R];
    return savePreference(qe,Se),Se
  }
  ),Cn=(R,$=te)=>{
    if(vt||!Lt.knowledge.itemIds.includes(R))return;
    const Se=[...K];
    Se[$]=R,V(Se),w(Se[1-$]?$:1-$),q(null),dt(null),F(we=>[...new Set([R,...we])]),Ee(null)
  }
  ,ra=R=>Cn(R,K[0]?K[1]?te:1:0),mt=R=>{
    vt||(V([...R]),q(null),dt(null),Ee(null))
  }
  ,Ht=(R,$,Se)=>st("quote",{
    transaction:{
      type:R,
      payload:$,
      title:Se,
      origin:B||{
        type:"supplies"
      }
    }
  }),ht=(R,$)=>{
    vt||R.button!==0||($e.current=!1,me.current={
      id:$,
      pointerId:R.pointerId,
      x:R.clientX,
      y:R.clientY,
      node:R.currentTarget,
      active:!1
    },R.currentTarget.setPointerCapture?.(R.pointerId))
  }
  ,Iu=R=>{
    const $=me.current;
    !$||R.pointerId!==$.pointerId||(!$.active&&Math.hypot(R.clientX-$.x,R.clientY-$.y)>8&&($.active=!0),$.active&&(R.preventDefault(),de({
      id:$.id,
      x:R.clientX,
      y:R.clientY,
      target:sampleWellAtPoint(J.current,R.clientX,R.clientY)
    })))
  }
  ,Ju=R=>{
    const $=me.current;
    if(!(!$||R.pointerId!==$.pointerId)){
      if($.active){
        $e.current=!0;
        const Se=sampleWellAtPoint(J.current,R.clientX,R.clientY);
        Se>=0&&Cn($.id,Se)
      }
      $t()
    }
  }
  ;
  if(!Lt?.knowledge)return jsxRuntime.jsxs("div",{
    className:"ml-root ml-unavailable",
    children:[jsxRuntime.jsx("p",{
      role:"status",
      children:M("conflict")
    }),jsxRuntime.jsx(LabButton,{
      "data-testid":"ml-exit",
      onClick:y,
      children:M("exit")
    })]
  });
  const Ti=g.projects.find(R=>R.id===Lt.projects.selectedId)||g.projects.find(R=>R.id==="echo_chimes")||g.projects[0],Ra=[...new Set([...I,...Dl,"breeze","vial","glass","seed","dew","dust","ember","cloud",...Lt.knowledge.itemIds])].filter(R=>Lt.knowledge.itemIds.includes(R)&&ua[R]).slice(0,k.recentCount),tl=laboratoryStatus(K,Je&&Q.current==="researchPair",ue,Lt.knowledge.testedPairs,g.version),fa=g.recipes.find(R=>R.id===ue?.recipeId),rl=ue?.outcome==="new"||ue?.outcome==="known"?`${localizedText(fa?.why,c)} ${M("noStock")}`:M(tl==="failed"?"failed":tl==="pending"?"pending":["empty","one","ready","tested"].includes(tl)?tl:"genericError"),qa={
    "--ml-safe-top":`${k.safeInsets.top}px`,
    "--ml-safe-right":`${k.safeInsets.right}px`,
    "--ml-safe-bottom":`${k.safeInsets.bottom}px`,
    "--ml-safe-left":`${k.safeInsets.left}px`,
    "--ml-pad":`${k.padding}px`,
    "--ml-gap":`${k.gap}px`,
    "--ml-rail":`${k.railWidth}px`,
    "--ml-column-gap":`${k.columnGap}px`
  },oa=B?.type==="quote"?B.transaction.title:B?.type==="pause"?M("settings"):M(B?.type==="projects"?"projects":B?.type||"samples");
  return jsxRuntime.jsxs("div",{
    ref:Z,
    className:"ml-root",
    "data-hud-region":"mergeLabComposition",
    style:qa,
    lang:c,
    "data-orientation":k.landscape?"landscape":"portrait",
    "data-compact":k.compact?"true":"false",
    "data-reduced-motion":ia||Ut?"true":"false",
    "data-motion-blocked":B?"true":"false",
    "data-scroll-fallback":k.requiresScroll?"true":"false",
    children:[p||jsxRuntime.jsx("div",{
      className:"ml-background",
      "data-hud-region":"mergeLabBackdropAsset",
      "aria-hidden":"true"
    }),jsxRuntime.jsxs("div",{
      className:"ml-safe",
      children:[jsxRuntime.jsxs("main",{
        ref:X,
        className:"ml-workspace",
        "aria-label":M("title"),
        "aria-hidden":B?!0:void 0,
        children:[jsxRuntime.jsxs("header",{
          className:"ml-hud",
          "data-hud-region":"mergeLabHud",
          children:[jsxRuntime.jsxs(LabButton,{
            className:"ml-balance",
            "aria-label":`${M("essence")}: ${formatCount(Lt.alchemyEssence,c)}`,
            onClick:()=>st("supplies"),
            children:[jsxRuntime.jsx(FlaskConical,{
              "aria-hidden":"true"
            }),jsxRuntime.jsxs("span",{
              children:[jsxRuntime.jsx("small",{
                children:M("essence")
              }),jsxRuntime.jsx("strong",{
                children:formatCount(Lt.alchemyEssence,c)
              })]
            })]
          }),jsxRuntime.jsxs(LabButton,{
            "data-testid":"ml-open-supplies",
            className:"ml-balance",
            onClick:()=>st("supplies"),
            children:[jsxRuntime.jsx(PackageOpen,{
              "aria-hidden":"true"
            }),jsxRuntime.jsxs("span",{
              children:[jsxRuntime.jsx("small",{
                children:M("supplies")
              }),jsxRuntime.jsxs("strong",{
                children:[formatCount(el.resources?.gachaTokens,c)," ",jsxRuntime.jsx("small",{
                  children:M("tokens")
                })]
              })]
            })]
          }),jsxRuntime.jsx(LabButton,{
            "data-testid":"ml-open-pause",
            className:"ml-icon-button",
            "aria-label":M("pause"),
            onClick:()=>st("pause"),
            children:jsxRuntime.jsx(Pause,{
              "aria-hidden":"true"
            })
          })]
        }),jsxRuntime.jsxs("button",{
          type:"button",
          className:"ml-goal",
          "aria-label":`${mergeLabName(Ti,c)}: ${M(Ti.requiresYardV3 && !Lt.releasePolicy?.yardV3ProjectsEnabled?"yardUpdateRequired":"selected")}`,
          onClick:()=>st("projects"),
          children:[jsxRuntime.jsxs("span",{
            children:[jsxRuntime.jsx("small",{
              children:M("selected")
            }),jsxRuntime.jsx("strong",{
              children:Ti.requiresYardV3 && !Lt.releasePolicy?.yardV3ProjectsEnabled?M("yardUpdateShort"):mergeLabName(Ti,c)
            })]
          }),jsxRuntime.jsx(LabItemArt,{
            id:Ti?.inputs?.[0],
            catalog:g
          })]
        }),jsxRuntime.jsxs("section",{
          className:"ml-laboratory",
          "data-testid":"ml-laboratory",
          "data-hud-region":"mergeLabExperiment",
          "data-research-state":tl,
          "aria-label":M("title"),
          children:[jsxRuntime.jsx("div",{
            className:"ml-sample-wells",
            children:K.map((R,$)=>jsxRuntime.jsxs("div",{
              className:"ml-slot",
              "data-active":te===$?"true":"false",
              "data-drop-target":ce?.target===$?"true":"false",
              children:[jsxRuntime.jsxs("button",{
                ref:Se=>{
                  J.current[$]=Se
                }
                ,
                type:"button",
                className:"ml-well-button",
                "data-testid":`ml-well-${$}`,
                disabled:vt,
                onClick:()=>{
                  w($),st("samples")
                }
                ,
                "aria-label":`${M("slot",{
                  n:$+1
                })}: ${R?`${ca(R)} · ${itemPropertyText(ua[R],c)}`:M("chooseSample")}`,
                children:[jsxRuntime.jsxs("span",{
                  className:"ml-well",
                  children:[jsxRuntime.jsx("img",{
                    className:"ml-well-art",
                    src:`${MERGE_LAB_ASSET_ROOT}well.webp`,
                    alt:"",
                    draggable:"false"
                  }),R?jsxRuntime.jsx(LabItemArt,{
                    id:R,
                    catalog:g
                  },R):jsxRuntime.jsx("span",{
                    className:"ml-well-plus",
                    "aria-hidden":"true",
                    children:"+"
                  })]
                }),jsxRuntime.jsx("strong",{
                  className:"ml-slot-name",
                  children:R?ca(R):M("chooseSample")
                }),jsxRuntime.jsx("span",{
                  className:"ml-slot-property",
                  children:R?itemPropertyText(ua[R],c)||M("sample"):M("slot",{
                    n:$+1
                  })
                })]
              }),R&&jsxRuntime.jsx(LabButton,{
                className:"ml-slot-clear ml-icon-button",
                "data-testid":`ml-clear-${$}`,
                "aria-label":M("clearSlot",{
                  n:$+1
                }),
                disabled:vt,
                onClick:()=>{
                  V(Se=>Se.map((we,fl)=>fl===$?null:we)),q(null),w($)
                }
                ,
                children:jsxRuntime.jsx(LabCloseIcon,{
                  "aria-hidden":"true"
                })
              })]
            },$))
          }),jsxRuntime.jsxs("div",{
            className:`ml-reaction ${ue?.outcome==="new"?"ml-reaction-new":""}`,
            "data-testid":"ml-research-result",
            "aria-live":"polite",
            "aria-atomic":"true",
            children:[jsxRuntime.jsxs("div",{
              className:"ml-result-well",
              children:[jsxRuntime.jsx("img",{
                className:"ml-well-art",
                src:`${MERGE_LAB_ASSET_ROOT}well.webp`,
                alt:"",
                draggable:"false"
              }),ue?.itemId?jsxRuntime.jsx(LabItemArt,{
                id:ue.itemId,
                catalog:g
              },`${ue.itemId}:${ue.outcome}`):Je?jsxRuntime.jsx("span",{
                className:"ml-pending-mark",
                "aria-hidden":"true",
                children:jsxRuntime.jsx(Sparkles,{
                })
              }):jsxRuntime.jsx(FlaskConical,{
                className:"ml-result-symbol",
                "aria-hidden":"true"
              })]
            }),jsxRuntime.jsx("div",{
              className:"ml-result-label",
              children:ue?.itemId?jsxRuntime.jsxs(jsxRuntime.Fragment,{
                children:[jsxRuntime.jsx("span",{
                  className:"ml-eyebrow",
                  children:M(ue.outcome==="new"?"new":"known")
                }),jsxRuntime.jsx("strong",{
                  children:ca(ue.itemId)
                })]
              }):jsxRuntime.jsx("span",{
                children:M(Je?"working":"freeResearch")
              })
            })]
          }),jsxRuntime.jsx("div",{
            className:"ml-lab-action",
            children:ue?.itemId?jsxRuntime.jsx(LabButton,{
              "data-testid":"ml-research-again",
              primary:!0,
              disabled:vt,
              onClick:()=>{
                q(null),V([null,null]),w(0)
              }
              ,
              children:M("again")
            }):jsxRuntime.jsx(LabButton,{
              "data-testid":"ml-mix",
              primary:!0,
              disabled:vt||!K[0]||!K[1],
              onClick:()=>Rl("researchPair",{
                leftItemId:K[0],
                rightItemId:K[1]
              }),
              "aria-busy":Je,
              children:M("mix")
            })
          })]
        }),jsxRuntime.jsxs("div",{
          className:"ml-status",
          "aria-live":"polite",
          children:[jsxRuntime.jsx("span",{
            className:"ml-status-copy",
            children:ue?.itemId?jsxRuntime.jsxs(jsxRuntime.Fragment,{
              children:[jsxRuntime.jsx("strong",{
                children:M("noStock")
              })]
            }):rl
          }),ue?.itemId&&jsxRuntime.jsx(LabButton,{
            className:"ml-icon-button",
            "aria-label":M("journal"),
            onClick:()=>st("journal",{
              itemId:ue.itemId
            }),
            children:jsxRuntime.jsx(BookOpen,{
            })
          }),!ue?.itemId&&jsxRuntime.jsx(LabButton,{
            className:"ml-icon-button",
            "aria-label":M("hint"),
            onClick:()=>st("journal"),
            children:jsxRuntime.jsx(CircleQuestionMark,{
            })
          })]
        }),jsxRuntime.jsxs("section",{
          className:"ml-recent",
          "data-hud-region":"mergeLabSamples",
          "aria-label":M("samples"),
          children:[jsxRuntime.jsxs("div",{
            className:"ml-recent-caption",
            children:[jsxRuntime.jsx("span",{
              children:M("nextSlot",{
                n:K[0]?K[1]?te+1:2:1
              })
            }),jsxRuntime.jsx("span",{
              children:M("opened")
            })]
          }),jsxRuntime.jsx("div",{
            className:"ml-recent-grid",
            children:Ra.map(R=>jsxRuntime.jsxs("button",{
              type:"button",
              className:"ml-recent-sample",
              disabled:vt,
              onPointerDown:$=>ht($,R),
              onPointerMove:Iu,
              onPointerUp:Ju,
              onPointerCancel:$t,
              onLostPointerCapture:$t,
              onClick:event=>{
                if(event.detail===0||!$e.current)ra(R);
                $e.current=!1;
              }
              ,
              "aria-label":`${ca(R)} · ${M("sample")}`,
              children:[jsxRuntime.jsx(LabItemArt,{
                id:R,
                catalog:g
              }),jsxRuntime.jsx("span",{
                children:ca(R)
              })]
            },R))
          })]
        }),jsxRuntime.jsxs("nav",{
          className:"ml-nav",
          "aria-label":M("title"),
          children:[jsxRuntime.jsxs(LabButton,{
            "data-testid":"ml-open-samples",
            onClick:()=>st("samples"),
            children:[jsxRuntime.jsx(Leaf,{
              "aria-hidden":"true"
            }),jsxRuntime.jsx("span",{
              children:M("samples")
            })]
          }),jsxRuntime.jsxs(LabButton,{
            "data-testid":"ml-open-journal",
            onClick:()=>st("journal"),
            children:[jsxRuntime.jsx(BookOpen,{
              "aria-hidden":"true"
            }),jsxRuntime.jsx("span",{
              children:M("journal")
            })]
          }),jsxRuntime.jsxs(LabButton,{
            "data-testid":"ml-open-projects",
            onClick:()=>st("projects"),
            children:[jsxRuntime.jsx(House,{
              "aria-hidden":"true"
            }),jsxRuntime.jsx("span",{
              children:M("yard")
            })]
          })]
        }),Qe&&!B&&jsxRuntime.jsx("div",{
          className:"ml-workspace-notice",
          children:jsxRuntime.jsx(LabNotice,{
            notice:Qe,
            retry:sa,
            pending:Je,
            t:M
          })
        })]
      }),B&&jsxRuntime.jsxs(LabDialog,{
        title:oa,
        t:M,
        onClose:We,
        onBack:B.type==="quote"?()=>Ee(B.transaction.origin):void 0,
        children:[jsxRuntime.jsx(LabNotice,{
          notice:Qe,
          retry:sa,
          pending:Je,
          t:M
        }),B.type==="samples"&&jsxRuntime.jsx(LabSamples,{
          player:el,
          catalog:g,
          language:c,
          favorites:Dl,
          newIds:x,
          activeSlot:te,
          onPick:R=>Cn(R),
          onFavorite:Zu,
          onDetail:R=>st("journal",{
            itemId:R
          })
        }),B.type==="journal"&&jsxRuntime.jsx(LabJournal,{
          player:el,
          catalog:g,
          language:c,
          run:Rl,
          busy:vt,
          itemId:B.itemId,
          onItem:R=>Ee($=>({
            ...$,
            itemId:R
          })),
          onQuote:Ht,
          onPair:mt
        }),B.type==="projects"&&jsxRuntime.jsx(LabProjects,{
          player:el,
          catalog:g,
          language:c,
          run:Rl,
          busy:vt,
          onOpenYard:m,
          selectedVariantIds:B.variantIds||{
          },
          onVariantChange:(R,$)=>Ee(Se=>({
            ...Se,
            variantIds:{
              ...Se.variantIds||{
              },
              [R]:$
            }
          })),
          onQuote:Ht,
          onItem:R=>st("journal",{
            itemId:R
          })
        }),B.type==="supplies"&&jsxRuntime.jsx(LabSupplies,{
          player:el,
          catalog:g,
          language:c,
          run:Rl,
          busy:vt,
          now:za,
          onQuote:Ht
        }),B.type==="quote"&&jsxRuntime.jsx(LabQuote,{
          transaction:B.transaction,
          player:el,
          catalog:g,
          language:c,
          now:za,
          getQuote:f,
          busy:vt,
          onConfirm:(R,$)=>Rl(R,$,B.transaction.origin)
        },`${B.transaction.type}-${JSON.stringify(B.transaction.payload)}`),B.type==="pause"&&jsxRuntime.jsxs("div",{
          className:"ml-pause-content",
          "data-testid":"ml-pause",
          children:[jsxRuntime.jsx("p",{
            children:M("pauseNote")
          }),jsxRuntime.jsxs(LabButton,{
            className:"ml-setting",
            "aria-pressed":sl,
            onClick:async()=>{
              const R=await audioManager.toggle();
              Ku(R)
            }
            ,
            children:[sl?jsxRuntime.jsx(Volume2,{
            }):jsxRuntime.jsx(VolumeX,{
            }),jsxRuntime.jsx("span",{
              children:M("sound")
            }),jsxRuntime.jsx("strong",{
              children:M(sl?"on":"off")
            })]
          }),jsxRuntime.jsxs(LabButton,{
            className:"ml-setting",
            "aria-pressed":ia||Ut,
            disabled:Ut,
            onClick:()=>{
              ji(R=>(savePreference("merge-lab-reduced-motion",!R),!R))
            }
            ,
            children:[jsxRuntime.jsx(Sparkles,{
            }),jsxRuntime.jsx("span",{
              children:M("motion")
            }),jsxRuntime.jsx("strong",{
              children:M(ia||Ut?"on":"off")
            })]
          }),jsxRuntime.jsx(LabButton,{
            "data-testid":"ml-resume",
            primary:!0,
            onClick:We,
            children:M("resume")
          }),jsxRuntime.jsx(LabButton,{
            "data-testid":"ml-exit",
            onClick:y,
            children:M("exit")
          })]
        })]
      })]
    }),ce&&jsxRuntime.jsx("div",{
      className:"ml-drag-ghost",
      style:{
        left:0,
        top:0,
        transform:`translate3d(${ce.x}px,${ce.y}px,0) translate(-50%,-62%)`
      },
      "aria-hidden":"true",
      children:jsxRuntime.jsx(LabItemArt,{
        id:ce.id,
        catalog:g
      })
    })]
  })
}

export {MergeLabView, calculateLabLayout, quoteShortages, projectDependencyIds, selectReachableHint, laboratoryStatus, supplyChargeStatus};

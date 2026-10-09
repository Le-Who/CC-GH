import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {CURRENT_VISITOR_PORTRAITS,YARD_UI_ART,sceneCatalogPreview} from '../src/games/companion-yard-v2/catalog-ui.mjs';

const component=fs.readFileSync(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8');
const catalogSource=fs.readFileSync(new URL('../src/games/companion-yard-v2/catalog-ui.mjs',import.meta.url),'utf8');
const catalogue={baseURL:'https://yard.test/assets/clean/',goodies:{leaf_pot:{new:{src:'leaf.webp'}},yarn_mouse:{new:{src:'old-mouse.webp'}}},foods:{kibble:{src:'bowl.webp'}}};

// These source guards qualify routing and controls only. They do not establish
// visual acceptance, resize behavior or actual server-action completion.
test('normal Courtyard has one canonical presentation with no retired scene entry or native UI',()=>{
  assert.match(component,/canonicalYardPresentation\(snapshot,/);
  assert.match(component,/mutable:false,mediaReady:false/);
  assert.doesNotMatch(component,/courtyardPresentation|MIKA_CLIPS|MIKA_PLACEMENT_SUGGESTIONS|SUPPORTED_PROPS|defaultAnchor|allowPipPrototype|allowCanonicalEntry|setPrototypeEnabled|setCanonicalItemsEnabled|inspectAgain|open-canonical-yard|native-go-to-item|native-retry-save|createNativeItemCommand|createNativeCheckpointCommand/);
  assert.match(component,/createCourtyardScene\(canvas\.current,/);
  assert.match(component,/const yard=current\.yard/);
  assert.match(component,/data-yard-version="canonical-clean-r1"/);
});

test('only canonical leaf pot placement can reach current placement controls',()=>{
  assert.match(component,/prop\.goodieId!=='leaf_pot' \|\| !itemMutable/);
  assert.match(component,/placing\?scene\.current\?\.defaultItemAnchor\(\)/);
  assert.match(component,/checkCanonicalPlacement\(snap,g\)/);
  assert.match(component,/\.\.\.canonicalCommandScope\(owner\.snapshot\)/);
  assert.match(component,/!isCanonicalItemIntent\(recovered\)\|\|!itemMutable/);
  assert.match(component,/current\.itemMutable===true&&current\.mediaReady===true&&!!canonicalCapability\(snapshot\)/);
  assert.doesNotMatch(component,/free_v2_|prop\.transform|prop\.anchor|import \{ checkPlacement/);
});

test('food, inventory and placement keep account/source and durable outbox guards',()=>{
  for(const action of ['set-food','buy-food','buy-goodie','move','pickup','place','commit-placement','retry-placement'])assert.ok(component.includes(`data-yard-action="${action}"`),action);
  assert.match(component,/state\.accountSession!==actionSession\|\|state\.snapshot\?\.player\?\.id!==snapshot\?\.player\?\.id/);
  assert.match(component,/canonicalCapability\(state\.snapshot,action\)/);
  assert.match(component,/canonicalSavedFoodCommandAllowed\(state\.snapshot,current,action,payload,sceneState\)/);
  assert.match(component,/canonicalSavedPickupCommandAllowed\(state\.snapshot,current,action,payload,sceneState\)/);
  assert.match(component,/performReliableAction\(action,payload,/);
  assert.match(component,/durability:'outbox'/);
  assert.match(component,/ownsPlacement\(useGameHub\.getState\(\),g\)/);
  assert.match(component,/setCanonicalActionPending\(hasCanonicalIntent\(useGameHub\.getState\(\)\)\)/);
});

test('unavailable and retired catalogue entries cannot select old world artwork',()=>{
  for(const catalog of [null,undefined,{kind:'legacy-m2'},catalogue]){
    for(const [kind,id]of [['remodel','meadow'],['remodel','moon_garden'],['companion','dog'],['goodie','yarn_mouse']])assert.equal(sceneCatalogPreview(catalog,kind,id),null);
  }
  assert.equal(sceneCatalogPreview(null,'food','kibble'),null);
  assert.equal(sceneCatalogPreview(null,'goodie','leaf_pot'),null);
  assert.equal(sceneCatalogPreview(catalogue,'goodie','leaf_pot'),'https://yard.test/assets/clean/leaf.webp');
  assert.equal(sceneCatalogPreview(catalogue,'food','kibble'),'https://yard.test/assets/clean/bowl.webp');
  assert.equal(sceneCatalogPreview(catalogue,'goodie','leaf_pot',{condition:'broken'}),null);
  assert.doesNotMatch(catalogSource,/\/games\/companion-yard\/|yard-scene45|render-pack\.mjs|CATALOG_PREVIEW_PATHS|PREVIEW_THUMBNAIL_OVERRIDES|legacy-m2/);
});

test('history keeps saved text and current portraits without scenery composition',()=>{
  for(const id of Object.keys(CURRENT_VISITOR_PORTRAITS))assert.equal(sceneCatalogPreview(null,'visitor',id,{pose:'nap',remodel:'meadow'}),CURRENT_VISITOR_PORTRAITS[id]);
  assert.equal(sceneCatalogPreview(null,'visitor','unknown_saved_visitor'),null);
  assert.equal(sceneCatalogPreview(null,'visitor','__proto__'),null);
  assert.equal(Object.keys(CURRENT_VISITOR_PORTRAITS).length,8);
  assert.match(component,/const savedDecorRows=/);
  assert.match(component,/yard\.placedGoodies\.filter/);
  assert.match(component,/savedDecorRows\.map\(item=><Row/);
  assert.match(component,/yard\.album\?\.photos/);
  assert.match(component,/p\.caption \|\| name\(p\.visitorId\)/);
  assert.doesNotMatch(component,/scenePhotoPreview|cy-photo-background|cy-photo-goodie|YARD_REMODELS|yard\.setRemodel|catalogPreview\('companion'/);
});

test('navigation keeps approved art and both visible and full accessible labels',()=>{
  assert.equal(YARD_UI_ART.food,'/assets/yard-ui/previews/ba0eb9cb82af.webp');
  assert.equal(YARD_UI_ART.decor,'/assets/yard-ui/previews/2da963c7e75d.webp');
  assert.equal(YARD_UI_ART.guests,CURRENT_VISITOR_PORTRAITS.pip_hamster);
  assert.ok(!YARD_UI_ART.gift&&!YARD_UI_ART.letter);
  assert.match(component,/const navigationArt=id=>YARD_UI_ART\[id\]/);
  assert.match(component,/const label=id==='decor'\?t\('yard.persistent.decorShort'\):title/);
  assert.match(component,/aria-label=\{accessibleName\}/);
  assert.match(component,/aria-pressed=\{menuSelection===id\}/);
  assert.match(component,/aria-expanded=\{panel===id\}/);
});

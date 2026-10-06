import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {catalogPreview,catalogPreviewSource,photoPreview,canAffordCatalogCost,placementMessageKey,YARD_UI_ART} from '../src/games/companion-yard-v2/catalog-ui.mjs';
import {YARD_FOODS,YARD_GOODIES,YARD_VISITORS,YARD_REMODELS} from '../game-logic/yard-catalog.js';
import {formatYardCurrencyBalance} from '../src/games/companion-yard/currencyDisplay.js';

const assets=new Set(Object.values(YARD_UI_ART));
test('all catalog items, food, remodels and all eight visitors have authored preview paths',()=>{
  assert.equal(Object.keys(YARD_VISITORS).length,8);
  for(const [kind,catalog] of [['food',YARD_FOODS],['goodie',YARD_GOODIES],['visitor',YARD_VISITORS],['remodel',YARD_REMODELS]]) {
    for(const id of Object.keys(catalog)) {
      const src=catalogPreview(kind,id);assert.ok(src,`${kind}/${id}`);assets.add(src);
      if(kind==='goodie') for(const condition of ['worn','broken']) assets.add(catalogPreview(kind,id,{condition}));
      if(kind==='visitor') for(const pose of catalog[id].poses) assets.add(catalogPreview(kind,id,{pose}));
    }
  }
});
test('album metadata selects the saved visitor pose, goodie and remodel without mutating the photo',()=>{
  const photo={visitorId:'mika_cat',pose:'nap',goodieId:'sun_cushion',remodel:'moon_garden',favorite:true};
  const before=JSON.stringify(photo),art=photoPreview(photo);
  assert.equal(catalogPreviewSource('visitor',photo.visitorId,{pose:photo.pose}),'/games/companion-yard/visitors/mika_cat_nap.png');
  assert.match(art.visitor,/^\/assets\/yard-ui\/previews\/[a-f0-9]+\.webp$/);
  assert.equal(art.background,'/assets/yard-ui/delivery/background-moon_garden.webp');
  assert.equal(catalogPreviewSource('goodie',photo.goodieId),'/assets/yard-mika/sun-cushion-clean.webp');
  assert.match(art.goodie,/^\/assets\/yard-ui\/previews\/[a-f0-9]+\.webp$/);
  assert.equal(JSON.stringify(photo),before);
});
test('unknown saved IDs never become arbitrary paths; unsupported poses use the real visitor portrait',()=>{
  for(const id of ['__proto__','constructor','../../private','https://example.test/asset']) {
    for(const kind of ['food','goodie','visitor','remodel','companion']) assert.equal(catalogPreview(kind,id),null);
  }
  for(const pose of ['../../file','unknown','peek','',null])assert.equal(catalogPreview('visitor','mika_cat',{pose}),catalogPreview('visitor','mika_cat'));
  assert.equal(catalogPreview('visitor','mika_cat'),'/assets/yard-ui/current-portraits/4d8d146daecb44098c0584e7f6e01872e85398693664b1b177769a24aa3e1093.png');
  assert.deepEqual(photoPreview({visitorId:'missing',remodel:'missing',goodieId:'missing'}),{visitor:null,background:null,goodie:null});
});
test('affordability follows both canonical currencies including free, shiny-only and mixed prices',()=>{
  const state={treats:360,shinyTreats:3};const before=JSON.stringify(state);
  assert.equal(canAffordCatalogCost(YARD_FOODS.kibble.cost,{}),true);
  assert.equal(canAffordCatalogCost(YARD_FOODS.bonito_bowl.cost,{treats:9000,shinyTreats:1}),false);
  assert.equal(canAffordCatalogCost(YARD_FOODS.bonito_bowl.cost,{treats:0,shinyTreats:2}),true);
  assert.equal(canAffordCatalogCost(YARD_GOODIES.moon_lamp.cost,state),true);
  assert.equal(canAffordCatalogCost(YARD_GOODIES.moon_lamp.cost,{treats:359,shinyTreats:3}),false);
  assert.equal(canAffordCatalogCost(YARD_GOODIES.moon_lamp.cost,{treats:360,shinyTreats:2}),false);
  assert.equal(JSON.stringify(state),before);
});
test('both currency balances retain their exact accessible values even when compacted',()=>{
  for(const language of ['en','ru']) {
    assert.equal(formatYardCurrencyBalance(0,language).exact,'0');
    const value=123456789,display=formatYardCurrencyBalance(value,language);
    assert.equal(display.exact.replace(/\D/g,''),String(value));
    assert.ok(display.compact.length<display.exact.length);
  }
});
test('every selected preview is a real checked-in asset',{skip:!process.env.YARD_UI_ASSET_ROOT},async()=>{
  assets.add(catalogPreview('food','empty_bowl'));
  for(const id of ['cat','dog','bunny','fox','hamster','turtle']) assets.add(catalogPreview('companion',id));
  for(const path of assets) await access(path.startsWith('/assets/yard-ui/')?new URL(`../public${path}`,import.meta.url):resolve(process.env.YARD_UI_ASSET_ROOT,`public${path}`));
});

test('placement failures retain their specific explanation and unknown errors fail closed',()=>{
  for(const [code,suffix] of Object.entries({FOOTPRINT_OUTSIDE_PLAYZONE:'outside',FOOTPRINT_COLLISION:'overlap',EXCLUSION_COLLISION:'exclusion',VISITOR_PATH_RESERVED:'reservedPath',PROP_RESERVED:'occupied',PROP_UNREACHABLE:'unreachable',ENTRY_BLOCKED:'entry'})) assert.equal(placementMessageKey(code),`yard.persistent.placement.${suffix}`);
  assert.equal(placementMessageKey('__proto__'),'yard.persistent.placement.blocked');
  assert.equal(placementMessageKey(undefined),'yard.persistent.placement.blocked');
});

test('valid historical visitor poses keep their exact aliases after invalid-pose fallback correction',()=>{
 const aliases={nap:'/assets/yard-ui/previews/9f872d4bbeb1daf0bf4a9f271c04e6681a7a88d9fdd5286b59f6a7f4be0f6619.webp',pounce:'/assets/yard-ui/previews/19cba40fb0f0ea65e573aa346231a7ab462ce249f033e2cdf4335f999288ebb6.webp',sit:'/assets/yard-ui/previews/10034554b4462cf44e6a0d66ca8f6702df464285ab99f4c22cb1cbf108fb36f6.webp'};
 for(const [pose,url]of Object.entries(aliases)){assert.equal(catalogPreview('visitor','mika_cat',{pose}),url);assert.equal(photoPreview({visitorId:'mika_cat',pose}).visitor,url);}
});

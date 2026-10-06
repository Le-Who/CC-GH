import {renderCatalogPreview} from './render-pack.mjs';
import {CATALOG_PREVIEW_PATHS} from './catalog-preview-paths.mjs';
import {PREVIEW_THUMBNAIL_OVERRIDES} from './preview-thumbnail-overrides.mjs';
import {CURRENT_CARTOON_PORTRAITS} from './current-cartoon-portrait-paths.mjs';

/** Presentation assets only. Prices, ownership and action gates remain server/catalog owned. */
const root = '/games/companion-yard';
const goodieIds = ['yarn_mouse', 'sun_cushion', 'cardboard_cottage', 'fountain_bowl', 'cozy_chair', 'snack_table', 'leaf_pot', 'moss_rug', 'cloud_bed', 'moon_lamp', 'book_nook'];
const visitorPoses = {
  mika_cat: ['nap', 'pounce', 'sit'], pebble_pup: ['roll', 'sit', 'sniff'],
  mochi_bunny: ['nap', 'nibble', 'stretch'], pip_hamster: ['peek', 'sit', 'nibble'],
  willow_fox: ['curl', 'listen', 'peek'], basil_turtle: ['rest', 'soak', 'watch'],
  starlit_fox: ['curl', 'glow', 'watch'], sage_turtle: ['rest', 'soak', 'watch'],
};
const foodAssets = {
  empty_bowl: '/assets/yard-mika/kibble-bowl-empty.webp',
  kibble: '/assets/yard-mika/kibble-bowl-clean.webp',
  berry_plate: '/assets/yard-mika/berry-plate-clean.webp',
  bonito_bowl: '/assets/yard-mika/bonito-bowl-clean.webp',
};
const stillAssets = {
  yarn_mouse: '/assets/yard-mika/yarn-mouse-clean.webp',
  sun_cushion: '/assets/yard-mika/sun-cushion-clean.webp',
  leaf_pot: '/assets/yard-pebble/leaf-pot-still.webp',
  snack_table: '/assets/yard-pip/snack-table-new.webp',
};
export const YARD_UI_ART = Object.freeze({
  food: '/assets/yard-ui/previews/ba0eb9cb82af.webp',
  decor: '/assets/yard-ui/previews/2da963c7e75d.webp',
  guests: '/assets/yard-ui/r1-pip/e95729164c758816ed9952a037b085cdfaf9242bd6bd96926acd30b04dcbde7b.png',
  gift: `${root}/ui/gift_box.png`, letter: `${root}/ui/daily_letter.png`,
  album: '/games/hud-redesign/room/semantic-icons/dock-album.png',
});
export function catalogPreviewSource(kind, id, {condition = 'new', pose = ''} = {}) {
  if (kind === 'food') return Object.hasOwn(foodAssets, id) ? foodAssets[id] : null;
  if (kind === 'goodie' && goodieIds.includes(id)) {
    // The released scene reuses these exact still pixels for its condition display.
    if (Object.hasOwn(stillAssets, id)) return stillAssets[id];
    const state=['worn','broken'].includes(condition)?condition:'new';
    if (id === 'moon_lamp') return `/assets/yard-fox/shared-props/moon/stills/moon-${state}.webp`;
    if (id === 'fountain_bowl') return `/assets/yard-turtles/shared-fountain/fountain-${state}.webp`;
    const variant = ['worn', 'broken'].includes(condition) ? `_${condition}` : '';
    return `${root}/goodies/${id}${variant}.png`;
  }
  if (kind === 'visitor' && Object.hasOwn(visitorPoses, id)) {
    const variant = visitorPoses[id].includes(pose) ? `_${pose}` : '';
    return `${root}/visitors/${id}${variant}.png`;
  }
  if (kind === 'companion' && ['cat', 'dog', 'bunny', 'fox', 'hamster', 'turtle'].includes(id)) return `${root}/companions/${id}.png`;
  if (kind === 'remodel' && ['meadow', 'tea_house', 'moon_garden'].includes(id)) return `${root}/backgrounds/${id}.png`;
  return null;
}
export function catalogPreview(kind,id,options) {
  const source=catalogPreviewSource(kind,id,options);
  if(kind==='visitor'&&!(Object.hasOwn(visitorPoses,id)&&visitorPoses[id].includes(options?.pose))&&Object.hasOwn(CURRENT_CARTOON_PORTRAITS,source))return CURRENT_CARTOON_PORTRAITS[source];
  const preview=source && (kind==='remodel'?`/assets/yard-ui/delivery/background-${id}.webp`:(CATALOG_PREVIEW_PATHS[source] || source));
  return preview && (PREVIEW_THUMBNAIL_OVERRIDES[preview] || preview);
}
export function photoPreview(photo = {}) {
  return { visitor: catalogPreview('visitor', photo.visitorId, {pose: photo.pose}), background: catalogPreview('remodel', photo.remodel), goodie: catalogPreview('goodie', photo.goodieId) };
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

/** This screen never substitutes old-camera prop/food pixels. Its ordinary
 * loading/error state remains visible until the verified catalogue is ready. */
export function sceneCatalogPreview(catalog,kind,id,options){
 if(catalog?.kind==='legacy-m2')return catalogPreview(kind,id,options);
 if(kind==='goodie'||kind==='food')return catalog?renderCatalogPreview(catalog,kind,id,options):null;
 return catalogPreview(kind,id,options);
}
export function scenePhotoPreview(catalog,photo={}){
 return{visitor:sceneCatalogPreview(catalog,'visitor',photo.visitorId,{pose:photo.pose}),
  background:sceneCatalogPreview(catalog,'remodel',photo.remodel),
  goodie:sceneCatalogPreview(catalog,'goodie',photo.goodieId)};
}
/** Exact historical URLs retired from the new-camera screen, not decoded
 * owners released at runtime. Generic historical helpers remain available. */
export function retiredScenePreviewURLs(){
 return [...new Set([...Object.keys(foodAssets).map(id=>catalogPreview('food',id)),
  ...goodieIds.flatMap(id=>['new','worn','broken'].map(condition=>catalogPreview('goodie',id,{condition})))])].sort();
}

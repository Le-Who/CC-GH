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
  food: '/games/hud-redesign/room/semantic-icons/dock-food.png',
  decor: '/games/hud-redesign/room/semantic-icons/dock-goodies.png',
  guests: '/games/hud-redesign/room/semantic-icons/dock-petbook.png',
  gift: `${root}/ui/gift_box.png`, letter: `${root}/ui/daily_letter.png`,
  album: '/games/hud-redesign/room/semantic-icons/dock-album.png',
});
export function catalogPreview(kind, id, {condition = 'new', pose = ''} = {}) {
  if (kind === 'food') return Object.hasOwn(foodAssets, id) ? foodAssets[id] : null;
  if (kind === 'goodie' && goodieIds.includes(id)) {
    if (condition === 'new' && Object.hasOwn(stillAssets, id)) return stillAssets[id];
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
export function photoPreview(photo = {}) {
  return { visitor: catalogPreview('visitor', photo.visitorId, {pose: photo.pose}), background: catalogPreview('remodel', photo.remodel), goodie: catalogPreview('goodie', photo.goodieId) };
}

/** A display guard using the canonical price; the reliable server action remains authoritative. */
export function canAffordCatalogCost(cost = {}, currencies = {}) {
  return ['treats', 'shinyTreats'].every(key => Number(cost[key] || 0) <= Number(currencies[key] || 0));
}

const placementMessages = Object.freeze({
  FOOTPRINT_OUTSIDE_PLAYZONE: 'outside', FOOTPRINT_COLLISION: 'overlap',
  EXCLUSION_COLLISION: 'exclusion', VISITOR_PATH_RESERVED: 'reservedPath',
  PROP_RESERVED: 'occupied', PROP_UNREACHABLE: 'unreachable', ENTRY_BLOCKED: 'entry',
  YARD_READ_ONLY: 'readOnly', MEDIA_UNAVAILABLE: 'unsupported', INVENTORY_ONLY: 'unsupported',
});
export function placementMessageKey(code) {
  return `yard.persistent.placement.${Object.hasOwn(placementMessages,code)?placementMessages[code]:'blocked'}`;
}

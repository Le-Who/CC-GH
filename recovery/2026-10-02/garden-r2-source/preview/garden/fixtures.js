import { createDefaultPlayer } from '../../game-logic.js';
import { createGardenEconomyState, getGardenXpRequired, GARDEN_STARTER_GOLD } from '../../game-logic/garden-economy.js';
import { PLANT_TYPES } from '../../game-logic/garden-shelf-plants.js';

import { normalizeGardenFixture } from './fixture-ids.js';
export { GARDEN_FIXTURE_IDS, normalizeGardenFixture } from './fixture-ids.js';
const plant = (id, type, shelfIndex, spotIndex, phase = 3, level = 1) => ({
  id: `preview-${id}`, type, shelfIndex, spotIndex, phase, level,
  phaseProgress: 0, lastWatered: 0, lastTapped: 0,
});

export function createGardenPreviewPlayer(fixture = 'progress', now = Date.now()) {
  const id = normalizeGardenFixture(fixture);
  const player = createDefaultPlayer('garden-offline-preview', 'GARDEN LOCAL DEMO', now);
  player._onboarded = true;
  player.garden = createGardenEconomyState(now);
  player.resources.gold = GARDEN_STARTER_GOLD;
  if (id === 'empty') return player;
  if (id === 'poor') { player.resources.gold = 0; return player; }
  Object.assign(player.garden, {
    level: 7, xp: 180, xpRequired: getGardenXpRequired(7),
    shelvesUnlocked: 2, totalGoldEarned: 500,
    plants: [plant('daisy', 'daisy', 0, 0, 3, 3), plant('lavender', 'lavender', 0, 1, 2), plant('basil', 'basil', 1, 0, 0)],
  });
  player.resources.gold = 2500;
  if (id === 'full') {
    const types = Object.keys(PLANT_TYPES);
    Object.assign(player.garden, {
      level: 30, xp: 28000, xpRequired: getGardenXpRequired(30), shelvesUnlocked: 5,
      plants: Array.from({ length: 15 }, (_, index) => plant(`full-${index}`, types[index % types.length], Math.floor(index / 3), index % 3, index % 4, 1 + index % 5)),
    });
    player.resources.gold = 125000;
  }
  if (id === 'inventory') player.garden.plants.push(
    plant('stash-daisy', 'daisy', -1, -1, 3, 5),
    plant('stash-lavender', 'lavender', -1, -1, 2),
    plant('stash-basil', 'basil', -1, -1, 1),
  );
  if (id === 'level-ready') {
    player.garden.xp = player.garden.xpRequired;
    player.garden.levelReady = true;
  }
  return player;
}

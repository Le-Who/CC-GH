export const GAME_REGISTRY = {
  garden: {
    id: "garden",
    labelKey: "tabs.garden",
    icon: "Leaf",
    visible: true,
    pixiScene: false,
    shell: "hub",
  },
  blox: {
    id: "blox",
    labelKey: "tabs.blox",
    icon: "Blocks",
    visible: true,
    pixiScene: true,
    shell: "game",
  },
  match3: {
    id: "match3",
    labelKey: "tabs.gems",
    icon: "Gem",
    visible: true,
    pixiScene: true,
    shell: "game",
  },
  merge: {
    id: "merge",
    labelKey: "tabs.merge",
    icon: "PackageOpen",
    visible: true,
    pixiScene: true,
    shell: "game",
  },
  bubbo: {
    id: "bubbo",
    labelKey: "tabs.bubbo",
    icon: "Sparkles",
    visible: true,
    pixiScene: true,
    shell: "game",
  },
  trivia: {
    id: "trivia",
    labelKey: "tabs.trivia",
    icon: "Bot",
    visible: true,
    pixiScene: false,
    shell: "game",
  },
  room: {
    id: "room",
    labelKey: "tabs.room",
    icon: "Home",
    visible: true,
    pixiScene: false,
    shell: "game",
  },
  farm: {
    id: "farm",
    labelKey: "tabs.farm",
    icon: "Sprout",
    visible: false,
    pixiScene: true,
    shell: "legacy",
  },
};

export const VISIBLE_GAME_IDS = Object.values(GAME_REGISTRY)
  .filter((game) => game.visible)
  .map((game) => game.id);

export const PIXI_GAME_IDS = Object.values(GAME_REGISTRY)
  .filter((game) => game.pixiScene)
  .map((game) => game.id);

export function getGameDefinition(gameId) {
  return GAME_REGISTRY[gameId] || null;
}

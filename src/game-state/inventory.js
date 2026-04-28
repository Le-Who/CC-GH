export function cloneRecord(record) {
  return { ...(record || {}) };
}

export function cloneList(list) {
  return Array.isArray(list) ? [...list] : [];
}

export function countMergeBoardItems(board = []) {
  const counts = {};
  for (const row of board || []) {
    for (const item of row || []) {
      if (!item?.id) continue;
      counts[item.id] = (counts[item.id] || 0) + 1;
    }
  }
  return counts;
}

export function normalizeInventory(snapshot = {}) {
  const farm = snapshot.farm || {};
  const resources = snapshot.resources || {};
  const merge = snapshot.merge || {};
  const room = snapshot.room || {};
  const yard = snapshot.yard || {};
  const base = snapshot.inventory || {};
  const harvested = cloneRecord(
    base.harvestedCrops ||
      base.harvested ||
      resources.harvestedCrops ||
      resources.harvested ||
      farm.harvested,
  );
  const roomInventory = cloneList(base.roomInventory || room.roomInventory || room.inventory);
  const yardFood = cloneRecord(base.yardFood || yard.foodInventory);
  const yardGoodies = cloneRecord(base.yardGoodies || yard.goodieInventory);
  return {
    seeds: cloneRecord(base.seeds || farm.inventory),
    harvested,
    harvestedCrops: harvested,
    mergeItems: cloneRecord(base.mergeItems || merge.itemCounts || countMergeBoardItems(merge.board)),
    mergeInventory: cloneList(base.mergeInventory || merge.mergeInventory || merge.inventory),
    roomInventory,
    yardFood,
    yardGoodies,
    rewards: {
      gold: resources.gold ?? base.rewards?.gold ?? 0,
      gachaTokens: resources.gachaTokens ?? base.rewards?.gachaTokens ?? 0,
      energy: resources.energy ?? base.rewards?.energy ?? null,
    },
  };
}

export function withNormalizedSnapshot(snapshot = {}) {
  const inventory = normalizeInventory(snapshot);
  return {
    ...snapshot,
    inventory,
    resources: {
      ...(snapshot.resources || {}),
      harvested: inventory.harvested,
      harvestedCrops: inventory.harvested,
    },
    room: {
      ...(snapshot.room || {}),
      inventory: inventory.roomInventory,
      roomInventory: inventory.roomInventory,
    },
    yard: {
      ...(snapshot.yard || {}),
      foodInventory: inventory.yardFood,
      goodieInventory: inventory.yardGoodies,
    },
    merge: {
      ...(snapshot.merge || {}),
      itemCounts: inventory.mergeItems,
    },
  };
}

export function listPositive(record = {}) {
  return Object.entries(record).filter(([, qty]) => Number(qty) > 0);
}

import { hudStore } from "../hooks/useHUDEngine.js";
import { farmStore } from "../hooks/useFarmEngine.js";
import { mergeStore } from "../hooks/useMergeEngine.js";
import { GameStore } from "../store/gameStore.js";

function cloneRecord(record) {
  return { ...(record || {}) };
}

function cloneList(list) {
  return Array.isArray(list) ? [...list] : [];
}

function resolveHarvestedCrops(resources) {
  return resources?.harvestedCrops ?? resources?.harvested;
}

function resolveRoomInventory(room) {
  return room?.roomInventory ?? room?.inventory;
}

function resolveMergeInventory(merge) {
  return merge?.mergeInventory ?? merge?.inventory;
}

function getResourcesSlice() {
  return GameStore.getState("resources") || {};
}

function getRoomSlice() {
  return GameStore.getState("room") || {};
}

function getMergeSlice() {
  return GameStore.getState("merge") || {};
}

function normalizeResources(resources, fallbackHarvestedCrops) {
  const harvestedCrops = resolveHarvestedCrops(resources);
  const nextHarvestedCrops =
    harvestedCrops ?? fallbackHarvestedCrops ?? hudStore.getState().harvestedCrops;
  const normalized = { ...(resources || {}) };
  if (nextHarvestedCrops !== undefined) {
    normalized.harvested = cloneRecord(nextHarvestedCrops);
    normalized.harvestedCrops = cloneRecord(nextHarvestedCrops);
  }
  return normalized;
}

function normalizeRoom(room, fallbackRoomInventory) {
  const roomInventory = resolveRoomInventory(room);
  const nextRoomInventory = roomInventory ?? fallbackRoomInventory;
  const normalized = { ...(room || {}) };
  if (nextRoomInventory !== undefined) {
    normalized.inventory = cloneList(nextRoomInventory);
    normalized.roomInventory = cloneList(nextRoomInventory);
  }
  return normalized;
}

function normalizeMerge(merge, fallbackMergeInventory) {
  const mergeInventory = resolveMergeInventory(merge);
  const nextMergeInventory =
    mergeInventory ?? fallbackMergeInventory ?? mergeStore.getState().mergeInventory;
  const normalized = { ...(merge || {}) };
  if (nextMergeInventory !== undefined) {
    normalized.inventory = cloneList(nextMergeInventory);
    normalized.mergeInventory = cloneList(nextMergeInventory);
  }
  return normalized;
}

function commitResources(resources) {
  const normalized = normalizeResources(resources, getHarvestedCrops());
  GameStore.setState("resources", normalized);
  hudStore.getState().setResources(normalized);
  return normalized;
}

function commitRoom(room) {
  const normalized = normalizeRoom(room, getRoomInventory());
  GameStore.setState("room", normalized);
  return normalized;
}

function commitMerge(merge) {
  const normalized = normalizeMerge(merge, getMergeInventory());
  GameStore.setState("merge", normalized);
  mergeStore.setState({
    board: normalized.board ?? mergeStore.getState().board,
    generators: normalized.generators ?? mergeStore.getState().generators,
    generatorState:
      normalized.generatorState ?? mergeStore.getState().generatorState,
    mergeInventory: cloneList(resolveMergeInventory(normalized)),
    lastFreePull: normalized.lastFreePull ?? mergeStore.getState().lastFreePull,
    lastFreeTaps: normalized.lastFreeTaps ?? mergeStore.getState().lastFreeTaps,
  });
  return normalized;
}

export function getResourcesState() {
  return normalizeResources(getResourcesSlice(), hudStore.getState().harvestedCrops);
}

export function syncResourcesState(
  resources,
  { preserveHarvestedCrops = true } = {},
) {
  if (!resources) return getResourcesState();
  const fallbackHarvestedCrops = preserveHarvestedCrops
    ? getHarvestedCrops()
    : undefined;
  return commitResources(normalizeResources(resources, fallbackHarvestedCrops));
}

export function syncHarvestedResources(resources, harvestedCrops) {
  return syncResourcesState(
    harvestedCrops === undefined
      ? resources
      : {
          ...(resources || getResourcesState()),
          harvested: cloneRecord(harvestedCrops),
          harvestedCrops: cloneRecord(harvestedCrops),
        },
    { preserveHarvestedCrops: harvestedCrops === undefined },
  );
}

export function syncRoomState(
  room,
  { preserveRoomInventory = true } = {},
) {
  if (!room) return commitRoom(getRoomSlice());
  const fallbackRoomInventory = preserveRoomInventory
    ? getRoomInventory()
    : undefined;
  return commitRoom(normalizeRoom(room, fallbackRoomInventory));
}

export function syncMergeState(
  merge,
  { preserveMergeInventory = true } = {},
) {
  if (!merge) return commitMerge(getMergeSlice());
  const fallbackMergeInventory = preserveMergeInventory
    ? getMergeInventory()
    : undefined;
  return commitMerge(normalizeMerge(merge, fallbackMergeInventory));
}

export function getSeedInventory() {
  return (
    farmStore.getState().seedInventory ||
    GameStore.getState("farm")?.seedInventory ||
    GameStore.getState("farm")?.inventory ||
    {}
  );
}

export function getHarvestedCrops() {
  return resolveHarvestedCrops(getResourcesSlice()) || hudStore.getState().harvestedCrops || {};
}

export function getRoomInventory() {
  return resolveRoomInventory(getRoomSlice()) || [];
}

export function getMergeInventory() {
  return resolveMergeInventory(getMergeSlice()) || mergeStore.getState().mergeInventory || [];
}

export function listHarvestedCrops() {
  return Object.entries(getHarvestedCrops()).filter(([, qty]) => qty > 0);
}

export function getHarvestedCropQty(cropId) {
  return getHarvestedCrops()[cropId] || 0;
}

export function replaceHarvestedCrops(harvestedCrops) {
  return syncHarvestedResources(getResourcesState(), harvestedCrops || {});
}

export function clearHarvestedCrops() {
  return replaceHarvestedCrops({});
}

export function adjustHarvestedCrop(cropId, delta) {
  const harvestedCrops = { ...getHarvestedCrops() };
  const nextQty = Math.max(0, (harvestedCrops[cropId] || 0) + delta);

  if (nextQty <= 0) {
    delete harvestedCrops[cropId];
  } else {
    harvestedCrops[cropId] = nextQty;
  }

  commitResources({
    ...getResourcesState(),
    harvested: harvestedCrops,
    harvestedCrops,
  });

  return harvestedCrops;
}

export function sellHarvestedCropLocally({
  cropId,
  amount = 1,
  sellPrice = 0,
}) {
  const available = getHarvestedCropQty(cropId);
  if (available < amount) {
    return { success: false, reason: "NO_CROP" };
  }

  const resources = getResourcesSlice();
  const harvestedCrops = { ...getHarvestedCrops() };
  const nextQty = available - amount;
  if (nextQty <= 0) {
    delete harvestedCrops[cropId];
  } else {
    harvestedCrops[cropId] = nextQty;
  }

  const totalGold = sellPrice * amount;
  const nextResources = {
    ...resources,
    gold: (resources.gold || 0) + totalGold,
    harvested: harvestedCrops,
    harvestedCrops,
  };

  commitResources(nextResources);
  return {
    success: true,
    harvestedCrops,
    totalGold,
    totalItems: amount,
    resources: nextResources,
  };
}

export function sellAllHarvestedCropsLocally(getSellPrice) {
  const entries = listHarvestedCrops();
  if (entries.length === 0) {
    return { success: false, reason: "EMPTY" };
  }

  let totalGold = 0;
  let totalItems = 0;
  for (const [cropId, qty] of entries) {
    totalGold += (getSellPrice(cropId) || 0) * qty;
    totalItems += qty;
  }

  const resources = getResourcesSlice();
  const nextResources = {
    ...resources,
    gold: (resources.gold || 0) + totalGold,
    harvested: {},
    harvestedCrops: {},
  };

  commitResources(nextResources);
  return {
    success: true,
    entries,
    totalGold,
    totalItems,
    resources: nextResources,
  };
}

export function feedPetWithHarvestedCropLocally({
  cropId,
  energyYield = 1,
  fullnessYield = 5,
}) {
  const resources = getResourcesSlice();
  const energy = resources.energy || {};
  if (energy.current >= energy.max) {
    return { success: false, reason: "ENERGY_FULL" };
  }

  const pet = GameStore.getState("pet");
  if (pet && (pet.stats?.fullness ?? 0) >= 100) {
    return { success: false, reason: "PET_FULL" };
  }

  if (getHarvestedCropQty(cropId) <= 0) {
    return { success: false, reason: "NO_CROP" };
  }

  const harvestedCrops = { ...getHarvestedCrops() };
  const nextQty = (harvestedCrops[cropId] || 0) - 1;
  if (nextQty <= 0) {
    delete harvestedCrops[cropId];
  } else {
    harvestedCrops[cropId] = nextQty;
  }

  const nextResources = {
    ...resources,
    energy: {
      ...energy,
      current: Math.min(energy.max, (energy.current || 0) + energyYield),
    },
    harvested: harvestedCrops,
    harvestedCrops,
  };
  commitResources(nextResources);

  if (pet) {
    GameStore.setState("pet", {
      ...pet,
      stats: {
        ...pet.stats,
        fullness: Math.min(100, (pet.stats?.fullness ?? 0) + fullnessYield),
      },
      lastDigestionTimestamp: Date.now(),
    });
  }

  return {
    success: true,
    harvestedCrops,
    resources: nextResources,
  };
}

export function replaceRoomInventory(roomInventory) {
  return syncRoomState(
    {
      ...getRoomSlice(),
      inventory: cloneList(roomInventory),
      roomInventory: cloneList(roomInventory),
    },
    { preserveRoomInventory: false },
  );
}

export function addRoomInventoryItem(itemId) {
  if (!itemId) return getRoomInventory();
  const roomInventory = [...getRoomInventory(), itemId];
  replaceRoomInventory(roomInventory);
  return roomInventory;
}

export function removeRoomInventoryItem(itemId) {
  if (!itemId) return getRoomInventory();
  const roomInventory = [...getRoomInventory()];
  const itemIndex = roomInventory.indexOf(itemId);
  if (itemIndex < 0) return roomInventory;
  roomInventory.splice(itemIndex, 1);
  replaceRoomInventory(roomInventory);
  return roomInventory;
}

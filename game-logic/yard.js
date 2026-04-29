import {
  LEGACY_ROOM_GOODIE_MAP,
  YARD_EXPANSIONS,
  YARD_FOODS,
  YARD_GOODIES,
  YARD_HOUR_MS,
  YARD_REMODELS,
  YARD_SIMULATION_CAP_MS,
  YARD_SLOT_LAYOUTS,
  YARD_SPECIES,
  YARD_VISITORS,
  getYardConditionProfile,
  getYardGoodieActivities,
  getYardGoodieCapacity,
} from "./yard-catalog.js";

const MAX_PENDING_GIFTS = 100;
const MAX_ALBUM_PHOTOS = 80;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampInteger(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, Math.floor(finiteNumber(value, fallback))));
}

function cloneCounts(source = {}) {
  const result = {};
  if (!source || typeof source !== "object") return result;
  for (const [id, qty] of Object.entries(source)) {
    const count = clampInteger(qty, 0, 999, 0);
    if (count > 0) result[id] = count;
  }
  return result;
}

function incCount(record, id, amount = 1) {
  if (!id) return;
  record[id] = Math.max(0, (Number(record[id]) || 0) + amount);
  if (record[id] <= 0) delete record[id];
}

function canAfford(currencies = {}, cost = {}) {
  return (currencies.treats || 0) >= (cost.treats || 0) &&
    (currencies.shinyTreats || 0) >= (cost.shinyTreats || 0);
}

function spend(currencies, cost = {}) {
  if (!canAfford(currencies, cost)) return false;
  currencies.treats = Math.max(0, (currencies.treats || 0) - (cost.treats || 0));
  currencies.shinyTreats = Math.max(0, (currencies.shinyTreats || 0) - (cost.shinyTreats || 0));
  return true;
}

function addCurrencies(currencies, reward = {}) {
  currencies.treats = Math.max(0, (currencies.treats || 0) + (reward.treats || 0));
  currencies.shinyTreats = Math.max(0, (currencies.shinyTreats || 0) + (reward.shinyTreats || 0));
}

function hashString(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomUnit(seed) {
  return (hashString(seed) % 100000) / 100000;
}

function randomInt(seed, min, max) {
  return min + (hashString(seed) % (max - min + 1));
}

const ENTRY_EDGES = ["left", "right", "top", "bottom"];
const FACING_VALUES = ["left", "right"];

function makeYardId(prefix, now, seed) {
  return `${prefix}_${Math.max(0, Math.floor(finiteNumber(now, 0))).toString(36)}_${hashString(seed).toString(36)}`;
}

export function getUnlockedYardSlots(expansionLevel = 1) {
  return YARD_SLOT_LAYOUTS[expansionLevel >= 2 ? 2 : 1] || YARD_SLOT_LAYOUTS[1];
}

function normalizeCompanion(raw = {}, legacy = {}) {
  const legacyPet = legacy.pet || {};
  const legacySkin = String(legacyPet.skinId || raw.skinId || "basic_dog");
  const speciesFromSkin = legacySkin.includes("bunny")
    ? "bunny"
    : legacySkin.includes("cat")
      ? "cat"
      : "dog";
  const species = YARD_SPECIES.includes(raw.species) ? raw.species : speciesFromSkin;
  const name = String(raw.name || legacyPet.name || "Buddy").trim().slice(0, 16) || "Buddy";
  return {
    name,
    species,
    skinId: String(raw.skinId || legacySkin || species).slice(0, 40),
    mood: String(raw.mood || "curious").slice(0, 40),
  };
}

function legacyGoodieCounts(legacy = {}) {
  const counts = {};
  const room = legacy.room || {};
  const legacyInventory = [
    ...(Array.isArray(room.inventory) ? room.inventory : []),
    ...(Array.isArray(room.roomInventory) ? room.roomInventory : []),
  ];
  for (const decoId of new Set(legacyInventory)) {
    const goodieId = LEGACY_ROOM_GOODIE_MAP[decoId];
    if (goodieId) incCount(counts, goodieId, 1);
  }
  return counts;
}

function normalizePlacedGoodies(rawPlaced = [], expansionLevel = 1, legacy = {}) {
  const slots = getUnlockedYardSlots(expansionLevel);
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const used = new Set();
  const placed = [];

  if (Array.isArray(rawPlaced)) {
    for (const raw of rawPlaced) {
      const goodieId = String(raw?.goodieId || "");
      const goodie = YARD_GOODIES[goodieId];
      const slotId = String(raw?.slotId || "");
      const slot = slotMap.get(slotId);
      if (!goodie || !slot || used.has(slotId)) continue;
      if (goodie.size === "large" && slot.size !== "large") continue;
      used.add(slotId);
      const uses = clampInteger(raw.uses, 0, 999, 0);
      const condition = raw.condition === "broken" || raw.condition === "worn" ? raw.condition : "new";
      placed.push({
        slotId,
        goodieId,
        condition,
        uses,
        placedAt: Math.max(0, Math.floor(finiteNumber(raw.placedAt, 0))),
      });
    }
  }

  if (!placed.length && legacy.room?.decorations?.length) {
    let slotIndex = 0;
    for (const decoId of legacy.room.decorations) {
      const goodieId = LEGACY_ROOM_GOODIE_MAP[decoId];
      const goodie = YARD_GOODIES[goodieId];
      if (!goodie) continue;
      const slot = slots.slice(slotIndex).find((candidate) => {
        if (used.has(candidate.id)) return false;
        return goodie.size !== "large" || candidate.size === "large";
      });
      if (!slot) break;
      slotIndex = slots.findIndex((candidate) => candidate.id === slot.id) + 1;
      used.add(slot.id);
      placed.push({
        slotId: slot.id,
        goodieId,
        condition: "new",
        uses: 0,
        placedAt: 0,
      });
    }
  }

  return placed;
}

function normalizeBowls(rawBowls = [], expansionLevel = 1, now = Date.now()) {
  const wanted = expansionLevel >= 2 ? ["bowl-1", "bowl-2"] : ["bowl-1"];
  const byId = new Map(Array.isArray(rawBowls) ? rawBowls.map((bowl) => [bowl?.id, bowl]) : []);
  return wanted.map((id) => {
    const raw = byId.get(id) || {};
    const foodId = YARD_FOODS[raw.foodId] ? raw.foodId : null;
    const expiresAt = foodId ? Math.max(0, Math.floor(finiteNumber(raw.expiresAt, now))) : null;
    const placedAt = foodId ? Math.max(0, Math.floor(finiteNumber(raw.placedAt, now))) : null;
    const servings = foodId ? clampInteger(raw.servings, 0, 99, YARD_FOODS[foodId].servings) : 0;
    return {
      id,
      foodId: foodId && expiresAt > now && servings > 0 ? foodId : null,
      servings: foodId && expiresAt > now ? servings : 0,
      placedAt: foodId && expiresAt > now ? placedAt : null,
      expiresAt: foodId && expiresAt > now ? expiresAt : null,
    };
  });
}

function activityForVisit(visit = {}, goodie = {}) {
  const conditions = ["new", "worn", "broken"];
  const activities = conditions.flatMap((condition) => getYardGoodieActivities(goodie, condition));
  const unique = [];
  const seen = new Set();
  for (const activity of activities) {
    if (seen.has(activity.id)) continue;
    seen.add(activity.id);
    unique.push(activity);
  }
  const requested = String(visit.activityId || "");
  const byId = unique.find((activity) => activity.id === requested);
  if (byId) return byId;
  const byPose = unique.find((activity) => activity.pose === visit.pose);
  if (byPose) return byPose;
  return unique[hashString(`${visit.visitId || visit.visitorId || "visit"}:activity`) % Math.max(1, unique.length)] ||
    { id: "rest", pose: "sit", x: 0, y: -8, layer: "front", roam: 2 };
}

function normalizeEntryEdge(value, seed) {
  const edge = String(value || "");
  if (ENTRY_EDGES.includes(edge)) return edge;
  return ENTRY_EDGES[hashString(`${seed}:entry`) % ENTRY_EDGES.length];
}

function normalizeFacing(value, entryEdge, activity = {}) {
  if (FACING_VALUES.includes(value)) return value;
  if (activity.facing) return activity.facing;
  return entryEdge === "right" ? "left" : "right";
}

function normalizeVisitors(rawVisitors = [], now = Date.now()) {
  if (!Array.isArray(rawVisitors)) return [];
  return rawVisitors
    .filter((visit) => YARD_VISITORS[visit?.visitorId] && YARD_GOODIES[visit?.goodieId])
    .map((visit) => {
      const visitId = String(visit.visitId || makeYardId("visit", now, `${visit.visitorId}:${visit.slotId}`)).slice(0, 80);
      const activity = activityForVisit(visit, YARD_GOODIES[visit.goodieId]);
      const entryEdge = normalizeEntryEdge(visit.entryEdge, visitId);
      const motionSeed = String(visit.motionSeed || hashString(`${visitId}:${visit.visitorId}:${activity.id}`).toString(36)).slice(0, 80);
      return {
        visitId,
        visitorId: String(visit.visitorId),
        goodieId: String(visit.goodieId),
        slotId: String(visit.slotId || ""),
        bowlId: String(visit.bowlId || "bowl-1"),
        pose: String(visit.pose || activity.pose || "sit").slice(0, 40),
        activityId: activity.id,
        activityLayer: activity.layer || "front",
        entryEdge,
        facing: normalizeFacing(visit.facing, entryEdge, activity),
        motionSeed,
        arrivedAt: Math.max(0, Math.floor(finiteNumber(visit.arrivedAt, now))),
        leavesAt: Math.max(0, Math.floor(finiteNumber(visit.leavesAt, now + YARD_HOUR_MS))),
      };
    })
    .filter((visit) => visit.leavesAt > now);
}

function normalizePetbook(raw = {}) {
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [visitorId, entry] of Object.entries(raw)) {
    if (!YARD_VISITORS[visitorId]) continue;
    result[visitorId] = {
      visits: clampInteger(entry?.visits, 0, 100000, 0),
      firstSeenAt: entry?.firstSeenAt ? Math.max(0, Math.floor(finiteNumber(entry.firstSeenAt, 0))) : null,
      lastSeenAt: entry?.lastSeenAt ? Math.max(0, Math.floor(finiteNumber(entry.lastSeenAt, 0))) : null,
      favoriteGoodies: cloneCounts(entry?.favoriteGoodies),
      mementoReceived: !!entry?.mementoReceived,
    };
  }
  return result;
}

function normalizeAlbum(raw = {}) {
  const photos = Array.isArray(raw.photos)
    ? raw.photos.slice(-MAX_ALBUM_PHOTOS).filter((photo) => YARD_VISITORS[photo?.visitorId]).map((photo) => ({
      id: String(photo.id || "").slice(0, 80),
      visitorId: String(photo.visitorId),
      goodieId: YARD_GOODIES[photo.goodieId] ? String(photo.goodieId) : null,
      pose: String(photo.pose || "portrait").slice(0, 40),
      remodel: YARD_REMODELS[photo.remodel] ? String(photo.remodel) : "meadow",
      capturedAt: Math.max(0, Math.floor(finiteNumber(photo.capturedAt, 0))),
      caption: String(photo.caption || "").slice(0, 48),
      favorite: !!photo.favorite,
    })).filter((photo) => photo.id)
    : [];
  const favoritePhotoId = photos.some((photo) => photo.id === raw.favoritePhotoId)
    ? raw.favoritePhotoId
    : photos.find((photo) => photo.favorite)?.id || null;
  return { photos, favoritePhotoId };
}

function normalizePendingGifts(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_PENDING_GIFTS).filter((gift) => YARD_VISITORS[gift?.visitorId]).map((gift) => ({
    id: String(gift.id || "").slice(0, 80),
    visitorId: String(gift.visitorId),
    treats: clampInteger(gift.treats, 0, 100000, 0),
    shinyTreats: clampInteger(gift.shinyTreats, 0, 1000, 0),
    mementoId: gift.mementoId ? String(gift.mementoId).slice(0, 80) : null,
    createdAt: Math.max(0, Math.floor(finiteNumber(gift.createdAt, 0))),
  })).filter((gift) => gift.id);
}

export function createDefaultYardState(now = Date.now(), legacy = {}) {
  return {
    currencies: { treats: 80, shinyTreats: 3 },
    foodInventory: { kibble: 3 },
    goodieInventory: {
      yarn_mouse: 1,
      sun_cushion: 1,
      ...legacyGoodieCounts(legacy),
    },
    placedGoodies: normalizePlacedGoodies([], 1, legacy),
    bowls: normalizeBowls([], 1, now),
    activeVisitors: [],
    pendingGifts: [],
    petbook: {},
    album: { photos: [], favoritePhotoId: null },
    mementos: {},
    expansion: { level: 1 },
    remodel: "meadow",
    ownedRemodels: ["meadow"],
    helper: { unlocked: false, autoRefill: false, preferredFoodId: "kibble" },
    companion: normalizeCompanion({}, legacy),
    dailyLetter: { lastClaimedDate: null, stamps: 0 },
    lastSimulatedAt: now,
  };
}

export function normalizeYardState(raw = null, legacy = {}, now = Date.now()) {
  const hasExistingYard = !!(raw && typeof raw === "object");
  const starterLegacy = hasExistingYard ? {} : legacy;
  const fallback = createDefaultYardState(now, starterLegacy);
  const source = hasExistingYard ? raw : {};
  const expansionLevel = clampInteger(source.expansion?.level, 1, 2, fallback.expansion.level);
  const ownedRemodels = Array.isArray(source.ownedRemodels)
    ? [...new Set(["meadow", ...source.ownedRemodels.filter((id) => YARD_REMODELS[id])])]
    : [...fallback.ownedRemodels];
  const remodel = YARD_REMODELS[source.remodel] && ownedRemodels.includes(source.remodel)
    ? source.remodel
    : "meadow";
  const foodInventory = source.foodInventory && typeof source.foodInventory === "object"
    ? Object.fromEntries(Object.entries(cloneCounts(source.foodInventory)).filter(([id]) => YARD_FOODS[id]))
    : { ...fallback.foodInventory };
  const goodieInventory = source.goodieInventory && typeof source.goodieInventory === "object"
    ? Object.fromEntries(Object.entries(cloneCounts(source.goodieInventory)).filter(([id]) => YARD_GOODIES[id]))
    : { ...fallback.goodieInventory };

  return {
    currencies: {
      treats: clampInteger(source.currencies?.treats, 0, 1_000_000_000, fallback.currencies.treats),
      shinyTreats: clampInteger(source.currencies?.shinyTreats, 0, 1_000_000, fallback.currencies.shinyTreats),
    },
    foodInventory,
    goodieInventory,
    placedGoodies: normalizePlacedGoodies(source.placedGoodies, expansionLevel, starterLegacy),
    bowls: normalizeBowls(source.bowls, expansionLevel, now),
    activeVisitors: normalizeVisitors(source.activeVisitors, now),
    pendingGifts: normalizePendingGifts(source.pendingGifts),
    petbook: normalizePetbook(source.petbook),
    album: normalizeAlbum(source.album),
    mementos: source.mementos && typeof source.mementos === "object"
      ? Object.fromEntries(Object.entries(source.mementos).filter(([id]) => YARD_VISITORS[id]))
      : {},
    expansion: { level: expansionLevel },
    remodel,
    ownedRemodels,
    helper: {
      unlocked: !!source.helper?.unlocked || expansionLevel >= 2,
      autoRefill: !!source.helper?.autoRefill && (!!source.helper?.unlocked || expansionLevel >= 2),
      preferredFoodId: YARD_FOODS[source.helper?.preferredFoodId] ? source.helper.preferredFoodId : "kibble",
    },
    companion: normalizeCompanion(source.companion, starterLegacy),
    dailyLetter: {
      lastClaimedDate: source.dailyLetter?.lastClaimedDate ? String(source.dailyLetter.lastClaimedDate).slice(0, 20) : null,
      stamps: clampInteger(source.dailyLetter?.stamps, 0, 100000, 0),
    },
    lastSimulatedAt: Math.max(0, Math.floor(finiteNumber(source.lastSimulatedAt, fallback.lastSimulatedAt))),
  };
}

function updateGoodieCondition(placed) {
  const goodie = YARD_GOODIES[placed.goodieId];
  if (!goodie) return;
  if (placed.uses >= goodie.durability * 2) placed.condition = "broken";
  else if (placed.uses >= goodie.durability) placed.condition = "worn";
  else placed.condition = "new";
}

function activeAnchorIds(yard) {
  return new Set((yard.activeVisitors || []).map((visit) => `${visit.slotId}:${visit.activityId || "rest"}`));
}

function activeSlotCounts(yard) {
  const counts = new Map();
  for (const visit of yard.activeVisitors || []) {
    counts.set(visit.slotId, (counts.get(visit.slotId) || 0) + 1);
  }
  return counts;
}

function expireBowls(yard, now) {
  for (const bowl of yard.bowls) {
    if (!bowl.foodId) continue;
    if ((bowl.expiresAt || 0) <= now || (bowl.servings || 0) <= 0) {
      bowl.foodId = null;
      bowl.servings = 0;
      bowl.placedAt = null;
      bowl.expiresAt = null;
    }
  }
}

function helperRefill(yard, now) {
  if (!yard.helper?.unlocked || !yard.helper?.autoRefill) return;
  for (const bowl of yard.bowls) {
    if (bowl.foodId) continue;
    const preferred = yard.helper.preferredFoodId || "kibble";
    const foodId = (yard.foodInventory[preferred] || 0) > 0
      ? preferred
      : Object.keys(YARD_FOODS).find((candidate) => (yard.foodInventory[candidate] || 0) > 0);
    if (!foodId) continue;
    setBowlFood(yard, bowl.id, foodId, now);
  }
}

function setBowlFood(yard, bowlId, foodId, now) {
  const bowl = yard.bowls.find((candidate) => candidate.id === bowlId);
  const food = YARD_FOODS[foodId];
  if (!bowl || !food || (yard.foodInventory[foodId] || 0) <= 0) return false;
  incCount(yard.foodInventory, foodId, -1);
  bowl.foodId = foodId;
  bowl.servings = food.servings;
  bowl.placedAt = now;
  bowl.expiresAt = now + food.durationMs;
  return true;
}

function matchingVisitorCandidates(goodie, bowl, condition = "new") {
  const food = YARD_FOODS[bowl.foodId];
  if (!food) return [];
  const tags = new Set([...(goodie.tags || []), ...(food.tags || [])]);
  const conditionProfile = getYardConditionProfile(goodie, condition);
  const candidates = [];
  for (const visitor of Object.values(YARD_VISITORS)) {
    if (visitor.requires) {
      if (visitor.requires.goodieId !== goodie.id || visitor.requires.foodId !== bowl.foodId) continue;
    }
    const matches = (visitor.tags || []).filter((tag) => tags.has(tag)).length;
    if (!matches && !visitor.requires) continue;
    const strictBoost = visitor.requires ? 18 : 1;
    candidates.push({
      visitor,
      weight: Math.max(1, visitor.baseWeight * strictBoost + matches * 4) * (food.attraction || 1) * conditionProfile.attraction,
      strict: !!visitor.requires,
    });
  }
  return candidates;
}

function pickVisitor(candidates, seed) {
  const strict = candidates.filter((entry) => entry.strict);
  if (strict.length && randomUnit(`${seed}:strict`) < 0.82) {
    return strict[hashString(`${seed}:strict-pick`) % strict.length].visitor;
  }
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;
  let cursor = randomUnit(seed) * total;
  for (const entry of candidates) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.visitor;
  }
  return candidates[candidates.length - 1]?.visitor || null;
}

function pickActivityForVisitor(goodie, placed, visitor, availableActivities, seed) {
  const visitorTags = new Set(visitor.tags || []);
  const visitorPoses = new Set(visitor.poses || []);
  const matching = availableActivities.filter((activity) => visitorPoses.has(activity.pose) || visitorTags.has(activity.id));
  const pool = matching.length ? matching : availableActivities;
  return pool[hashString(`${seed}:activity`) % pool.length] || availableActivities[0];
}

function registerArrival(yard, visitor, placed, bowl, activity, now, seed) {
  const pose = activity?.pose || visitor.poses[hashString(`${seed}:pose`) % visitor.poses.length] || "sit";
  const duration = randomInt(`${seed}:duration`, 45, 110) * 60 * 1000;
  const entryEdge = ENTRY_EDGES[hashString(`${seed}:entry`) % ENTRY_EDGES.length];
  const visit = {
    visitId: makeYardId("visit", now, `${seed}:${visitor.id}:${placed.slotId}`),
    visitorId: visitor.id,
    goodieId: placed.goodieId,
    slotId: placed.slotId,
    bowlId: bowl.id,
    pose,
    activityId: activity?.id || "rest",
    activityLayer: activity?.layer || "front",
    entryEdge,
    facing: normalizeFacing(activity?.facing, entryEdge, activity),
    motionSeed: hashString(`${seed}:${visitor.id}:${activity?.id || "rest"}:motion`).toString(36),
    arrivedAt: now,
    leavesAt: now + duration,
  };
  yard.activeVisitors.push(visit);
  const entry = yard.petbook[visitor.id] || {
    visits: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    favoriteGoodies: {},
    mementoReceived: false,
  };
  entry.visits += 1;
  entry.firstSeenAt = entry.firstSeenAt || now;
  entry.lastSeenAt = now;
  incCount(entry.favoriteGoodies, placed.goodieId, 1);
  yard.petbook[visitor.id] = entry;
  placed.uses = (placed.uses || 0) + 1;
  updateGoodieCondition(placed);
  bowl.servings = Math.max(0, (bowl.servings || 0) - 1);
  if (bowl.servings <= 0) {
    bowl.foodId = null;
    bowl.placedAt = null;
    bowl.expiresAt = null;
  }
}

function createGiftForVisit(yard, visit, now) {
  const visitor = YARD_VISITORS[visit.visitorId];
  if (!visitor) return null;
  const [minTreats, maxTreats] = visitor.gift.treats;
  const treats = randomInt(`${visit.visitId}:treats`, minTreats, maxTreats);
  const shinyTreats = randomUnit(`${visit.visitId}:shiny`) < visitor.gift.shinyChance ? 1 : 0;
  let mementoId = null;
  const entry = yard.petbook[visitor.id];
  if (entry && !entry.mementoReceived && entry.visits >= visitor.memento.threshold) {
    entry.mementoReceived = true;
    yard.mementos[visitor.id] = {
      id: visitor.memento.id,
      visitorId: visitor.id,
      name: visitor.memento.name,
      receivedAt: now,
    };
    mementoId = visitor.memento.id;
  }
  return {
    id: makeYardId("gift", now, visit.visitId),
    visitorId: visitor.id,
    treats,
    shinyTreats,
    mementoId,
    createdAt: now,
  };
}

function processDepartures(yard, now) {
  const remaining = [];
  for (const visit of yard.activeVisitors || []) {
    if (visit.leavesAt <= now) {
      const gift = createGiftForVisit(yard, visit, visit.leavesAt);
      if (gift) yard.pendingGifts.push(gift);
    } else {
      remaining.push(visit);
    }
  }
  yard.activeVisitors = remaining;
  if (yard.pendingGifts.length > MAX_PENDING_GIFTS) {
    yard.pendingGifts = yard.pendingGifts.slice(-MAX_PENDING_GIFTS);
  }
}

function simulateStep(yard, now, seedBase) {
  processDepartures(yard, now);
  expireBowls(yard, now);
  helperRefill(yard, now);
  const bowlsWithFood = yard.bowls.filter((bowl) => bowl.foodId && bowl.servings > 0);
  if (!bowlsWithFood.length) return;
  const occupied = activeAnchorIds(yard);
  const slotCounts = activeSlotCounts(yard);
  for (const placed of yard.placedGoodies) {
    const goodie = YARD_GOODIES[placed.goodieId];
    if (!goodie) continue;
    const capacity = getYardGoodieCapacity(goodie);
    const activeCount = slotCounts.get(placed.slotId) || 0;
    if (activeCount >= capacity) continue;
    const availableActivities = getYardGoodieActivities(goodie, placed.condition)
      .filter((activity) => !occupied.has(`${placed.slotId}:${activity.id}`));
    if (!availableActivities.length) continue;

    const openCount = Math.min(capacity - activeCount, availableActivities.length);
    for (let activityIndex = 0; activityIndex < openCount; activityIndex += 1) {
      const activitySeed = `${seedBase}:${placed.slotId}:${activityIndex}`;
      const bowl = bowlsWithFood[hashString(`${activitySeed}:bowl`) % bowlsWithFood.length];
      if (!bowl?.foodId) continue;
      const candidates = matchingVisitorCandidates(goodie, bowl, placed.condition);
      if (!candidates.length) continue;
      const hasStrict = candidates.some((entry) => entry.strict);
      const conditionProfile = getYardConditionProfile(goodie, placed.condition);
      const chance = Math.max(0.08, Math.min(0.96, (hasStrict ? 0.92 : 0.42) * conditionProfile.attraction));
      const totalVisits = Object.values(yard.petbook || {}).reduce((sum, entry) => sum + (entry.visits || 0), 0);
      if (!hasStrict && totalVisits > 0 && randomUnit(`${activitySeed}:chance`) > chance) continue;
      const visitor = pickVisitor(candidates, `${activitySeed}:visitor`);
      if (!visitor) continue;
      const activity = pickActivityForVisitor(goodie, placed, visitor, availableActivities, activitySeed);
      if (!activity || occupied.has(`${placed.slotId}:${activity.id}`)) continue;
      registerArrival(yard, visitor, placed, bowl, activity, now, `${activitySeed}:${activity.id}`);
      occupied.add(`${placed.slotId}:${activity.id}`);
      slotCounts.set(placed.slotId, (slotCounts.get(placed.slotId) || 0) + 1);
      const index = availableActivities.findIndex((candidate) => candidate.id === activity.id);
      if (index >= 0) availableActivities.splice(index, 1);
      if (!availableActivities.length) break;
    }
  }
}

export function simulateYardState(rawYard, now = Date.now(), legacy = {}, seed = "") {
  const safeNow = Math.max(0, Math.floor(finiteNumber(now, Date.now())));
  const rawLastSimulatedAt = rawYard && typeof rawYard === "object"
    ? Math.max(0, Math.floor(finiteNumber(rawYard.lastSimulatedAt, safeNow)))
    : safeNow;
  const clampedLastSimulatedAt = Math.min(rawLastSimulatedAt, safeNow);
  const source = rawYard && typeof rawYard === "object"
    ? { ...rawYard, lastSimulatedAt: clampedLastSimulatedAt }
    : rawYard;
  const yard = normalizeYardState(source, legacy, clampedLastSimulatedAt);
  if (safeNow <= yard.lastSimulatedAt) {
    processDepartures(yard, safeNow);
    yard.lastSimulatedAt = safeNow;
    return yard;
  }
  const end = Math.min(safeNow, yard.lastSimulatedAt + YARD_SIMULATION_CAP_MS);
  let cursor = yard.lastSimulatedAt;
  while (cursor < end) {
    cursor = Math.min(cursor + YARD_HOUR_MS, end);
    simulateStep(yard, cursor, `${seed}:${yard.lastSimulatedAt}:${cursor}`);
  }
  processDepartures(yard, end);
  if (end < safeNow) {
    processDepartures(yard, safeNow);
    expireBowls(yard, safeNow);
    yard.lastSimulatedAt = safeNow;
    return normalizeYardState(yard, legacy, safeNow);
  }
  yard.lastSimulatedAt = end;
  return normalizeYardState(yard, legacy, end);
}

function fail(status, error) {
  return { status, error };
}

function ok(extras = {}) {
  return { status: 200, extras };
}

function actionNow(payload = {}, options = {}) {
  const value = Number.isFinite(Number(options.now)) ? options.now : payload.now;
  return Math.max(0, Math.floor(finiteNumber(value, Date.now())));
}

function validSlotForGoodie(yard, slotId, goodie) {
  const slot = getUnlockedYardSlots(yard.expansion.level).find((candidate) => candidate.id === slotId);
  if (!slot) return null;
  if (goodie.size === "large" && slot.size !== "large") return null;
  return slot;
}

function returnInvalidPlacedGoodies(yard) {
  const validSlots = new Set(getUnlockedYardSlots(yard.expansion.level).map((slot) => slot.id));
  const remaining = [];
  for (const placed of yard.placedGoodies) {
    if (validSlots.has(placed.slotId)) remaining.push(placed);
    else incCount(yard.goodieInventory, placed.goodieId, 1);
  }
  yard.placedGoodies = remaining;
}

export function applyYardActionToState(rawYard, action, payload = {}, legacy = {}, seed = "", options = {}) {
  const now = actionNow(payload, options);
  const yard = simulateYardState(rawYard, now, legacy, seed);

  switch (action) {
    case "yard.buyFood": {
      const foodId = String(payload.foodId || "");
      const food = YARD_FOODS[foodId];
      if (!food) return { ...fail(400, "unknown food"), yard };
      const qty = clampInteger(payload.qty, 1, 9, 1);
      const cost = {
        treats: (food.cost.treats || 0) * qty,
        shinyTreats: (food.cost.shinyTreats || 0) * qty,
      };
      if (!spend(yard.currencies, cost)) return { ...fail(400, "not enough yard currency"), yard };
      incCount(yard.foodInventory, foodId, qty);
      return { ...ok({ foodId, qty }), yard };
    }
    case "yard.setFood": {
      const foodId = String(payload.foodId || "");
      const bowlId = String(payload.bowlId || "bowl-1");
      if (!YARD_FOODS[foodId]) return { ...fail(400, "unknown food"), yard };
      if (!yard.bowls.some((bowl) => bowl.id === bowlId)) return { ...fail(400, "unknown bowl"), yard };
      if (!setBowlFood(yard, bowlId, foodId, now)) return { ...fail(400, "food not owned"), yard };
      return { ...ok({ foodId, bowlId }), yard };
    }
    case "yard.buyGoodie": {
      const goodieId = String(payload.goodieId || "");
      const goodie = YARD_GOODIES[goodieId];
      if (!goodie) return { ...fail(400, "unknown goodie"), yard };
      if (!spend(yard.currencies, goodie.cost)) return { ...fail(400, "not enough yard currency"), yard };
      incCount(yard.goodieInventory, goodieId, 1);
      return { ...ok({ goodieId }), yard };
    }
    case "yard.placeGoodie": {
      const goodieId = String(payload.goodieId || "");
      const slotId = String(payload.slotId || "");
      const goodie = YARD_GOODIES[goodieId];
      if (!goodie) return { ...fail(400, "unknown goodie"), yard };
      if (!validSlotForGoodie(yard, slotId, goodie)) return { ...fail(400, "invalid slot"), yard };
      if (yard.placedGoodies.some((placed) => placed.slotId === slotId)) return { ...fail(400, "slot occupied"), yard };
      if ((yard.goodieInventory[goodieId] || 0) <= 0) return { ...fail(400, "goodie not owned"), yard };
      incCount(yard.goodieInventory, goodieId, -1);
      yard.placedGoodies.push({ slotId, goodieId, condition: "new", uses: 0, placedAt: now });
      return { ...ok({ goodieId, slotId }), yard };
    }
    case "yard.pickupGoodie": {
      const slotId = String(payload.slotId || "");
      const index = yard.placedGoodies.findIndex((placed) => placed.slotId === slotId || placed.goodieId === payload.goodieId);
      if (index < 0) return { ...fail(400, "goodie not placed"), yard };
      const placed = yard.placedGoodies[index];
      if (yard.activeVisitors.some((visit) => visit.slotId === placed.slotId)) return { ...fail(400, "visitor is using this goodie"), yard };
      yard.placedGoodies.splice(index, 1);
      incCount(yard.goodieInventory, placed.goodieId, 1);
      return { ...ok({ goodieId: placed.goodieId, slotId: placed.slotId }), yard };
    }
    case "yard.fixGoodie": {
      const slotId = String(payload.slotId || "");
      const placed = yard.placedGoodies.find((candidate) => candidate.slotId === slotId || candidate.goodieId === payload.goodieId);
      if (!placed) return { ...fail(400, "goodie not placed"), yard };
      if (placed.condition === "new") return { ...fail(400, "goodie is already fresh"), yard };
      const goodie = YARD_GOODIES[placed.goodieId];
      if (!spend(yard.currencies, goodie.fixCost)) return { ...fail(400, "not enough yard currency"), yard };
      placed.condition = "new";
      placed.uses = 0;
      return { ...ok({ goodieId: placed.goodieId, slotId: placed.slotId }), yard };
    }
    case "yard.collectGifts": {
      const collected = { treats: 0, shinyTreats: 0, gifts: yard.pendingGifts.length };
      for (const gift of yard.pendingGifts) {
        collected.treats += gift.treats || 0;
        collected.shinyTreats += gift.shinyTreats || 0;
      }
      addCurrencies(yard.currencies, collected);
      yard.pendingGifts = [];
      return { ...ok({ collected }), yard };
    }
    case "yard.capturePhoto": {
      const visitId = String(payload.visitId || "");
      const visitorId = String(payload.visitorId || "");
      const visit = yard.activeVisitors.find((candidate) => candidate.visitId === visitId || candidate.visitorId === visitorId);
      const fallbackVisitorId = visitorId && yard.petbook[visitorId] ? visitorId : null;
      const finalVisitorId = visit?.visitorId || fallbackVisitorId;
      if (!finalVisitorId || !YARD_VISITORS[finalVisitorId]) return { ...fail(400, "visitor not available"), yard };
      const photo = {
        id: makeYardId("photo", now, `${finalVisitorId}:${visit?.visitId || "portrait"}:${yard.album.photos.length}`),
        visitorId: finalVisitorId,
        goodieId: visit?.goodieId || null,
        pose: visit?.pose || "portrait",
        remodel: yard.remodel,
        capturedAt: now,
        caption: String(payload.caption || "").trim().slice(0, 48),
        favorite: false,
      };
      yard.album.photos.push(photo);
      if (yard.album.photos.length > MAX_ALBUM_PHOTOS) yard.album.photos = yard.album.photos.slice(-MAX_ALBUM_PHOTOS);
      return { ...ok({ photo }), yard };
    }
    case "yard.favoritePhoto": {
      const photoId = String(payload.photoId || "");
      const photo = yard.album.photos.find((candidate) => candidate.id === photoId);
      if (!photo) return { ...fail(400, "photo not found"), yard };
      for (const candidate of yard.album.photos) candidate.favorite = candidate.id === photoId;
      yard.album.favoritePhotoId = photoId;
      return { ...ok({ photoId }), yard };
    }
    case "yard.setRemodel": {
      const remodelId = String(payload.remodelId || "");
      const remodel = YARD_REMODELS[remodelId];
      if (!remodel) return { ...fail(400, "unknown remodel"), yard };
      if (!yard.ownedRemodels.includes(remodelId)) {
        if (!spend(yard.currencies, remodel.cost)) return { ...fail(400, "not enough yard currency"), yard };
        yard.ownedRemodels.push(remodelId);
      }
      yard.remodel = remodelId;
      returnInvalidPlacedGoodies(yard);
      return { ...ok({ remodelId }), yard };
    }
    case "yard.buyExpansion": {
      if (yard.expansion.level >= 2) return { ...fail(400, "yard already expanded"), yard };
      const expansion = YARD_EXPANSIONS[2];
      if (!spend(yard.currencies, expansion.cost)) return { ...fail(400, "not enough yard currency"), yard };
      yard.expansion.level = 2;
      yard.helper.unlocked = true;
      yard.bowls = normalizeBowls(yard.bowls, 2, now);
      return { ...ok({ expansionLevel: 2 }), yard };
    }
    case "yard.claimDailyLetter": {
      const date = new Date(now).toISOString().slice(0, 10);
      if (yard.dailyLetter.lastClaimedDate === date) return { ...fail(400, "daily letter already claimed"), yard };
      yard.dailyLetter.lastClaimedDate = date;
      yard.dailyLetter.stamps = (yard.dailyLetter.stamps || 0) + 1;
      const reward = { treats: 35, shinyTreats: yard.dailyLetter.stamps % 5 === 0 ? 1 : 0 };
      addCurrencies(yard.currencies, reward);
      if (yard.dailyLetter.stamps % 5 === 0) incCount(yard.foodInventory, "berry_plate", 1);
      return { ...ok({ reward, stamps: yard.dailyLetter.stamps }), yard };
    }
    case "yard.configureCompanion": {
      const name = String(payload.name || yard.companion.name || "Buddy").trim().slice(0, 16);
      if (!name) return { ...fail(400, "invalid companion name"), yard };
      const species = YARD_SPECIES.includes(payload.species) ? payload.species : yard.companion.species;
      yard.companion = {
        ...yard.companion,
        name,
        species,
        skinId: String(payload.skinId || yard.companion.skinId || species).slice(0, 40),
      };
      if (yard.helper.unlocked && typeof payload.helperAutoRefill === "boolean") {
        yard.helper.autoRefill = payload.helperAutoRefill;
      }
      if (YARD_FOODS[payload.preferredFoodId]) yard.helper.preferredFoodId = payload.preferredFoodId;
      return { ...ok({ companion: yard.companion, helper: yard.helper }), yard };
    }
    default:
      return { ...fail(400, "unknown yard action"), yard };
  }
}

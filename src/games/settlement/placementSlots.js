export const SETTLEMENT_CONSTRUCTION_SLOT_REGION_PREFIX = "settlementConstructionSlot.";

export const SETTLEMENT_CONSTRUCTION_PLACEMENT_SLOTS = [
  { id: "southwest-terrace", label: "Южная терраса", x: 760, y: 1458, scale: 0.46 },
  { id: "west-meadow", label: "Западный луг", x: 760, y: 920, scale: 0.42 },
  { id: "market-corner", label: "Торговый угол", x: 2075, y: 790, scale: 0.4 },
  { id: "river-bend", label: "Речной изгиб", x: 1720, y: 1425, scale: 0.4 },
];

function finiteNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function settlementConstructionSlotRegionId(slotId) {
  return `${SETTLEMENT_CONSTRUCTION_SLOT_REGION_PREFIX}${String(slotId || "").trim()}`;
}

export function getSettlementPlacementSlotLayout(slot, regions = {}) {
  const regionId = settlementConstructionSlotRegionId(slot.id);
  const region = regions?.[regionId] || {};
  return {
    ...slot,
    regionId,
    x: finiteNumber(region.x, slot.x),
    y: finiteNumber(region.y, slot.y),
    scale: finiteNumber(region.scale, slot.scale),
    visible: region.visible !== false,
  };
}

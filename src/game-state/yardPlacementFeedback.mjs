// Display-only projection. The durable outbox owns delivery, retry and receipts;
// the authoritative snapshot owns inventory, currency, reservations and actors.
const placementActions = new Set(['yard.placeGoodie', 'yard.moveGoodie']);
const unresolvedStatuses = new Set(['pending', 'sending', 'rollout-paused', 'canonical-blocked']);

export function selectPendingPlacementVisuals({accountId, placements = [], pendingActions = [], accepts = () => true}) {
  if (!accountId) return [];
  const seen = new Set();
  return pendingActions.flatMap(intent => {
    const p = intent?.payload;
    if (intent?.accountId !== accountId || !placementActions.has(intent.action)
      || !unresolvedStatuses.has(intent.status) || intent.requiresUserDecision || intent.requiresCanonicalReview
      || !intent.clientActionId || !p || typeof p.slotId !== 'string' || !p.slotId
      || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !accepts(intent) || seen.has(p.slotId)) return [];
    const existing = placements.find(row => row.slotId === p.slotId);
    const goodieId = p.goodieId || existing?.goodieId;
    if (typeof goodieId !== 'string' || !goodieId || (intent.action === 'yard.moveGoodie' && !existing)) return [];
    seen.add(p.slotId);
    return [{...existing, ...p, goodieId, condition: existing?.condition || 'new',
      placing: intent.action === 'yard.placeGoodie', valid: true,
      pendingActionId: intent.clientActionId, pendingStatus: intent.status}];
  });
}

export function mergePlacementVisuals(placements = [], pending = []) {
  const bySlot = new Map(pending.map(row => [row.slotId, row]));
  const rendered = placements.map(row => bySlot.get(row.slotId) || row);
  const existing = new Set(placements.map(row => row.slotId));
  return [...rendered, ...pending.filter(row => !existing.has(row.slotId))];
}

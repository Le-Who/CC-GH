const DURABLE_OUTBOX_ACTIONS = new Set([
  "yard.setFood",
  "yard.placeGoodie",
  "yard.pickupGoodie",
  "yard.fixGoodie",
  "yard.moveGoodie",
  "yard.collectGifts",
  "yard.claimDailyLetter",
  "yard.configureCompanion",
  "yard.setRemodel",
  "yard.buyExpansion",
  "yard.buyFood",
  "yard.buyGoodie",
  "yard.capturePhoto",
  "yard.favoritePhoto",
  "garden.sync",
  "garden.levelUp",
]);

function safePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function createClientActionId(action, scope = "game", parts = []) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  const suffix = [safePart(action), ...parts.map(safePart)].filter(Boolean).join(":");
  return `${safePart(scope) || "game"}:${Date.now().toString(36)}:${random}${suffix ? `:${suffix}` : ""}`;
}

export function shouldUseDurableOutbox(action) {
  return DURABLE_OUTBOX_ACTIONS.has(String(action || ""));
}

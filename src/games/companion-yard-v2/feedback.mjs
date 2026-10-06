/** Display translation only; persisted transport/domain codes stay unchanged. */
export const YARD_FEEDBACK_KEYS={
  "CANONICAL_INTERACTION_UNAVAILABLE": "yard.canonical.interaction.unavailable",
  "CANONICAL_ACTOR_OCCUPIED": "yard.persistent.placement.actor",
  "LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT": "yard.canonical.pending",
  "UNSUPPORTED_YARD_STORAGE_VERSION": "yard.canonical.pending",
  "CANONICAL_LOCATION_UNKNOWN": "yard.canonical.pending",
  "CANONICAL_LOCATION_VERSION_MISMATCH": "yard.canonical.pending",
  "CANONICAL_GEOMETRY_REVISION_MISMATCH": "yard.canonical.pending",
  "CANONICAL_ITEM_PLACEMENT_DISABLED": "yard.canonical.pending",
  "CANONICAL_ACTION_UNSUPPORTED": "yard.canonical.pending",
  "CANONICAL_LOCATION_REQUIRED": "yard.canonical.pending",
  "CANONICAL_NONCE_REQUIRED": "yard.canonical.pending",
  "CANONICAL_PLACEMENT_INVALID": "yard.persistent.error.placement",
  "CANONICAL_LOCATION_CAPACITY_REACHED": "yard.persistent.placement.overlap",
  "CANONICAL_GOODIE_NOT_OWNED": "yard.persistent.placement.unsupported",
  "YARD_ROLLOUT_PAUSED": "yard.persistent.error.save",
  "YARD_SCENE_FAILED": "yard.persistent.error.scene",
  "YARD_BINDING_REQUIRED": "yard.persistent.error.binding",
  "YARD_STATE_REQUIRES_REVIEW": "yard.persistent.error.save",
  "visitor is using this goodie": "yard.persistent.error.occupied",
  "placement intersects reserved visit path": "yard.persistent.error.route",
  "invalid placement": "yard.persistent.error.placement",
  "not enough yard currency": "yard.persistent.error.currency",
  "food not owned": "yard.persistent.error.food",
  "daily letter already claimed": "yard.persistent.error.letter"
};
export function yardFeedbackText(message,t){const key=Object.hasOwn(YARD_FEEDBACK_KEYS,message)?YARD_FEEDBACK_KEYS[message]:null;return key?t(key):message;}

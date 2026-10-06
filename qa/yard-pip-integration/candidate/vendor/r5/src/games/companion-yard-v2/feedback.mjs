/** Display translation only; persisted transport/domain codes stay unchanged. */
export const YARD_FEEDBACK_KEYS={
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

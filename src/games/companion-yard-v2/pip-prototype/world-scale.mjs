/** Pip-only world-scale candidate. The shared backdrop/prop render unit stays fixed. */
export const RENDER_UNITS_TO_CANONICAL = 12;
export const CANONICAL_PER_SCENE_UNIT = 8;
export const PIP_SOURCE_TO_CANONICAL = 16;
export function assertWorldScale(setup, descriptor) {
 if (setup.actor.unitsPerSource !== PIP_SOURCE_TO_CANONICAL || descriptor.sourceToCanonical !== PIP_SOURCE_TO_CANONICAL || descriptor.renderUnitsToCanonical !== RENDER_UNITS_TO_CANONICAL || descriptor.canonicalPerSceneUnit !== CANONICAL_PER_SCENE_UNIT) throw Error('Mismatched experimental Pip world scale');
 return {sourceToCanonical:PIP_SOURCE_TO_CANONICAL, modelScale:PIP_SOURCE_TO_CANONICAL/RENDER_UNITS_TO_CANONICAL, approval:descriptor.scaleApproval};
}

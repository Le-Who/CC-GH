/** A preview build and an explicit per-page opt-in are both required.
 * This controls visual tooling only; it never changes release/save contracts. */
export function isPipPreviewAllowed({ enabled = false, search = '' } = {}) {
  const values = new URLSearchParams(search).getAll('yardPipPreview');
  return enabled === true && values.length === 1 && values[0] === '1';
}

// The inactive candidate is available only inside the already explicit preview.
export const PIP_GROUNDING_PREVIEW_RECIPE = 'pip-garden-grounding-v1';
export function pipPreviewGroundingRecipe(options = {}) {
  if (!isPipPreviewAllowed(options)) return 'baseline';
  const values = new URLSearchParams(options.search ?? '').getAll('yardPipGrounding');
  return values.length === 1 && values[0] === PIP_GROUNDING_PREVIEW_RECIPE ? PIP_GROUNDING_PREVIEW_RECIPE : 'baseline';
}

/** Private display gate only. It cannot grant a server capability. */
export function isCanonicalFoodPreviewAllowed(options={}) {
 const values=new URLSearchParams(options.search??'').getAll('yardCanonicalFood');
 return isPipPreviewAllowed(options)&&values.length===1&&values[0]==='1';
}

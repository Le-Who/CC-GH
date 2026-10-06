/** A preview build and an explicit per-page opt-in are both required.
 * This controls visual tooling only; it never changes release/save contracts. */
export function isPipPreviewAllowed({ enabled = false, search = '' } = {}) {
  const values = new URLSearchParams(search).getAll('yardPipPreview');
  return enabled === true && values.length === 1 && values[0] === '1';
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { isPipPreviewAllowed } from '../src/games/companion-yard-v2/pip-preview-gate.mjs';
test('preview requires a preview build and an exact, unambiguous per-page opt-in', () => {
  assert.equal(isPipPreviewAllowed(), false);
  for (const search of ['', '?yardPipPreview=true', '?yardPipPreview=0', '?yardPipPreview=1&yardPipPreview=0']) {
    assert.equal(isPipPreviewAllowed({ enabled: true, search }), false);
  }
  assert.equal(isPipPreviewAllowed({ enabled: false, search: '?yardPipPreview=1' }), false);
  assert.equal(isPipPreviewAllowed({ enabled: 'true', search: '?yardPipPreview=1' }), false);
  assert.equal(isPipPreviewAllowed({ enabled: true, search: '?yardPipPreview=1' }), true);
});

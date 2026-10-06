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

import {pipPreviewGroundingRecipe,PIP_GROUNDING_PREVIEW_RECIPE} from '../src/games/companion-yard-v2/pip-preview-gate.mjs';
test('warm grounding needs both existing preview gates and one exact recipe selector; baseline stays default',()=>{
 const key='yardPipGrounding='+PIP_GROUNDING_PREVIEW_RECIPE, valid='?yardPipPreview=1&'+key;
 assert.equal(pipPreviewGroundingRecipe(),'baseline');assert.equal(pipPreviewGroundingRecipe({enabled:true,search:'?yardPipPreview=1'}),'baseline');
 assert.equal(pipPreviewGroundingRecipe({enabled:false,search:valid}),'baseline');assert.equal(pipPreviewGroundingRecipe({enabled:'true',search:valid}),'baseline');assert.equal(pipPreviewGroundingRecipe({enabled:true,search:'?'+key}),'baseline');
 for(const search of ['?yardPipPreview=1&yardPipGrounding=1','?yardPipPreview=1&yardPipGrounding=unknown',valid+'&'+key,valid+'&yardPipPreview=0'])assert.equal(pipPreviewGroundingRecipe({enabled:true,search}),'baseline');
 assert.equal(pipPreviewGroundingRecipe({enabled:true,search:valid}),PIP_GROUNDING_PREVIEW_RECIPE);
 assert.equal(pipPreviewGroundingRecipe({enabled:true,search:'?yardPipPreview=1&yardPipGrounding=baseline'}),'baseline');
});

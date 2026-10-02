import { normalizeGardenFixture } from './fixture-ids.js';
import { normalizeChromeMode } from './chrome.js';
export { VIEWPORTS, viewportLabel } from '../shared/viewports.js';
import { VIEWPORTS } from '../shared/viewports.js';
export function readPreviewSettings(search = '') {
  const params = new URLSearchParams(search);
  return {
    language: params.get('lang') === 'ru' ? 'ru' : 'en',
    fixture: normalizeGardenFixture(params.get('fixture')),
    viewport: VIEWPORTS.some(item => item.id === params.get('viewport')) ? params.get('viewport') : 'available',
    controlsVisible: params.get('controls') !== 'hidden',
    forceError: params.get('forceError') === '1',
    chrome: normalizeChromeMode(params.get('chrome')),
  };
}
export function gameQuery(settings) {
  return new URLSearchParams({ tab: 'garden', fixture: normalizeGardenFixture(settings.fixture), lang: settings.language === 'ru' ? 'ru' : 'en', ...(settings.forceError ? { forceError: '1' } : {}) });
}

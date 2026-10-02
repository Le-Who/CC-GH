import { normalizeChromeMode } from '../shared/chrome.js';
import { VIEWPORTS } from '../shared/viewports.js';
export { VIEWPORTS, viewportLabel } from '../shared/viewports.js';
export function readPreviewSettings(search = '') {
  const params = new URLSearchParams(search);
  return {
    language: params.get('lang') === 'ru' ? 'ru' : 'en',
    fixture: ['starter','progress','long-text','retry-start','uncertain-answer'].includes(params.get('fixture')) ? params.get('fixture') : 'progress',
    viewport: VIEWPORTS.some(item => item.id === params.get('viewport')) ? params.get('viewport') : 'available',
    controlsVisible: params.get('controls') !== 'hidden',
    chrome: normalizeChromeMode(params.get('chrome')),
  };
}
export function gameQuery(settings) {
  return new URLSearchParams({ tab: 'trivia', fixture: settings.fixture, lang: settings.language });
}

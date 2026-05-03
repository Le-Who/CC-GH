export type GardenLanguage = 'en' | 'ru';

export const GARDEN_LANGUAGE_STORAGE_KEY = 'garden_shelf_language';
export const GARDEN_LANGUAGE_EVENT = 'garden-shelf-language-change';

export function getStoredGardenLanguage(): GardenLanguage {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(GARDEN_LANGUAGE_STORAGE_KEY) === 'ru' ? 'ru' : 'en';
}

export function setStoredGardenLanguage(language: GardenLanguage) {
  window.localStorage.setItem(GARDEN_LANGUAGE_STORAGE_KEY, language);
}

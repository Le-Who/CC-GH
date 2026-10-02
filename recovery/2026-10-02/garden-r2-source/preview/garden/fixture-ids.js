export const GARDEN_FIXTURE_IDS = Object.freeze(['empty', 'progress', 'full', 'inventory', 'level-ready', 'poor']);
export const normalizeGardenFixture = fixture => GARDEN_FIXTURE_IDS.includes(fixture) ? fixture : 'progress';

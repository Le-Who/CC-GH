import { applyAction, buildSnapshot } from 'virtual:offline-player-core';
import { createGardenPreviewBackend } from './backend.js';
import { readPreviewSettings } from './settings.js';
const settings = readPreviewSettings(typeof window === 'undefined' ? '' : window.location.search);
const backend = createGardenPreviewBackend({ applyAction, buildSnapshot, fixture: settings.fixture, forceError: settings.forceError });
export const api = (path, body) => backend.request(path, body);
export const getPublicConfig = () => api('/api/config');
export async function getAuthHeader() { return ''; }
export function createBatcher() { return api; }

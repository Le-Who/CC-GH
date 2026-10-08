import {defineConfig} from '@playwright/test';
import path from 'node:path';
import baseline from './playwright.yard-saved-visit-real.config.mjs';
export default defineConfig({...baseline,testDir:'./tests/yard-saved-pickup-e2e',globalTimeout:420000,
 reporter:[['line'],['json',{outputFile:'test-results/saved-pickup-browser/results.json'}]],
 outputDir:'test-results/saved-pickup-browser/work',
 webServer:{...baseline.webServer,env:{...baseline.webServer.env,NODE_OPTIONS:`--import=${path.resolve('tests/fixtures/register-real-backend-item-runtime.mjs')}`}}});

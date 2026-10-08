import {defineConfig} from '@playwright/test';
import base from './playwright.pip.config.js';
export default defineConfig({...base,testMatch:'mika-p2.spec.js',timeout:120000,globalTimeout:300000,workers:1,retries:0,
 outputDir:'test-results-mika-p2/artifacts',reporter:[['list'],['json',{outputFile:'test-results-mika-p2/results.json'}]],
 webServer:{...base.webServer,command:'node scripts/prepare-mika-p2-qa.mjs && node scripts/yard-pip-ci-server.mjs'}});

import path from 'node:path';
import {defineConfig} from '@playwright/test';
import {CAPS,assertDevelopmentEnvironment} from './tests/helpers/yard-development-acceptance.mjs';
assertDevelopmentEnvironment();
export default defineConfig({testDir:'./tests/yard-development-e2e',testMatch:'development.spec.mjs',workers:1,fullyParallel:false,retries:0,maxFailures:1,forbidOnly:true,timeout:70000,globalTimeout:CAPS.browserMs,expect:{timeout:5000},outputDir:path.resolve('test-results/yard-development-work/browser-work'),reporter:[['line'],['json',{outputFile:'test-results/yard-development/playwright.json'}]],use:{browserName:'chromium',actionTimeout:5000,navigationTimeout:10000,trace:'off',video:'off',screenshot:'off',serviceWorkers:'allow'}});

import path from 'node:path';
import {defineConfig} from '@playwright/test';
import {CAPS,assertDevelopmentEnvironment} from './image-helpers.mjs';
assertDevelopmentEnvironment();
export default defineConfig({testDir:'.',testMatch:['development.spec.mjs','bentoku.spec.mjs'],workers:1,fullyParallel:false,retries:0,maxFailures:1,forbidOnly:true,timeout:70000,globalTimeout:CAPS.browserMs,expect:{timeout:5000},outputDir:path.resolve('test-results/yard-development-work/browser-work'),reporter:[['line'],['json',{outputFile:path.resolve('test-results/yard-development/playwright.json')}]],use:{browserName:'chromium',actionTimeout:5000,navigationTimeout:10000,trace:'off',video:'off',screenshot:'off',serviceWorkers:'allow'}});

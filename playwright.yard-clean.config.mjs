import base from './playwright.mika-normal-qa.config.mjs';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'yard-clean-normal.spec.js',
 reporter:[['line'],['json',{outputFile:'test-results/yard-clean/results.json'}]],
 outputDir:'test-results/yard-clean/work'});

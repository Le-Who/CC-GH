// Reuse the qualified batch's server, flags, auth and lifecycle unchanged.
import base from './playwright.development-batch.config.mjs';
export default {...base,
 testMatch:['**/tests/e2e/match3-motion.spec.js','**/tests/leaderboard-privacy-e2e/*.spec.mjs'],
 reporter:[['line'],['json',{outputFile:'test-results/development-batch/match3-combined.json'}]],
 outputDir:'test-results/development-batch/match3-combined-work'};

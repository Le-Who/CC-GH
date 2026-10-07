import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig({testDir:'.',testMatch:'*.spec.mjs',workers:1,retries:0,timeout:45000,reporter:[['list'],['json',{outputFile:root+'test-results/garden-tap-layout/results.json'}]],outputDir:root+'test-results/garden-tap-layout/browser',use:{baseURL:'http://127.0.0.1:3187',screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--enable-unsafe-swiftshader']}},webServer:{cwd:root,stdout:'pipe',stderr:'pipe',command:'pnpm exec vite --host 127.0.0.1 --port 3187',url:'http://127.0.0.1:3187',reuseExistingServer:false,timeout:90000}});

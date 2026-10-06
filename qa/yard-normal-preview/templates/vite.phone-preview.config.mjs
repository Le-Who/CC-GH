import path from 'node:path';
import normal from './vite.config.js';
const normalChunks=normal.build.rollupOptions.output.manualChunks;
function previewChunks(id) {
 const source=path.relative(import.meta.dirname,id.split('?')[0]).replaceAll('\\','/');
 // A single-game entry has no other lazy route to own these shared helpers.
 // Keep their executable bytes out of the React entry to avoid init cycles.
 if(id.includes('commonjsHelpers.js'))return 'preview-vendor-support';
 if(['game-logic/yard-catalog.js','game-logic/yard-playzones.js'].includes(source))return 'yard-runtime-core';
 return normalChunks(id);
}

// This separate output uses the exact normal source and Yard media/data/chunk
// plugins. No service worker is published on a disposable read-only origin.
export default {
 ...normal,
 plugins:normal.plugins.flat(Infinity).filter(plugin=>!plugin?.name?.startsWith('vite-plugin-pwa')),
 publicDir:'preview-public',
 build:{...normal.build,outDir:'preview-dist',rollupOptions:{...normal.build.rollupOptions,input:path.resolve(import.meta.dirname,'index.html'),output:{...normal.build.rollupOptions.output,manualChunks:previewChunks}}},
};

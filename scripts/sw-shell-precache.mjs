import path from 'node:path';

// Rollup's static import graph describes the boot shell. dynamicImports belong
// to game entry points and must stay lazy even when a service worker installs.
export function collectInitialShellFiles(bundle) {
  const files = new Set();
  function visit(name) {
    if (files.has(name) || !bundle[name]) return;
    files.add(name);
    const output = bundle[name];
    if (output.type === 'chunk') {
      for (const imported of output.imports || []) visit(imported);
      for (const css of output.viteMetadata?.importedCss || []) visit(css);
      for (const asset of output.viteMetadata?.importedAssets || []) visit(asset);
    } else if (name.endsWith('.css')) {
      const source = typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString('utf8');
      for (const match of source.matchAll(/url\(\s*["']?([^"'\s)]+)["']?\s*\)/g)) {
        const ref = match[1];
        if (/^(?:data:|https?:|\/\/|#)/i.test(ref)) continue;
        const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
        visit(clean.startsWith('/') ? clean.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(name), clean)));
      }
    }
  }
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk' && output.isEntry) visit(output.fileName);
  }
  return files;
}

export function createShellPrecache() {
  let shellFiles = null;
  return {
    plugin: {
      name: 'initial-shell-precache',
      enforce: 'post',
      generateBundle(_options, bundle) {
        shellFiles = collectInitialShellFiles(bundle);
      },
    },
    async manifestTransform(entries) {
      if (!shellFiles?.size) throw new Error('Cannot determine the initial shell precache graph');
      return {
        manifest: entries.filter(entry => shellFiles.has(entry.url.replace(/^\//, '')) || entry.url === 'manifest.webmanifest'),
        warnings: [],
      };
    },
  };
}

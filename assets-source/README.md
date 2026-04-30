# Asset Source Files

This folder stores editable source art, upstream raw exports, and provenance files that should not be served directly to browsers.

Runtime assets live under `public/` or generated `public/assets-runtime/`. The build pipeline reads committed runtime/source inputs and writes content-hashed optimized files into `public/assets-runtime/`.

Do not reference files from this folder in React, Pixi, CSS, or public manifests.

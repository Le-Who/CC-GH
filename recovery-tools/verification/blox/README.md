# Blox v2 recovery verification

Copy this directory to `recovery-tools/verification/blox` in the candidate repository. It needs no npm dependencies and uses Node's bundled Acorn through the existing `recovery-tools/ast-recovery.cjs`.

Run from repository root:

```
node --test recovery-tools/verification/blox/verify-blox.cjs recovery-tools/verification/blox/scene-verification.cjs
```

If stored elsewhere, set `CC_GH_SOURCE_ROOT` to the repository root. Optional `CC_GH_EVIDENCE_DIR` writes a fresh asset-integrity JSON to an existing directory. Otherwise the tests are read-only.

The 14 Node checks cover exact recovered declaration ASTs, independent baseline/preview/controller action traces, economy and placement parity, preserved production domain files, asset bytes/dimensions, safe-area ownership, recovered imports and error-boundary class, composition geometry, full-cell Pixi hit regions, and pointer/cancel/teardown behavior. The reusable mock does not implement a WebGL renderer, browser CSS, text layout, real focus handling, or browser image decoding.

`fixtures/provenance.json` records full owned bundle hashes, exact declaration-slice fixture hashes, and baseline commit `47519ad79796f4b3dfefd2a5f1bfb73cb08a6e86`. Fixture logic is copied verbatim from owned compiled source or the production baseline. Asset bytes are compared to captured SHA-256 hashes from the owned PNG files; the full preview and baseline working directories are not needed.

Full production build, browser visual QA, Playwright matrix, real touch, focus, and exit/re-entry renderer tests remain required and were not run during this verification.

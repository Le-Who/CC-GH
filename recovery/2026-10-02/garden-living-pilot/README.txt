Garden Shelf living-plant presentation source checkpoint.
Three pilot species: daisy, monstera and fern. Runtime art is distributed separately with the preview archive.
This is a partial recovery checkpoint, not integrated production code or a full repository build.
18 Node tests cover motion math, presentation contracts and a mocked rendering surface. Actual GPU/browser visual acceptance is not implied.
Run: node --test tests/*.test.mjs
The module is presentation-only; gameplay, economy and persistence remain owned by the existing Garden implementation.

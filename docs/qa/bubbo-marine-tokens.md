# Bubbo marine tokens

The five ordinary color tokens now use underwater motifs in the same glossy circular family: mint starfish, amber pufferfish, coral scallop, sky pearl and berry nautilus. These motif choices implement the requested marine direction; they are not new gameplay types.

The engine still stores `mint`, `amber`, `coral`, `sky` and `berry`. All five existing `/games/bubbo-v2/*.webp` token paths are replaced in place, so the same art appears on the board, pending row, current/next shot, flying projectile and dropped-token effects. Cannon, powerups, background and UI art are unchanged. The shared Canvas2D geometry, collisions, trajectory, pressure/timed rules, rewards, saves and scoped Telegram swipe lifecycle are unchanged.

## Source and export

Five separate originals were created with the built-in image tool from the existing reviewed color-token references. The original 1254×1254 transparent RGBA PNGs, exact prompts, 320px RGBA exports and hashes are retained under `assets-source/imagegen/bubbo-marine/`. No sprite-sheet cropping or substitute vector art is used.

The runtime export uses premultiplied-alpha Lanczos to 312×312, centered with four transparent pixels on a 320×320 canvas. This is an explicit resize of the source master. Lossless WebP encoding preserves every decoded RGBA byte of that 320px export, including transparent edge pixels; it is not claimed lossless against the larger source master. Encoding uses `lossless=True`, `exact=True`, `method=6`, `quality=100` after comparing five lossless effort settings.

The five runtime files total 473,056 bytes versus 448,658 bytes previously (+24,398 bytes, +5.44%). Their PNG exports total 687,047 bytes, so the WebPs save 213,991 bytes (31.15%) against the equivalent RGBA PNGs. All five are 320×320, keeping decoded pixel allocation unchanged. The retained originals and PNG checkpoints are outside the public runtime.

`prepare_runtime.py prepare-input.json <new-isolated-output>` reproduces the WebP stage using an existing Pillow installation. It validates all five IDs, individual sources, expected hashes, dimensions, alpha borders, color profiles and exact RGBA round trips before creating outputs. It never overwrites an existing output directory or updates production paths itself.

## Visual checks

The real geometry renders compact-landscape board tokens near 22 CSS px, next-shot tokens at a 22px minimum, and the 320px portrait board near 26px. `token-size-review.png` shows the generated art at 160, 64, 26 and 22 pixels, plus a clearly labeled enlarged view of the 22px raster. Source review found the star arms, puffer face/spines, scallop ribs, pearl cup and shell spiral distinguishable at these scales. This artifact is explicitly source-art inspection, not a browser screenshot or final device acceptance.

The existing 12-case viewport matrix and Telegram gestures suite remain required. Three focused browser cases additionally verify the five actually served asset hashes, real Canvas2D token draw calls, field screenshots before/after one shot, and ordinary Pause behavior at 320×568, 390×844 and 568×320, with touch and DPR2. The tests emit actual PNGs for visual review; no synthetic image substitutes for those results.

## Verification status

48 targeted Node checks pass, covering the original engine, 15,840 deterministic aim/collision comparisons, controller behavior, native swipe ownership and exact asset/source hashes. Eight asset-preparation checks pass, including transparent RGB preservation and failure before output on bad inputs. The replacement WebPs compare equal across 2,048,000 decoded RGBA bytes, with zero changed bytes.

The new browser cases are authored and syntax-checked but have not run in the preparation environment. Full build, integrated browser images and physical Telegram confirmation remain pending. Existing hit/drop reactions are retained; no new token abilities or animation rules were introduced.

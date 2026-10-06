# Garden-aligned raster candidate

This source correction replaces the actor-following 192×192 raster with one
390×648 reference raster covering the calibrated garden. Its camera, frustum,
world sampling lattice and shared depth buffer are independent of actor routes,
headings, prop placement and selection. It is not a camera freeze for one clip.

The camera retains direction `(5.66, 9.799775507632814, 8)`, the original 45°
elevation, canonical XYZ conversion and source density. Its asymmetric frustum
puts the calibrated world origin at its original artwork pixel. The artwork's
height is 647.7287 reference pixels; the raster includes its fractional last row.
CSS uniformly scales/crops the raster together with the artwork. Ordinary
resize/orientation/crop changes allocate no new WebGL buffer and do not alter
the world-to-raster matrices. At reference size this is DPR1, including on DPR2
devices; source density and antialiasing have not been raised to disguise jitter.

## Explicit allocations and caps

- Reference backing: 390×648 = 252,720 pixels; color 1,010,880 B and estimated
  depth/stencil 1,010,880 B. No antialiasing, shadow map or new texture.
- Worst old+new color/depth: 4,043,520 B; old+new compositor estimate: 2,021,760 B.
  Both generations are reserved even though normal layout keeps one raster.
- Geometry arrays: 4,028,272 B; one bone texture: 1,024 B. Worst renderer GPU
  estimate: 10,094,576 B, below the unchanged 12,582,912 B cap.
- Model CPU peak plus encoded background: 15,111,712 B; including the estimated
  bone texture CPU backing: 15,112,736 B, below the unchanged 16,777,216 B cap.
- The scene's 64 MiB owned RGBA ledger now additionally charges 4,043,520 B for
  old+new direct color and compositor surfaces. Depth belongs to the separate
  GPU estimate and is not RGBA. The UI lifetime reserve including the T2
  thumbnail is 24,103,404 B. Worst full-viewport 1280×720 DPR2 current+pending
  background canvases total 63,927,596 B including decoded background and this
  direct reserve, below 67,108,864 B. Larger owners still fail admission.
- The vendored-engine 800,000 B raw / 210,000 B gzip caps are unchanged.

These are explicit/estimated allocation contracts, not browser RSS or measured
physical GPU totals. Driver objects, shader programs, swap-buffer count, decoder
scratch and physical release timing remain unknown. Filling 252,720 pixels
instead of 36,864 increases potential fill work by 6.86×; performance requires
native measurement. Existing geometry, source art, coat, contacts and lighting
are unchanged.

## Bounded prop instances

`setCanonicalPlacements(records, {ghost, selectedSlotId})` accepts up to two
unique committed `slotId` records and one optional ghost, each with finite
canonical `x`/`y`. All three transform trees share the same T2 geometries,
attribute arrays, materials and contact-lobe resources; the known buffer delta
is zero. The extra Object3D overhead is unmeasured. At most 18 prop draw
primitives are possible, including the three contact lobes.

A move ghost hides the matching committed root while retaining the other
committed root. Clearing the ghost restores the unchanged committed placement;
committing supplies updated authoritative rows. A placement ghost with a new
slot can coexist with the two committed roots, so the third root is charged and
bounded explicitly. Invalid batches are rejected before any root changes.
Selection affects diagnostics only. Ghost materials are shared and opaque:
the item UI must communicate validity without fading the entire canvas.

The item UI owner must replace first-row drawing with this API and remove
whole-surface ghost alpha. The renderer API alone does not implement authoritative
two-item inventory, selection, collision admission or route planning.

## CPU evidence and remaining acceptance

`yard-pip-world-raster.test.mjs` parses the real pinned GLBs and uses actual Three
camera, skeleton and mesh calculations with a renderer test double. It checks:

- 150 inspection/approach/route/heading samples: all 3,244 T2 vertices have zero
  raster-coordinate excursion while the actor moves. Ideal projection error is
  below 3×10⁻¹³ px; calibrated paw contacts remain equal to the motion sample.
- Actual actor and prop mesh coverage, legal prop extremes, nine viewport sizes,
  arbitrary renderer headings, CSS transforms and immutable camera matrices.
- Paused resize, context loss/restoration, resource release, admission failures
  and no drawing-buffer resize during layout changes.
- Two committed props and one ghost: exact shared buffer/material identities,
  unchanged other-item sampling, cancel/commit behavior and disposal once.

The preview aggregate includes this test. This is not proof of stable browser
edge pixels. The next bounded browser check arranged by the coordinator must record the same actual
approach/sniff/settle sequence at native size, measure planter luminance edges
against the delivered before clip (0.9333 px approach excursion), and inspect
contacts, clipping, shared depth, both committed items and frame performance.
Include device-scale capture and preserve camera matrices, CSS rectangle,
backing dimensions and timestamps. Do not accept world-coordinate constancy as
a substitute for measured pixel stability.

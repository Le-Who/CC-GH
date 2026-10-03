# Opt-in authored root route adapter

These two modules are an inactive continuation of `authored-stride.mjs`.
They register no actor, binding, preflight, or production renderer.

`createAuthoredRouteAdapter` requires matching explicit stride and ground
contracts. It reuses cardinal graph topology with a candidate's own stride,
cycle and turn durations. It never calls the graph module's distance-driven
sampler. Pose, root, and turn yaw are sampled from one source row.

An outgoing partial join must name an exact rendered source-frame time.
The canonical runway length is `stride - authoredRootAtStart`, not a fraction
of nominal stride. This may be negative during source settling overshoot.
Partial incoming joins and unsupported entry facings fail closed. The current
interaction convention is +X; this is explicit rather than a hidden fallback.

`createAuthoredMotionGround` compiles the actor's own sole polygons and exact
saved-frame full-body bounds. It supplements sole/ground validation with
conservative XY body boxes against static obstacles. Half-open timed occupancy
reservations are checked against the complete returned route. It has no
unscoped target-prop exemption and is intentionally conservative about vertical
clearance. All contracts and returned plans are defensively copied/frozen.

The Mochi fixture uses catalog ID `mochi_bunny`. It remains `playbackReady:false`.
Before actual admission, a matching prop interaction/rest binding, source-aware
approach/departure calibration, exact render composition and browser/mobile QA
are still required. Existing Mika helpers, coordinates, fixtures and numerical
outputs are unchanged.

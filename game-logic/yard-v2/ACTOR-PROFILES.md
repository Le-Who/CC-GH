# Actor profile compatibility

Only Mika is registered and ready. `actor-profiles.mjs` is a small immutable
descriptor module; `media/mika-actor-assets.mjs` holds the existing frozen source
descriptors. These are compatibility inputs, not new animation or art approval.

New admissions add `mediaAdmission.actorProfile = {id: "mika", revision:
"mika-actor/r1"}`. The public visit adds `resolvedActorProfile` only after the
profile, visitor, binding revision, calibration, ground revision and phase
readiness checks all pass. The client must also validate its local render binding.
The existing media registry, asset bytes and manifest revision are unchanged.

Old records are never backfilled. Only the known Mika mouse/cushion binding and
visitor combination can resolve an absent profile reference. An explicit unknown
or malformed reference cannot fall back. Per-binding calibration remains pinned;
records without it retain exact whole-registry fallback. Failed compatibility
preserves plans, timestamps, reservations, prop commits and economic completion.

`routeProgram` and `sampleRoute` accept `actorProfile` in their options;
`sampleStay(plan, time, identity, {actorProfile})` and
`propTransformAt(plan, clip, time, {actorProfile})` use the same resolved profile.
Mika defaults preserve the previous public helper API and numerical outputs.
`buildStaySchedule(candidate, plan, clip, groundRest, {actorProfile})` selects the
interaction's explicit rest mode and loop. New actor support requires its own
calibrated assets, preflight and registry binding, not just a reference.

Ground polygon caches include contract identity, actor ID/revision, footprint
revision and calibration. Placement readiness is actor-scoped; unknown actors
return unavailable and cannot reuse Mika's cached result. The present factory
still implements only Mika's actual interactions and cannot admit Mochi.

The pure economy suite alone uses the trusted server option
`allowUnprofiledTestBindings`. It is never selected from HTTP or action payloads,
and does not produce render-compatible actors. Mathematical fixture profiles are
unregistered and explicitly not ready.

`tests/fixtures/yard-actor-r3/golden.json` is a fixed r3 output fixture with source
hashes. Tests compare six complete plans, dense route/stay samples and real
serialized admission/completion/claim states. Runtime tests need no external r3
directory. Existing physics and economic timing remain authoritative; renderer
cache changes and browser validation belong to the separate client work.

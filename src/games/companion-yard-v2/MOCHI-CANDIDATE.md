# Inactive Mochi presentation adapter

`createMochiCandidatePresenter` is the opt-in adapter used by the isolated
browser fixture. It validates the combined rig identity, four authored-root
hops, twelve turns, camera/pivot/scale, source row timing and atlas coverage.
It never registers an actor and cannot make production media playback-ready.

The candidate geometry binding still owns the complete server-time plan. A
renderer asks the presenter for `requests(plan, at)` and merges its required
and lookahead rows with every other actor before one shared `atlas.prepare()`.
The presenter does not take over the cache or impose a second independent
budget. `compose(plan, at, props, atlas)` checks the exact decoded source frame
before giving its target prop to the combined sprite. The returned `anchor`
is the frozen composite origin inside the clip and the sampled authored root
outside. These are different spaces and must not be interchanged.

If `requiresCoherentFrameHold` is true, preserve the last whole rendered
canvas. Do not clear the canvas, hide the target, substitute a stale sprite or
draw only unrelated layers. A target placement, condition or ownership change
requires a fresh authoritative plan; the old plan cannot continue. Other props
are copied through unchanged. The adapter performs no prop commit, save write,
reward calculation or time stretching.

The browser fixture maps its short source-time scrubber into the full native
45-minute schedule, omitting only repeated rest cycles from the preview. The
adapter accepts authoritative timestamps and does not implement that shortcut.

## Remaining integration gates

- Corrected dedicated browser checks and visual review, including entry/exit,
  resize and interrupted decoding
- Production actor-profile and manifest registration with independent review
- Server admission, snapshot/reload and actual shared-scene integration
- Multi-actor exclusive-region, cache and depth ordering validation
- Production placement calibration and prop-state coverage

None of these gates is satisfied simply by constructing this adapter. Mika's
registry, assets, timing and production canvas code are unchanged.

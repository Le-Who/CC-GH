# Authored non-uniform stride primitive

This is an inactive, opt-in primitive. No registered actor, Mika route, visit
admission, food, inventory, economic rule, shared player record or renderer is
changed. Mochi still has no ready actor profile or runtime binding.

`createAuthoredStrideSampler` owns a defensive frozen copy of an explicit source
contract. The contract has a whole-cycle duration, a measured forward stride,
ordered rendered-frame rows, a dense time/root table and a declared root extent.
It rejects incoherent pose/root data and an extent that fails to cover the source.

The sample contains two distances with different roles:

- `distanceWorld` belongs to exactly the returned rendered frame. Use them
  together. This is the only root location coherent with those baked pixels.
- `continuousDistanceWorld` is a diagnostic cursor from the dense source table.
  It must not position a stepped sprite.

The Mochi study has small signed anticipation and settle offsets. Forward root
distance is therefore not a one-to-one clock. Sampling by `phase * stride`,
assuming monotonic motion, inverse-distance lookup, or clamping every source row
to the stride interval would change the authored motion and its planted supports.
Multiple cycles add whole source strides and return the canonical frame at exact
cycle boundaries. A bounded final endpoint uses the same canonical stance.

The frozen test fixture identifies its Blender rig, source pose and approved
style hashes. Its contact and endpoint evidence is source provenance, not runtime
approval. Before registering an actor, it still needs all required facings,
turns, transition/rest/interaction coverage, a source-root-aware route and swept
ground/envelope guard, atlas/media packing, browser/mobile QA and admission tests.
Mika's existing linear source-distance contract and golden plans are untouched.

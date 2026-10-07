# Art acceptance

## Production source and runtime export

Aim for beautiful, non-sterile art compatible with the approved painted background. Polished painted/hand-painted work is allowed; rough sketches, placeholder-looking assets, SVG-like/outline-only substitutes, simple programmatic shapes, and screenshot crops do not meet the production gate. Vector drawings, layout boards, and simple shapes may support planning, masks, or fixtures.

Generated runtime HUD/UI art, surfaces, skins, icons, buttons, and game UI assets use a production-quality image-generation or source-art pipeline, exported into clean runtime files. Optimized PNG/WebP and runtime atlases are allowed when source art meets that gate.

When separate generated assets are requested, create a separate source file for each. Do not generate a shared sheet and crop final assets out of it: neighboring objects and inconsistent resolution undermine isolation. Packing independently approved sources into a runtime atlas is different and remains allowed.

Runtime art is data-free: counters, numbers, labels, localized text, filled progress, selection, and gameplay state are rendered in code. Chromakey backgrounds use a color absent from the object; verify tight extraction mechanically, not by cutting a screenshot.

For food assets, verify first-glance food identity on an actual phone at gameplay scale. Match the approved reference: juicy, readable, and visually coherent with the painted background. This criterion does not approve a new character/model or replace existing model acceptance.

## Models, animation, and evidence

Preserve approved Pip R1 proportions. Deliver editable sources, licenses, exact files, several frames at gameplay scale, and a short real animation. Evaluate materials, lighting, ground contact, composition, and resource cost on those artifacts. Render counts and passing tests do not establish artistic quality.

For modified animation, check all changed translation/rotation/scale components, repeated evaluation at the same time, scrubbing, and a fresh model instance. Foot-center checks alone miss accumulated paw scaling.

When movement or interactions change, test approaches to independently repositioned objects, obstructions, moving the target, and cancellation in motion. A fixed attractive route does not establish general navigation.

Accept added effects/filters only with visible benefit commensurate with their cost. Record artistic acceptance independently of technical correctness and deployment. Runtime integration or tunable placement also triggers coding contracts and UI QA.

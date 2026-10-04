# Game entry first-frame correction

## Scope and attribution

Base: `67dd04ebcacc46dabefe525614a6eb17dda44d5a`.
Published comparison: `84d252d4`.

The affected App layout, global CSS, immersive-controller hook, runtime asset
URL helper, HUD skin CSS and update manager are identical in those two source
versions. The intervening Yard loader switches to `YardReleaseGame`; it is not
the origin of this cross-game entry problem.

A source-level first-frame defect is present in the published version:

1. `useGameHub.setActiveTab` clears `activeGameShell`, correctly preventing use
   of the outgoing controller during navigation.
2. App previously derived its immersive *presentation* solely from that field.
3. The new lazy game registers its controller in a passive effect after mount.
   Before its chunk/snapshot arrives, the global legacy Hub header and metric
   skins can therefore render. The generic `.loading-panel` also paints the
   previous glass/gradient skin.
4. Garden already hides global metric chips through its layout defaults. Its
   relevant early mismatch is the old green-gradient host and generic loading
   surface, not painted global chips.
5. Current game image decoding remains asynchronous. Its current solid stage
   colors are a suitable fallback; former Hub artwork is not.

This is verified source attribution, not a claim that an actual user's cached
browser has been inspected. Pixel reproduction and final visual acceptance are
pending the real-browser CI cases below.

## Correction

- Choose immersive presentation synchronously from the existing game registry.
  Keep actual controller registration, cleanup, active-run state and Home leave
  barriers exactly as before.
- Use an art-free status for both initial snapshot and lazy chunk loading. Home
  remains reachable, but other game cards stay disabled until the existing
  controller/outbox rules permit switching. An offline initial snapshot keeps a
  Retry action.
- Give the root, selected shell and keyed game frame solid entry surfaces.
  Current backgrounds and button images reveal over those surfaces naturally.
  No image URL is repointed to an old asset while another image decodes.
- Do not await every texture, preload inactive games, add timers, remount running
  games for image changes or suppress gameplay input behind a decode overlay.
  Existing loading behavior, game lifecycle and startup lazy-loading budgets
  therefore retain their original ownership.

The temporary entry status/actions are an intentional layout exception inside
the existing `activeGameFrame`; they are not an editor-tunable gameplay HUD.
They use 44px-or-larger controls and do not own additional playfield reserves.

## Cache audit

The production worker uses `NetworkOnly` for navigation/API and `CacheFirst`
for runtime image/audio/font requests under `/games/` and `/assets-runtime/`.
It does not use stale-while-revalidate for this art. A CacheFirst hit itself
cannot explain a same-request old-then-new background swap.

The shared `assetUrl` helper build-versions Blox/Bubbo/Match3 `/games/` URLs;
runtime manifest assets have content-hashed filenames. Some CSS and Garden /
Trivia direct paths remain unversioned, so replacing those files under an
unchanged URL can retain older bytes. That separate cache-invalidation risk
has not been claimed fixed by this presentation patch. No cache, localStorage,
IndexedDB, save, account, update policy or registration is cleared or changed.

## Browser coverage and acceptance

`tests/e2e/game-entry-flash.spec.js` is assigned to the existing
`assets-performance` group. It runs against production-built chunks and the
real generated service worker through the existing ephemeral local fixture.
The fixture delays original HTTP responses without changing their bytes or
replacing production functions.

The ten entry cases cover all eight current games across 320×568, 360×800,
390×844 (2× DPI), 414×896, 568×320, 844×390, 768×1024, 1024×768, 1280×720 and
393×873. Each checks:

- cold snapshot loading, delayed real artwork and fully loaded entry;
- a populated production runtime-art cache and a warm controlled reload;
- paint-frame observations beginning before the application entry script,
  including the root before App mounts;
- no visible legacy Hub chrome, old gradient loading surface or wrong-game root;
- retained test-owned save and unrelated cache sentinels.

A further case delays the actual Blox lazy chunk, checks that Home cannot
abandon an unmounted controller, then rapidly navigates Blox → Bubbo → Match3 →
Garden with artwork held at the HTTP server. Late outgoing image completion,
Home close/Back/Forward, final game identity and uncaught browser errors are
checked. Bounded JSON frame
observations and real screenshots are preserved for each meaningful phase.
These observations supplement, rather than replace, the existing full game
layout, touch, lifecycle and screenshot suites.

Run through the existing CI browser group, or with installed dependencies:

```
pnpm exec playwright test tests/e2e/game-entry-flash.spec.js --project=chromium --workers=1
```

## Local evidence and remaining limits

- 63 focused Node tests pass: entry presentation, browser-group contract, Home
  navigation, HUD layouts, runtime URLs, update-manager core, pointer sessions
  and Telegram gesture lifecycle.
- HUD validation passes for 8 visible games / 15 preview presets. The two
  existing Blox/Match3 identical-reserve warnings are unchanged.
- JavaScript syntax checks for the new browser spec/helpers pass.
- `git diff --check` passes.
- Production build, actual Playwright discovery/execution and screenshot review
  have not run locally: dependencies are not installed in this isolated
  checkout. No package/network restriction was bypassed. CI must establish
  browser, build and startup/performance acceptance before release.

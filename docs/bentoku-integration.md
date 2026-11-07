# Bentoku integration

Bentoku remains in `Le-Who/bentoku` and is served from
`https://bentoku-nine.vercel.app/`. The Hub catalogue lazily mounts its host
screen and opens `https://bentoku-nine.vercel.app/?embed=ccgh` in a sandboxed,
cross-origin iframe inside the existing Telegram Mini App. This does not
require another BotFather app registration or a bot command change.

Garden remains the default opening game. Bentoku is the second catalogue
card, immediately after Garden, with its own porcelain-cat illustration;
both cards share the first row on phones without scrolling.

The Hub owns Telegram initialization, Back/Home navigation, safe-area padding,
swipe suppression and loading/retry controls. Its navigation uses a horizontal
toolbar in portrait and a left rail in short landscape viewports. Registered
HUD defaults cover the host viewport, navigation and loading illustration.
Bentoku owns the internal responsive game, artwork and authored anchors;
these are intentionally outside the Hub editor. The catalogue/loading artwork
is the existing Bentoku porcelain `cat_rice.webp` source asset, copied without
modification, from game revision `82e1572c8a1e6e3c3813dd4fbd19a348e4f7c016`.

The version-1 bridge exchanges only:

- Hub to game: `ccgh:bentoku:connect` and
  `ccgh:bentoku:visibility` with a boolean `visible`.
- Game to Hub: `bentoku:ready`.

The Hub checks the exact Vercel origin and the current iframe WindowProxy.
The game checks its parent WindowProxy and the origin of `document.referrer`;
the host supplies an origin-only referrer. Telegram initData, identity,
credentials, player snapshots and economy commands are never forwarded.
Home retains the same iframe and puzzle. Hidden/error/unmounted screens pause
the game and sound; leaving Bentoku is safe because its normal game mutations
persist to its own origin's localStorage synchronously. Shared rewards,
achievements and cross-device saves are outside this integration.

Deploy the Bentoku bridge to the existing Vercel site **before** deploying the
Hub catalogue change. The Hub requires its readiness handshake and displays a
retry/exit state after 20 seconds if the game fails to connect. A previous
Bentoku deployment without the bridge will not satisfy this handshake.

Relevant checks: `node --test tests/bentoku-bridge.test.js`,
`pnpm run hud-layout:validate`, `pnpm test`, `pnpm build`,
`node scripts/browser-ci-groups.mjs --matrix`, and
`pnpm exec playwright test tests/e2e/bentoku.spec.js --project=chromium --workers=1`.
The browser spec controls the external HTTP boundary to test Hub navigation
and failure recovery. Real gameplay, local save restoration, interrupted input
and the complete viewport matrix also need browser QA with the matching
Bentoku build. Actual Telegram Android/iOS/Desktop checks are distinct from
browser tests and must be reported separately.

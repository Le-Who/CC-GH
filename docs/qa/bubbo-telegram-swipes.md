# Bubbo aiming and Telegram vertical swipes

## Report and cause

A downward finger movement while aiming in Bubbo can minimize the Telegram Mini App sheet. The v2 Canvas2D field has pointer capture, `touch-action: none` and `overscroll-behavior: none`, but it bypassed the Pixi host's Telegram gesture bridge. Those browser mechanisms cannot by themselves control Telegram's native sheet recognizer.

The app pins `@telegram-apps/sdk` 3.11.8 (`@telegram-apps/sdk-react` 3.3.9). Its existing platform initialization mounts the swipe behavior component. No SDK upgrade or extra Telegram script is part of this fix.

## Scoped behavior

- A loaded, playable Bubbo field acquires native swipe suppression during its layout effect, before an aiming touch starts. The scope covers playable aiming, including the gaps between shots, to avoid racing the native recognizer on the first `pointerdown`.
- Menu, loading/error, pause and result states do not own the scope. Pausing, leaving, hiding/blur-induced pause and unmount release it; resuming reacquires it. Canceling an individual pointer clears capture but leaves the next playable aim protected.
- The final owner restores the SDK's previous swipe state. An already-disabled state remains disabled. Independent owners cannot release one another; the existing Pixi boolean adapter now uses its own owner.
- No document-wide touch cancellation or CSS change was added. The existing playfield-only touch action and pointer handling remain; dialog and compact-layout scrolling keep their browser behavior.
- Unsupported clients or unavailable SDKs retain ordinary browser input. The app does not try an undocumented host API or attempt to override Telegram's header gesture.

SDK 3.11.8's initial mount can itself initialize the swipe state to disabled. This patch preserves the state it finds rather than changing the app's global initialization policy. A subsequent scope release no longer blindly enables an initially disabled state.

## API evidence checked 2026-10-02

[Telegram's official Mini Apps API](https://core.telegram.org/bots/webapps#initializing-mini-apps) documents `disableVerticalSwipes`, `enableVerticalSwipes`, `isVerticalSwipesEnabled`, and version checking. Swipe control is supported from Bot API 7.7. The native header remains a way to close or minimize the app.

The [pinned SDK 3.11.8 distribution](https://cdn.jsdelivr.net/npm/@telegram-apps/sdk@3.11.8/dist/index.js) was inspected as source text. Its exports include `isSwipeBehaviorSupported`, `isSwipeBehaviorMounted`, `isVerticalSwipesEnabled`, the mounting function and both swipe setters. The setters send `web_app_setup_swipe_behavior` with `allow_vertical_swipe`; mounted state is required. This patch uses those existing package APIs.

The maintainer's [current swipe behavior documentation](https://docs.telegram-mini-apps.com/packages/tma-js-sdk/features/swipe-behavior) describes the same mounted component lifecycle. Current documentation uses the renamed `@tma.js/sdk`; its [migration guide](https://docs.telegram-mini-apps.com/packages/tma-js-sdk/migrate-from-telegram-apps) explains the older flat exports. This release retains its pinned package.

## Verification

- 10 focused portable tests cover native SDK state restoration, independent owners, idempotent release, delayed loading and effect replay, unavailable/older clients, mounted state, the actual Bubbo field lifecycle, loading/error, pointer cancel/capture loss, blur/hidden, unmount and the real Pixi compatibility adapter.
- The original `6fc20cf` field fails both pre-arming and continued aiming-protection regressions when substituted as a negative control. The corrected field passes.
- The existing portable arcade suite plus the new tests passes: 138 tests, no failures or skips.
- New real-browser regression cases are added to `tests/e2e/gestures.spec.js` for the 9 required viewports plus 375x812, all at DPR2 and with touch input. They use the production SDK with a simulated native transport, downward CDP touch motion, pointer capture/cancel, a subsequent real shot, canvas/viewport stability, pause/resume/exit restoration, small-screen dialog touch scrolling and the 320px overflow check. SDK reload storage seeds an enabled initial state, so a missing Bubbo scope cannot pass just because SDK mounting initially disabled swipes.
- Source and E2E syntax checks passed. Browser cases and the full application build were not run in the dependency-free worker environment. The broader Merge/UX checks cannot import React/Zustand there; those remain CI checks.

## Physical acceptance still required

Physical Telegram on Android and iOS is unverified. On each supported client, start Bubbo, drag downward repeatedly while aiming, cancel a touch, pause/resume and exit. Confirm the sheet stays put during aiming, a subsequent shot works, pause/help content still scrolls, and the native header still minimizes the app. Test portrait and landscape. Record client versions and any difference on clients below 7.7; browser emulation cannot verify Telegram's native recognizer.

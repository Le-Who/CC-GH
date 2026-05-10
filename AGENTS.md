\## UI, Mobile, DPI, and Telegram WebView QA



For any UI, HUD, Pixi scene, bottom dock, responsive layout, or touch interaction change, treat the task as mobile-first.



Use this verification order:



1\. Apply the `playwright-interactive` skill for iterative UI debugging.

2\. Use explicit viewport passes first:

&#x20;  - 320x568 small mobile

&#x20;  - 390x844 common mobile

&#x20;  - 414x896 large mobile

&#x20;  - 768x1024 tablet portrait

&#x20;  - 1024x768 tablet landscape

&#x20;  - 1280x720 desktop smoke

3\. For high-DPI checks, run at least one pass with `deviceScaleFactor: 2`.

4\. For touch behavior, use `isMobile: true` and `hasTouch: true`.

5\. For Telegram-like constraints, verify:

&#x20;  - no horizontal scroll at 320px

&#x20;  - bottom dock does not clip labels/icons

&#x20;  - HUD does not overlap the Pixi playfield

&#x20;  - dialogs are reachable and focusable

&#x20;  - tap targets are at least 44x44 CSS px where practical

&#x20;  - pointer sessions clean up on blur/visibility changes

&#x20;  - resize/redraw happens after viewport changes

6\. Run a visual QA pass separately from functional QA.

7\. Treat visible clipping, cut-off controls, unreadable labels, weak contrast, broken layering, or awkward motion as bugs even if tests pass.


For CC-GH specifically:

\- Never optimize only for desktop Chrome.

\- Do not rely on hover-only affordances.

\- Keep live-game events in the lower HUD/action log unless the game intentionally uses a modal/dialog.

\- Keep thumb-reachable controls clear of the Pixi playfield.

\- Validate Pixi canvas resizing after WebView viewport changes.


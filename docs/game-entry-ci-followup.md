# Entry CI follow-up: mounted-game Home readiness

Base: `cc50760934e85f0b8c312f15ff30cc87b4a8cfa8`.
CI run: https://github.com/Le-Who/CC-GH/actions/runs/37177098501
Yard job: https://github.com/Le-Who/CC-GH/actions/runs/37177098501/job/111361990935

## Observed failure

Seven Yard browser cases passed. The playzone/remodel case failed on all three
attempts at the second remodel's navigation step, before that iteration's
placement/visitor geometry assertions.

The identical click log resolves the loading status's plain `All games`
button, waits for entry-animation stability, then reports that it detached.
The helper remains committed to this one navigation branch. A ready Yard has
no directly visible `All games` button; its current route is Settings, then
All games. Consequently the helper waits forever for a control that has
legitimately been replaced.

The bounded review artifact (`11293518508`, 9,463,688 bytes) contains all three
failure contexts and screenshots. Its archive SHA-256 is
`28624ddd6db8ee1ee8f86e66b6f28edb136c1951f31795d2610603d833f840eb`.
The inspected retry-1 screenshot shows a fully rendered Moon Garden with
Settings, two visitors, goodies and the dock, and no Home overlay. Its
SHA-256 is `fc2fb2b2461e975d5298640e9579072339ec5a500006354f1c3241c62570afb1`.
The final accessibility contexts likewise contain Settings and the current
Yard controls, rather than a loading status or any obscuring dialog.

The trace artifact was exported, but its temporary download endpoint returned
HTTP 403; it was not inspected through another route. The diagnosis therefore
relies on the actual click logs, failure screenshots, accessibility contexts
and corresponding source, not a claim of having replayed the trace.

## Cause and correction

The old test helper treated `.immersive-mode` as mounted-controller readiness.
After the first-frame fix that class correctly describes presentation from the
initial selected route, including while its lazy module is pending. This
exposed the helper's obsolete readiness assumption on a persisted Yard reload.
The initial Garden iteration does not have this race because the helper
already waits for its real `.gs2-stage`.

The helper now waits for `.game-entry-status` to retire before choosing the
mounted game's currently visible navigation control. Explicit tests of early
loading navigation continue to target that loading button directly. The
production loading controls and controller/save guards are unchanged.

No click is forced, no exception is swallowed, no retry is hidden and no
timeout is enlarged. Existing visitor/playzone/placement assertions remain
intact. Genuine browser reruns must establish final acceptance.

## Local verification

21 focused Node tests pass (entry readiness, Home history/leave behavior and
browser-group completeness). The changed helper passes JavaScript syntax and
diff checks. Local browser execution remains unavailable without installed
dependencies; no blocked installation was retried.

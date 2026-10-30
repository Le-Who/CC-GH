# Bentoku image qualification

The source manifest closes the new QA-only child of the reviewed product
revision. The existing normal development image lane retains all 14 checks
and adds live Bentoku navigation, placement, pause/resume and local-save checks.
Garden stays the initial game. Bentoku is the illustrated second card and
must expose its artwork and title without catalogue scrolling in the admitted
phone cases; tapping the artwork opens the game.

Run 41010119614 on source 5ccd5880ba8eb5bc6bfd6e6dde65ffa9e0a4f347 failed
before source tests or image build: `ubuntu-latest` resolved to Ubuntu 26.04,
which locked Playwright 1.58.2 cannot install on. The corrected first-push lane
pins `ubuntu-24.04` and uses a new branch ending in `-r2`. The failed run is
retained; it is not a passing image or deployment proof.

Run 41010228051 on 6426fe1b8be0f66b9f7945886f145d36c73f2e78 passed
79 source checks, 19 interaction checks and 5 release smoke cases. The full
controller suite reported 63/64: its old negative fixture deleted an expired
log field which the honest current predecessor receipt does not contain.
The fixture now deletes the required immutable candidate-packet hash and
must still be rejected. No receipt guard is removed; all 64 cases run again
on the new `-r3` source. This earlier run built or activated no image.

Run 41010669519 on 0e42aa23d259534154d871f4afa689d180c52190 again passed
79+19+5 before the complete controller run hit the newly combined lane's
150-second timeout. The corrected `-r4` lane restores the original qualified
controller's 420-second ceiling and allows 15 minutes for controller plus
image qualification in one job. Browser220s, image330s, artifact8MiB,
single-attempt and all check requirements remain unchanged. No image was
built or activated by the timed-out run.

Run 41011220947 on 4f9de829ab4432fea7e5fbe9bfccf7e500321719 passed all
source/controller/Compose/formatter checks and built/pulled the normal image.
Its new browser case incorrectly expected the running child's URL to retain
only `embed`; Bentoku normally appends its own seed and difficulty. The `-r5`
case checks the supplied iframe URL has only `embed` and that the running
child adds only its two puzzle parameters. Telegram data stays absent.
The initial catalogue assertion now checks the visible artwork/title tap
target rather than the list row's height stretched by other descriptions in
short landscape. Local final-build/live-Vercel320/390/568 diagnostics passed
placement, pause/input/sound, resume and save reload with these observations.
This failed image was not activated; all actual-image cases run fresh on r5.

Controller provenance and old successful activation metadata are separate
from fresh mechanism tests, actual A/B image evidence, independent visual
review and final host preflight. No activation is performed by this lane.

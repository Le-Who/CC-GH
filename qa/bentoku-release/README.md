# Bentoku image qualification

The source manifest closes the new QA-only child of the reviewed product
revision. The existing normal development image lane retains all 14 checks
and adds live Bentoku navigation, placement, pause/resume and local-save checks.
Garden stays the initial game. Bentoku is the illustrated second card and
must be fully visible without catalogue scrolling in the admitted phone cases.

Run 41010119614 on source 5ccd5880ba8eb5bc6bfd6e6dde65ffa9e0a4f347 failed
before source tests or image build: `ubuntu-latest` resolved to Ubuntu 26.04,
which locked Playwright 1.58.2 cannot install on. The corrected first-push lane
pins `ubuntu-24.04` and uses a new branch ending in `-r2`. The failed run is
retained; it is not a passing image or deployment proof.

Controller provenance and old successful activation metadata are separate
from fresh mechanism tests, actual A/B image evidence, independent visual
review and final host preflight. No activation is performed by this lane.

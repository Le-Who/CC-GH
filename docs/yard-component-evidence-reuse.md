# Scoped Yard geometry evidence reuse decision, 2026-10-04

The reviewed cold-ground optimization may reuse the prior native timeline,
media and reward evidence for those unchanged components. A fresh full
110-minute run is additional confidence for this geometry-only repair and is
not a mandatory blocker for accepting that repair.

This decision explicitly supersedes the fresh-duration requirement recorded in
`evidence/yard-cold-escape-transfer.json` and the historical
`reviewedColdEscapeChangeSet.newNativeDurationEvidenceRequired` field for this
specific repair. Those original records remain unchanged. This decision does
not mark that earlier requested run as completed or turn its historical result
into a test of a different source tree.

## Evidence and scope

- Approved ground source SHA-256:
  `28758a6fd7a29fd2e97dd7d8c12ec0dcfdaf3ea182dd04bef0d983e3f961921e`.
- Approved patch SHA-256:
  `3d83482e952d61c7e7a5af1669e96673ba4ea0632e699a76d89ac7b59aed2e54`.
- Independent geometry review identity:
  `7c4aa91959f91f32014d7d643b84c940ff1a8ada1111a201052794011017e804`.
  The review reports 170,001 differential cases and unchanged saved state,
  source plans and repair results.
- Regenerated canonical fixtures, the Mochi110 witness, and the 978-file media
  closure are byte-identical. The copied Mochi-combined plan and 21 boundary
  samples are also byte-identical. Exact hashes are retained in
  `evidence/yard-cold-escape-transfer.json`.
- Current-source native contracts passed. The e231 CI's genuine eight-player
  matrix passed all 59 cases across the four viewport groups, including all
  23 phone cases. This is bounded real API/browser/PostgreSQL evidence, not a
  claim of one 110-minute browser session.

The optimization changes ground-coverage evaluation; it does not change visit
durations, authored media, schedules or reward rules. The differential tests,
exact regenerated outputs, current native checks and genuine player matrix
cover the changed path. Source acceptance and player rollout gates remain
closed.

The running native-duration workflow `37181192587` remains tied to
`e2310e966373830768fe19c6a3ed58ddc0a8745e`. The later room-toolbar and entry-art
patches leave all four 95-file canonical closures, media closure, native runner
and fixtures byte-identical to e231; these UI patches require no replacement
native-duration run.

## Gates retained

The new combined candidate still needs its actual build and CI checks. The
observed e231 failures remain failures: small-phone Shiny-control interception
in the 17-case lane, an obsolete retired Blox metric-chip request in the assets
lane, and Merge p95 1.230 ms above its 1.2 ms budget. The reviewed UI/art patches
address the first two; the next CI must confirm them. Independent repeated
Merge measurements support runner variance, but do not prove universal passing
performance. No budget is increased.

This scoped reuse decision does not waive those failures, production delivery
checks, or separate ACTIVE promotion acceptance and authorization. It does not
open any player, actor or media gate.

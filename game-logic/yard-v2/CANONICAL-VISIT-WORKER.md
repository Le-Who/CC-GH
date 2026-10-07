# Inactive saved-visit worker boundary

This module removes synchronous preparation/replay from the proposed integration
path. It does not integrate admission, a container version, a simulator event,
an HTTP route or a renderer. `CANONICAL_VISIT_WORKER_ENABLED` defaults to false;
the actual development server still has `canonicalVisitAdmission:false`.
The original saved-Pip bridge and its source stay files are unchanged.

## Contract

`createCanonicalVisitWorker({enabled:true})` is a source-only preparation seam.
Enabling it authorizes computation only. Every outcome still has `ready:false`
and `admission:false`, including successful artifacts. There is no writer,
lottery, economic callback, database connection or background admission grant.
Never translate `state:'prepared'` into the historical admission policy's
`ok:true` return.

`enqueue(request)` returns synchronously with a non-thenable handle. An exact
duplicate receives the same handle and completion promise. A hit returns the
same deeply frozen evidence. The optional `handle.completion` must be awaited
only outside the player lock. Worker construction itself is deferred until
the current callback returns. One worker performs one actual preparation or
source replay and is terminated after its result; it never picks another guest.

The server-owned request contains exactly:

- `ownerId`: authenticated account identity, not a client-provided override.
- `fence`: `yardRevision`, `layoutRevision`, `cursor`, `reservationDigest`.
  The first three are bounded nonempty strings, the last a SHA-256 digest.
  Build these from current authoritative Yard state. A revision must distinguish
  an ABA change even if rows later return to an earlier shape. Do not use a fresh
  random value on every snapshot or the player manager's unrelated sync count.
- `operation:'prepare'`, with `input:{candidate,rows,bowl}`, or
  `operation:'restore'`, with `input:{record,rows,serverNow}`.

The exact key covers the complete bounded canonical JSON request, protocol and
source-owned compiler/dependency hash. This includes owner, selected visit,
arrival/departure, target/lifetime, all rows/uses, exact bowl/expiry, and complete
saved bytes on replay. Motion seed, actor, navigation, geometry, food descriptor
and compiler rules are also pinned by the actual source graph. The manifest
contains hashes for 26 source/data files, including the model and calibration.
Workers verify every hash before importing the compiler. Caller-supplied
source/profile claims cannot change the accepted sources.

The restore evaluation time must be a stable authoritative reconciliation point
for this work unit. Do not supply a newly changing wall-clock timestamp on every
poll: that would create new exact keys continually. A current presentation sample
is deliberately excluded from the cache. Later transaction/event processing
still owns the current clock and remaining reservations.

Only successful replay/preparation evidence is cached. The proposal retains its
original uncommitted economic projection because that is part of its saved hash;
this is never a cached stock check, permission, capability, conflict clearance,
spend decision or commit. Refusals, invalid records, failures and timeouts are
not cached. They return unavailable with retryable unresolved-work semantics.
No result changes a cursor, stock, uses, petbook, gifts or receipts.

## Bounds and lifecycle

Defaults: one worker, at most eight pending jobs, 256 KiB per request, 2 MiB
pending serialized input, 1 MiB per result, eight cache entries / 8 MiB serialized
result bytes, 60-second cache TTL. Traversal is capped at 50,000 nodes and depth
48; values are plain JSON with no coercion, accessors or cyclic graph. A worker
has 128 MiB old-generation, 16 MiB young-generation and 4 MiB stack limits.
These are explicit V8 and serialized-data bounds, not a claim that whole-process
RSS equals the cache byte count. Parsed objects, strings and Node itself have
overhead. At most two workers can ever be configured, with hard ceilings on
every configurable bound.

The execution deadline is 30 seconds, including startup/source verification;
the total enqueue-to-result deadline is 45 seconds. A late message fails even
if another main-thread operation delayed the timer callback. Termination retains
the concurrency slot until worker exit. Queue overflow and queue deadline are
unavailable, not evidence that geometry has no path. Timeouts do not advance a
cursor or persist a rejection. The original actual slow refusal remains an
honest full compiler result when it completes within the deadline.

`invalidateOwner(ownerId)` invalidates that account's jobs and cache. A new key
enqueued for the same owner supersedes its old work. `cancel(ownerId,key)` only
cancels that owner's matching job/evidence. Job UUIDs and finished-state checks
reject late results from cancelled jobs, including same-key replacement jobs.
`close()` cancels pending work, clears evidence and waits for worker termination.
Restart loses only process-local work/cache; durable state is never passed to a
writer. Deploy source/manifest atomically and restart this service; in-place
hot patching of a live compiler is not supported.

## Concrete next integration seam

The inspected real `playerManager.js` awaits after-commit hooks inside its
account mutex, both in its test store and after the winning PostgreSQL OCC save.
`afterPlayerCommit` is therefore a safe place for bounded enqueue only. A hook
must return immediately, without awaiting `completion`, loading/replaying a
record or calling the expensive bridge directly. Losing OCC callbacks must not
enqueue. A cold snapshot can also enqueue exactly the persisted unresolved unit.

Future integration should use this order, with admission still gated off until
the separate simulator/container/economy work is complete:

1. Select one deterministic due opportunity using the existing simulator,
   capture current authoritative inputs, and enqueue after the winning commit.
   On a cache miss, expose reconciliation pending and defer dependent Yard
   mutations. Preserve the existing unresolved cursor and outbox intent.
2. On a completion notification, enter a fresh `withPlayerLock`. Reconstruct the
   request from that current player and call `lookup(currentRequest, notifiedKey)`.
   A changed owner/state returns `STATE_OBSOLETE`; a missing/expired cache returns
   pending. Never commit from the completion value or a retained artifact alone.
3. Recheck current source capability, candidate/event identity, times, stock,
   target condition/lifetime and all live reservations. The cache does not make
   those decisions. On any changed key, discard/requeue the fresh work unit.
4. Only the future versioned simulator transaction may merge current Yard fields
   and atomically persist the existing single serving/use/petbook/visit effects.
   Its receipt/cursor OCC contract must make duplicate notifications harmless.
   Departure and collection remain existing authoritative event/receipt actions.

This packet does not implement steps 1–4 in routes or storage. It also does not
solve mixed legacy/canonical admissions, layout replanning, rollback container
support or artistic/full-stay acceptance. No old save is reset or reinterpreted.

## Evidence and limits

The focused suites cover immutable exact keys, coalescing, owner/state fences,
input/output/queue/cache bounds, expiry, malformed/mismatched messages, source
drift, delayed timers, timeout, cancellation, crash/exit, duplicate output,
restart, actual source replay and a malicious rehashed saved record.

A real pinned preparation produced the existing sealed record and complete plan
hash in about 3 seconds while the main thread delivered timer callbacks.
The actual slow geometry refusal took 23.84 seconds. During that work, an actual
after-commit hook returned in 0.90 ms; warmed same-account/other-account snapshot
calls took 3.95/4.25 ms. Existing cold player/media warm-up took 1.25 seconds and
is reported separately. These are local observations, not production latency
percentiles. The lock test uses the real manager and snapshot builder with the
test-only in-memory store; no PostgreSQL transaction/admission test is claimed.

No new dependencies, browser session, external job, public write, host change,
server launch, saved-player mutation or renderer change was needed.

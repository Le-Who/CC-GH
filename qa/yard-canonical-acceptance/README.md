# Pointer ordering, independent HUD coverage and visible adaptation

Baseecde5ad9c45cdc348a573797605b9b8fc133580b, tree
1caa577e6754679257956326dd0f13e243a3bdbb. Integrate the separately reviewed
pointer/ResizeObserver source+test fix before sealing. This packet edits QA only.
The existing strict resize cancellation predicate remains unchanged.

The action test and complete HUD matrix are independent Playwright tests. Actions
including both native clips are bounded at125seconds; the matrix at75seconds;
the entire browser run remains220seconds, with zero retries and no fail-fast limit.
A worker restart reloads the previous browser.json for the same exact commit.
Every action error, clip, case and console record survives; afterEach/afterAll write
combined status. Any failed section keeps overall acceptance failed. A separate
account with two owned items and one actual authenticated API placement98,118 gives
the HUD matrix a stable saved scene independent of action/editor failure. Each of
11 viewport passes records its own failure and continues while its bounded test
remains available. Timeout never counts as passing missing coverage.

The second native recording uses the same real saved target98,118 and blocker
initially88,172. While Pip is idle at registered entry, it moves the blocker through
the actual UI to94,135, waits for the committed frame, inspects the same target and
finishes the alternate route. It records action/admission timestamps and retains
raw untrimmed/unretimed video. Both recording contexts exclude screenshots/resize;
normal jitter crops and stills remain separate. Interrupted recordings are copied
after context closure. User-facing startup-only trims are external derivatives;
raw videos and prior failed-run evidence remain unchanged.

Expected additional recording window is approximately18–22seconds including page
entry, UI move and the12.1second admitted route; this is a preparation estimate,
not a measured new browser run. Existing normal raw clip was11.16seconds/603110bytes.
Both videos and matrix evidence must fit the unchanged8MiB cap; upload fails closed
if they exceed it. Job remains one standard10-minute runner, PostgreSQL15,3day
retention. No assets are generated or republished by this QA packet.

Fresh source/pointer/renderer checks and preview production build with every
closure/cap remain. Prior17fc PG9/default-off proof retains the full protected-file
identity guard, with only the two exact updated optional scene/test exceptions:
sceneab37dc888b6873061187c833e5bbe1d590ca90641233f48291b2b739b8702761;
testa3931817a90a1280d2bc806e617f858bcb7b1c1dfc683c1ad0fbc2a714f31798.
Actual browser backend is fresh and all live behavior still must pass.

After complete review regenerate seal.mjs --reviewed-final-source, then commit the
seal and reviewed product/QA delta as one child ofecde. Branch target:
qa/yard-canonical-pointer-matrix-20261006. No browser, listener, job, publication or
external call was launched while preparing this packet. Visual grounding, device
FPS and uncompleted viewport cases remain unqualified until actual evidence.

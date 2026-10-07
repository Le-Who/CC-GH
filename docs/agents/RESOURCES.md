# Resource and cleanup gates

One owner queues Blender, builds, large copies, and packaging; track active directories, space reserve, and shared-resource consumers. Prefer small isolated patches or worktrees to full copies. Share installed dependencies only with matching lockfiles/environment versions and no concurrent package mutations. Identify the real dependency directory and every symlink consumer before cleanup.

Before a large build, render, unpack, copy, or package operation, measure free bytes and inodes on every affected volume. `/tmp` can be separate; cleaning it may not help the workspace. Estimate simultaneous peak occupancy: sources, unpacked inputs, old/new builds, intermediate renders, evidence package, and archive. Preserve lossless original evidence.

For the approximately 32 GB workspace described by the existing policy, reserve at least max(5 GB, twice the next operation's expected peak allocation). Below 3 GB, stop heavy work until calculation and cleanup establish sufficient capacity. Verify the actual volume; these are environment-specific working thresholds, not platform specifications. If the environment differs, establish its budget before proceeding rather than assuming the thresholds transfer.

## Select a recoverable cleanup batch

Candidates: unused reproducible builds, confirmed duplicate dependencies/unpacked archives, and temporary conversions after original/result verification. Age or a temporary-looking name is insufficient.

Protect active worktrees/locks, uncommitted changes, approved sources/assets, licenses, last working build/current candidate, recipes/lockfiles, unique original frames/recordings, and unresolved-bug evidence. CI completion or posting a video does not make its source disposable.

Record exact paths, owners, sizes, deletion reasons, and recovery method. Check active processes and symlink consumers; obtain affected active-work owners' confirmation because process visibility can be incomplete. This does not replace any required user deletion approval. Avoid wildcard deletion and other owners' directories.

Before deleting unique data, store it persistently and verify readability/hashes. Reproducible builds need exact source, dependencies, command, and retained unique files. Archived trees need a saved restoration pointer and restoration before reuse. Never replace a directory with a symlink if the build forbids links or writes into that directory.

After cleanup, measure freed space and verify the active tree, dependencies, and retained evidence. Save the cleanup result. Repeat checks at work checkpoints; do not create an unnecessary background service or schedule.

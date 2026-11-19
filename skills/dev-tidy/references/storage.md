# Disk and memory investigation

Measure filesystem free space and the largest directories before choosing cleanup. Distinguish
source, histories and local databases from reproducible dependency/build output. Installed
applications, app data, caches and temporary source snapshots have different ownership.
Preserve snapshots that may contain unique uncommitted work. Missing optional tools are not a
reason to install them just for cleanup.

On macOS, inspect the Data volume. The root mount alone describes the system volume.
APFS copies share blocks, and sparse VM disks have an apparent size larger than their allocation.
Directory totals are not an exact partition of physical usage. Compare the same free-space
measurement before and after. On Linux, measure the filesystem containing the affected data.

For memory, inspect pressure, swap and process usage. RSS differs from physical footprint and
omits compressed pages. Cached files are reclaimable. Stop only proven abandoned development
processes through the script; leave active applications running.

## Parallel development

`{{repo_dir}}/bin/devservers.mjs status` reads the kernel's memory pressure level and lists the
dev servers in linked worktrees with their resident memory, clients, and idle time. Agent hooks
run its reap, which stops the idle ones, and an agent runs its `gate` before a server or a heavy
check. Judge by the pressure level, not by swap in use, which outlives the pressure that
filled it. On macOS, use `vmmap -summary <pid>` when RSS looks small despite heavy swapping, and
include child processes.

Under sustained elevated pressure, first stop this task's servers that no check or requested
preview needs. Then reduce workers or defer this task's next build, full test run, or browser
test. Keep unrelated agents and healthy parallel work running. Per-command worker limits
multiply across checkouts.

For Next.js, read the installed version's memory and Turbopack guides. Compare cache settings
with the same routes and edits, cold and warm runs, idle memory, and restart latency before
changing defaults. Keep persistent caches when stopping servers. A Node.js heap limit does
not bound native compiler allocations or the whole process tree.

## Chrome code-sign clones on macOS

Chrome creates temporary app bundles to keep signed resources available across browser updates.
The copies use APFS clonefile and hardlink the main executable. Their du total is not independently
reclaimable. They are unrelated to browser profiles, browsing history and ordinary browser cache.

Preview the standalone `dev-tidy --chrome-clones`. It checks the native executable vnode reference
count through XNU's FSIOC_FD_ONLY_OPEN_ONCE. A busy executable keeps every clone sharing that inode.
Unknown native results, malformed bundles, symlinks and changed identities preserve the clone.
Apply the previewed scope with --yes after authorization. For a pinned subset, call the adjacent
`python3 {{skills_dir}}/dev-tidy/chrome-clones.py --yes code_sign_clone.ABC123 ...` helper with the exact previewed names.
This operation is never part of ordinary or scheduled cleanup and never restarts Chrome.

Age and lsof's displayed hardlink path cannot prove ownership. Chrome's own cleanup helper waits
for its parent, not for the owner of an arbitrary suffix. Do not invoke it as a stale-clone check.

Primary sources: [Chromium clone manager](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/mac/code_sign_clone_manager.mm)
and [XNU reference check](https://github.com/apple-oss-distributions/xnu/blob/xnu-10063.121.3/bsd/vfs/vfs_syscalls.c).

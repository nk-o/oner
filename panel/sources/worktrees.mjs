import { listWorktrees, repoLabel } from '../repos.mjs';
import { run, SourceOff } from '../run.mjs';

const SIZE_TTL = 60 * 60 * 1000;
const PR_TTL = 10 * 60 * 1000;

// du on a large worktree takes minutes, so it runs behind the source and the size
// shows as measuring until it lands.
export function createSizes(measure = (path) => run('du', ['-sk', path], { okCodes: [0, 1] }).then((out) => Number(out.split('\t')[0]) * 1024), { limit = 2, clock = Date.now } = {}) {
  const known = new Map();
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < limit && queue.length) {
      const path = queue.shift();
      active++;
      measure(path)
        .then(
          (bytes) => known.set(path, { bytes, at: clock(), queued: false }),
          () => known.set(path, { bytes: null, at: clock(), queued: false }),
        )
        .finally(() => {
          active--;
          pump();
        });
    }
  };
  return (path) => {
    const entry = known.get(path);
    if (!entry || (!entry.queued && clock() - entry.at > SIZE_TTL)) {
      known.set(path, { bytes: entry?.bytes ?? null, at: clock(), queued: true });
      queue.push(path);
      pump();
    }
    return known.get(path).bytes;
  };
}

const slugOf = (url) => /github\.com[:/](.+?)(?:\.git)?$/.exec(url.trim())?.[1] ?? null;

function createPrStates() {
  const known = new Map();
  return async (root, signal, now) => {
    const entry = known.get(root);
    if (entry && now - entry.at < PR_TTL) return entry.states;
    let states = new Map();
    try {
      const slug = slugOf(await run('git', ['-C', root, 'remote', 'get-url', 'origin'], { signal }));
      if (slug) {
        const out = await run('gh', ['pr', 'list', '-R', slug, '--author', '@me', '--state', 'all', '--limit', '200', '--json', 'headRefName,state'], { signal });
        for (const pr of JSON.parse(out).reverse()) states.set(pr.headRefName, pr.state);
      }
    } catch (err) {
      if (!(err instanceof SourceOff)) states = entry?.states ?? states;
    }
    known.set(root, { at: now, states });
    return states;
  };
}

export function worktreesSource({ repos, sizes = createSizes() }) {
  const prStates = createPrStates();
  return {
    id: 'worktrees',
    label: 'Worktrees',
    interval: 30_000,
    timeout: 120_000,
    async read({ signal, now }) {
      const roots = await repos();
      const items = [];
      let unread = 0;
      for (const root of roots) {
        let trees;
        try {
          trees = await listWorktrees(root, signal);
        } catch {
          unread++;
          continue;
        }
        const extra = trees.filter((tree) => !tree.main);
        if (!extra.length) continue;
        const states = await prStates(root, signal, now);
        items.push({
          id: `worktrees:${root}`,
          repo: repoLabel(root),
          trees: extra.map((tree) => ({
            path: tree.path,
            branch: tree.branch,
            pr: tree.branch ? (states.get(tree.branch) ?? null) : null,
            bytes: sizes(tree.path),
          })),
        });
      }
      return { items, unread };
    },
  };
}

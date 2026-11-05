import { basename, dirname } from 'node:path';
import { run } from './run.mjs';

const WORKTREE = /^(.*?)\/\.claude\/worktrees\/[^/]+/;
const CODEX_WORKTREE = /\/\.codex\/worktrees\/[^/]+\/([^/]+)/;
const THROWAWAY = /^(\/private)?\/(var\/folders|tmp)\//;

// The project a working directory belongs to, for a label beside an item.
export function repoLabel(cwd) {
  if (!cwd) return '';
  const codex = CODEX_WORKTREE.exec(cwd);
  if (codex) return codex[1];
  const claude = WORKTREE.exec(cwd);
  return basename(claude ? claude[1] : cwd);
}

const roots = new Map();

async function rootOf(cwd) {
  if (roots.has(cwd)) return roots.get(cwd);
  let root = null;
  try {
    const common = (await run('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
    if (basename(common) === '.git') root = dirname(common);
  } catch {}
  roots.set(cwd, root);
  return root;
}

// The main checkouts behind the working directories agents used. A Claude worktree names
// its checkout in its path, which also covers one that is gone by now.
export async function findRepos(cwds, limit = 8) {
  const unique = [...new Set(cwds.filter((cwd) => cwd && !THROWAWAY.test(cwd)).map((cwd) => WORKTREE.exec(cwd)?.[1] ?? cwd))];
  const found = new Set();
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < unique.length) {
        const root = await rootOf(unique[next++]);
        if (root) found.add(root);
      }
    }),
  );
  return [...found].sort();
}

// Every checkout of a repository, the main one first.
export async function listWorktrees(root, signal) {
  const text = await run('git', ['-C', root, 'worktree', 'list', '--porcelain'], { signal });
  const trees = [];
  for (const block of text.split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path) continue;
    trees.push({ path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null, main: path === root });
  }
  return trees;
}

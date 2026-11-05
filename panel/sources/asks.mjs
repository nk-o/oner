import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { listWorktrees, repoLabel } from '../repos.mjs';

export function parseAsks(text) {
  return text
    .split('\n')
    .map((line) => /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter(Boolean);
}

// The asks agents wrote down because the turn could not finish them (AGENTS.md, Whole tasks).
export function asksSource({ repos }) {
  return {
    id: 'asks',
    label: 'Open asks',
    interval: 60_000,
    timeout: 30_000,
    async read({ signal }) {
      const items = [];
      let unread = 0;
      const roots = await repos();
      for (const root of roots) {
        const trees = await listWorktrees(root, signal).catch(() => [{ path: root }]);
        for (const { path } of trees) {
          const file = join(path, '.specs', 'requests.md');
          let text;
          let info;
          try {
            [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
          } catch (err) {
            if (err.code !== 'ENOENT') unread++;
            continue;
          }
          for (const ask of parseAsks(text)) {
            items.push({
              id: `ask:${createHash('sha1').update(file + ask).digest('hex').slice(0, 16)}`,
              kind: 'ask',
              agent: 'Ask',
              group: 'waiting',
              title: ask,
              detail: path === root ? null : `In worktree ${basename(path)}`,
              repo: repoLabel(root),
              at: info.mtimeMs,
              url: null,
              scheduled: false,
              prUrls: [],
            });
          }
        }
      }
      return { items, unread, note: `${roots.length} repositories scanned` };
    },
  };
}

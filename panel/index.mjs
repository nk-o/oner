import { join } from 'node:path';
import { createEditor } from './editor.mjs';
import { createHub } from './hub.mjs';
import { findRepos } from './repos.mjs';
import { asksSource } from './sources/asks.mjs';
import { claudeSource, createRecords, desktopStore } from './sources/claude.mjs';
import { codexSource, queryCodex } from './sources/codex.mjs';
import { githubSource, localDate } from './sources/github.mjs';
import { serversSource } from './sources/servers.mjs';
import { createSizes, worktreesSource } from './sources/worktrees.mjs';
import { claudeStatsSource, codexStatsSource, historyStart, prStatsSource, windowStart } from './stats.mjs';
import { assemble } from './today.mjs';

const WORK = ['claude', 'codex', 'github', 'asks'];
const MACHINE = ['worktrees', 'servers'];
const STATS = ['stats-claude', 'stats-codex', 'stats-prs'];
const REPOS_TTL = 10 * 60 * 1000;

// The repositories worth scanning are the ones agents worked in lately.
function createRepos({ records, codexDir, self, clock }) {
  let cached = null;
  // Shared by several sources, so it runs on no single source's timeout.
  return function repos() {
    if (cached && clock() - cached.at < REPOS_TTL) return cached.value;
    const value = (async () => {
      const since = windowStart(clock());
      const stored = await records().catch(() => null);
      const cwds = (stored?.records ?? []).filter((r) => r.at >= since).map((r) => r.cwd);
      const threads = await queryCodex(codexDir, `select distinct cwd from threads where source in ('vscode', 'cli') and created_at >= ${Math.floor(since / 1000)}`).catch(() => []);
      return findRepos([self, ...cwds, ...threads.map((t) => t.cwd)]);
    })();
    cached = { at: clock(), value };
    value.catch(() => {
      cached = null;
    });
    return value;
  };
}

const brief = ({ items, data, ...view }) => view;

export function createPanel({ repo, claudeDir, codexDir, rebuild, clock = Date.now, store = desktopStore(), sizes = createSizes() }) {
  const records = createRecords(store);
  const repos = createRepos({ records, codexDir, self: repo, clock });
  const prStats = prStatsSource({ cacheFile: join(repo, '.panel-stats-prs.json') });
  const hub = createHub(
    [
      claudeSource({ claudeDir, records }),
      codexSource({ codexDir }),
      githubSource(),
      asksSource({ repos }),
      worktreesSource({ repos, sizes }),
      serversSource({ repos }),
      claudeStatsSource({ claudeDir, cacheFile: join(repo, '.panel-stats.json') }),
      codexStatsSource({ codexDir }),
      prStats,
    ],
    { clock },
  );

  return {
    today({ check } = {}) {
      if (check && WORK.includes(check)) hub.snapshot([check], { force: true });
      const work = hub.snapshot(WORK);
      return { now: clock(), groups: assemble(work), sources: work.map(brief) };
    },
    // Apart from today, so du and lsof run only while this view is open.
    machine() {
      const [worktrees, servers] = hub.snapshot(MACHINE);
      return { now: clock(), sources: [worktrees, servers].map(brief), worktrees: worktrees.items, servers: servers.items };
    },
    // `from` is the first day the page shows. Reaching further back than what is loaded
    // reads the missing months of pull requests.
    stats({ check, from } = {}) {
      if (check && STATS.includes(check)) hub.snapshot([check], { force: true });
      if (/^\d{4}-\d{2}-\d{2}$/.test(from ?? '')) {
        const at = Math.max(Date.parse(`${from}T00:00:00`), historyStart(clock()));
        prStats.want(at);
        // A read already running may have started before this range was asked for, so what
        // came back decides, and a second read covers the rest.
        const [prs] = hub.snapshot(['stats-prs']);
        if (!prs.checking && prs.data && prs.data.from > localDate(at)) hub.snapshot(['stats-prs'], { force: true });
      }
      return { now: clock(), earliest: historyStart(clock()), sources: hub.snapshot(STATS) };
    },
    editor: createEditor({ repo, rebuild, clock }),
    hub,
  };
}

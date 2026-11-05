import { listWorktrees, repoLabel } from '../repos.mjs';
import { run } from '../run.mjs';

// `lsof -F` prints one field per line: p<pid>, c<command>, n<address>.
export function parseListeners(text) {
  const out = [];
  let pid = null;
  let command = null;
  for (const line of text.split('\n')) {
    const value = line.slice(1);
    if (line[0] === 'p') pid = Number(value);
    else if (line[0] === 'c') command = value;
    else if (line[0] === 'n') {
      const [, host, port] = /^(.*):(\d+)$/.exec(value) ?? [];
      if (port) out.push({ pid, command, port: Number(port), host: host === '*' ? '127.0.0.1' : host });
    }
  }
  return out;
}

function parseCwds(text) {
  const cwds = new Map();
  let pid = null;
  for (const line of text.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n') cwds.set(pid, line.slice(1));
  }
  return cwds;
}

export function serversSource({ repos, selfPid = process.pid }) {
  return {
    id: 'servers',
    label: 'Dev servers',
    interval: 15_000,
    timeout: 30_000,
    async read({ signal }) {
      const listeners = parseListeners(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcnT'], { signal, okCodes: [0, 1] }));
      const pids = [...new Set(listeners.map((l) => l.pid))].filter((pid) => pid !== selfPid);
      if (!pids.length) return { items: [] };
      const cwds = parseCwds(await run('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpn'], { signal, okCodes: [0, 1] }));
      const checkouts = [];
      for (const root of await repos()) {
        for (const tree of await listWorktrees(root, signal).catch(() => [{ path: root, main: true }])) {
          checkouts.push({ ...tree, root });
        }
      }
      const items = new Map();
      for (const { pid, command, port, host } of listeners) {
        const cwd = cwds.get(pid);
        if (!cwd || pid === selfPid) continue;
        const tree = checkouts
          .filter((t) => cwd === t.path || cwd.startsWith(`${t.path}/`))
          .sort((a, b) => b.path.length - a.path.length)[0];
        if (!tree) continue;
        items.set(port, {
          id: `server:${port}`,
          port,
          command,
          repo: repoLabel(tree.root),
          branch: tree.main ? null : tree.branch,
          url: `http://${host}:${port}/`,
        });
      }
      return { items: [...items.values()].sort((a, b) => a.port - b.port) };
    },
  };
}

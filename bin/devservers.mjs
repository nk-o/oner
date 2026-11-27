#!/usr/bin/env node
// Finds the dev servers running in linked git worktrees and stops the idle ones.
// Agent hooks run `hook`, so a server nobody stopped still goes away.

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = `Usage: devservers.mjs <command> [--idle <duration>] [--root <dir>]... [--quiet]

Commands:
  status            every dev server in a linked worktree: checkout, port, memory, clients, idle time
  reap [--dry-run]  stop the servers idle past the limit for the current memory pressure
  gate [--wait <s>] stop idle servers under pressure and exit 0 unless pressure is critical.
                    Then wait up to <s> seconds (default 120) for it to drop, and exit 75 if it has not
  hook              for agent hooks: start a background reap, at most once a minute
  preview --port <n> [--wait <s>] -- <command>...
                    start a server whose URL the user opens: in its own session, so it outlives
                    the agent's turn and background task, with its output in a log file. It stops
                    after an hour idle, or after the critical limit under critical pressure.
                    Exits 1 when it does not listen within --wait (default 120)

Idle limits: 30m at normal memory pressure, 5m at warning, 1m at critical. A server is active
while a client holds a connection to its port or its processes use CPU. reap also stops a
Next.js telemetry flush left running for 2m. --idle overrides the
limit, as in 10m or 0s. --root keeps to checkouts under that directory.`;

const LIMITS = { normal: 1800, warning: 300, critical: 60 };
const PREVIEW_LIMIT = 3600;
// An idle Next.js dev server used 0.15 s of CPU in 120 s; one page compile uses seconds.
const CPU_FLOOR = 1;
const CPU_IDLE_RATE = 0.005;
const HOOK_INTERVAL = 60;
const LOCK_STALE = 300;
const EXIT_PRESSURE = 75;

const STATE = process.env.DEVSERVERS_STATE ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'oner', 'devservers');
const DEV_RE = /next-server|next dev|vite([ /]|$)|webpack(-dev-server| serve)|astro dev|nuxt dev|remix dev|storybook dev|wrangler dev|shopify theme dev|(npm|bun) (run )?(dev|start)|(pnpm|yarn)\b.*\b(dev|start)\b/;
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'nu', 'tmux', 'screen', 'login']);
const AGENTS = new Set(['claude', 'codex', 'cursor-agent', 't3']);

const now = () => Date.now() / 1000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 64 << 20 });

function parseArgs(argv) {
  const opts = { command: argv[0], dryRun: false, quiet: false, idle: null, wait: 120, roots: [], port: null, exec: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      opts.exec = argv.slice(i + 1);
      break;
    }
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--idle') opts.idle = duration(argv[++i]);
    else if (a === '--wait') opts.wait = duration(argv[++i]);
    else if (a === '--root') opts.roots.push(realpathSync(argv[++i]));
    else throw new Error(`Unknown option ${a}`);
  }
  return opts;
}

function duration(text) {
  const m = /^(\d+)(s|m|h)?$/.exec(text ?? '');
  if (!m) throw new Error(`Not a duration: ${text}. Use a number of seconds, or 30s, 10m, 1h.`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2] ?? 's'];
}

export function pressure() {
  const forced = process.env.DEVSERVERS_PRESSURE;
  if (forced) return forced;
  if (process.platform === 'darwin') {
    const level = Number(run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']).stdout);
    return level >= 4 ? 'critical' : level >= 2 ? 'warning' : 'normal';
  }
  try {
    const psi = readFileSync('/proc/pressure/memory', 'utf8');
    const avg = (kind) => Number(new RegExp(`^${kind} avg10=\\S+ avg60=(\\S+)`, 'm').exec(psi)?.[1] ?? 0);
    const info = readFileSync('/proc/meminfo', 'utf8');
    const kb = (key) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(info)?.[1] ?? 0);
    const available = kb('MemAvailable') / (kb('MemTotal') || 1);
    if (avg('full') >= 5 || available < 0.05) return 'critical';
    if (avg('some') >= 10 || available < 0.15) return 'warning';
  } catch {}
  return 'normal';
}

function cpuSeconds(text) {
  const [days, rest] = text.includes('-') ? text.split('-') : ['0', text];
  return rest.split(':').reduce((sum, part) => sum * 60 + Number(part), 0) + Number(days) * 86400;
}

function processTable() {
  const table = new Map();
  const re = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s(.*)$/;
  for (const line of run('ps', ['-axww', '-o', 'pid=,ppid=,rss=,time=,stat=,lstart=,command=']).stdout.split('\n')) {
    const m = re.exec(line);
    // A zombie has exited and only waits for its parent to collect it.
    if (!m || m[5].startsWith('Z')) continue;
    table.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), cpu: cpuSeconds(m[4]), started: m[6], command: m[7], children: [] });
  }
  for (const line of run('ps', ['-axo', 'pid=,comm=']).stdout.split('\n')) {
    const m = /^\s*(\d+)\s(.*)$/.exec(line);
    const p = m && table.get(Number(m[1]));
    if (p) p.comm = m[2].trim();
  }
  for (const p of table.values()) table.get(p.ppid)?.children.push(p.pid);
  return table;
}

function lsofPairs(args) {
  const pairs = [];
  let pid = 0;
  for (const line of run('lsof', args).stdout.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n') pairs.push([pid, line.slice(1)]);
  }
  return pairs;
}

const portOf = (address) => Number(address.slice(address.lastIndexOf(':') + 1));

function cwds(pids) {
  const out = new Map();
  if (!pids.length) return out;
  if (process.platform === 'linux') {
    for (const pid of pids) {
      try {
        out.set(pid, readlinkSync(`/proc/${pid}/cwd`).replace(/ \(deleted\)$/, ''));
      } catch {}
    }
    return out;
  }
  for (const [pid, path] of lsofPairs(['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')])) out.set(pid, path);
  return out;
}

const checkoutCache = new Map();
function checkoutOf(dir) {
  if (checkoutCache.has(dir)) return checkoutCache.get(dir);
  let found = null;
  if (!existsSync(dir)) {
    if (dir.includes('/worktrees/')) found = { root: dir, gone: true };
  } else {
    const r = run('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir']);
    const [root, gitDir, commonDir] = r.stdout.trim().split('\n');
    if (r.status === 0 && gitDir !== commonDir) found = { root, gone: false };
  }
  checkoutCache.set(dir, found);
  return found;
}

function launchPorts(root) {
  try {
    return new Set(JSON.parse(readFileSync(join(root, '.claude', 'launch.json'), 'utf8')).configurations.map((c) => Number(c.port)).filter(Boolean));
  } catch {
    return new Set();
  }
}

const isWrapper = (p) => SHELLS.has(basename(p.comm ?? '').replace(/^-/, '')) && / -[a-z]*c( |$)/.test(p.command);
function isSession(p) {
  const name = basename(p.comm ?? '');
  if (name.startsWith('-') || AGENTS.has(name) || (p.comm ?? '').includes('.app/Contents/')) return true;
  if (/\/(claude|cursor-agent)\/versions\//.test(p.command)) return true;
  return SHELLS.has(name) && !isWrapper(p);
}

const inside = (dir, root) => dir === root || dir.startsWith(root + '/');

function descendants(table, pid) {
  const out = [];
  const queue = [pid];
  while (queue.length) {
    const p = queue.shift();
    out.push(p);
    queue.push(...(table.get(p)?.children ?? []));
  }
  return out;
}

// Each server is one process tree: the listener and its ancestors in the same checkout, up to
// the first agent, interactive shell, or process outside it, then everything under that root.
export function discover(roots = []) {
  const table = processTable();
  const uid = String(process.getuid());
  const listeners = new Map();
  for (const [pid, name] of lsofPairs(['-nP', '-a', '-u', uid, '-iTCP', '-sTCP:LISTEN', '-Fpn'])) {
    if (!listeners.has(pid)) listeners.set(pid, new Set());
    listeners.get(pid).add(portOf(name));
  }
  const candidates = [...listeners.keys()].filter((pid) => table.has(pid));
  const ancestry = new Set();
  for (const pid of candidates) for (let p = table.get(pid); p && p.pid > 1; p = table.get(p.ppid)) ancestry.add(p.pid);
  const dirs = cwds([...ancestry]);
  const self = new Set();
  for (let p = table.get(process.pid); p && p.pid > 1; p = table.get(p.ppid)) self.add(p.pid);

  const servers = new Map();
  for (const pid of candidates) {
    const listener = table.get(pid);
    const dir = dirs.get(pid);
    const checkout = dir && checkoutOf(dir);
    if (!checkout || isSession(listener) || self.has(pid)) continue;
    if (roots.length && !roots.some((r) => inside(checkout.root, r))) continue;
    let root = listener;
    for (;;) {
      const parent = table.get(root.ppid);
      const parentDir = parent && dirs.get(parent.pid);
      if (!parent || parent.pid <= 1 || !parentDir || !inside(parentDir, checkout.root) || isSession(parent) || self.has(parent.pid)) break;
      root = parent;
    }
    const pids = descendants(table, root.pid).filter((p) => !self.has(p));
    const ports = listeners.get(pid);
    const chain = [];
    for (let p = listener; p; p = p.pid === root.pid ? null : table.get(p.ppid)) chain.push(p.command);
    const configured = [...ports].some((port) => launchPorts(checkout.root).has(port));
    if (!configured && !chain.some((c) => DEV_RE.test(c))) continue;
    const key = `${root.pid}-${Date.parse(root.started) / 1000 || 0}`;
    const known = servers.get(key);
    if (known) {
      for (const port of ports) known.ports.add(port);
      continue;
    }
    servers.set(key, { key, checkout: checkout.root, gone: checkout.gone, root: root.pid, started: root.started, ports: new Set(ports), pids });
  }

  const established = lsofPairs(['-nP', '-a', '-u', uid, '-iTCP', '-sTCP:ESTABLISHED', '-Fpn']);
  for (const s of servers.values()) {
    const set = new Set(s.pids);
    s.clients = established.filter(([pid, name]) => set.has(pid) && s.ports.has(portOf(name.split('->')[0]))).length;
    s.cpu = s.pids.reduce((sum, p) => sum + (table.get(p)?.cpu ?? 0), 0);
    s.rss = s.pids.reduce((sum, p) => sum + (table.get(p)?.rss ?? 0), 0);
  }
  return { servers: [...servers.values()], table };
}

function readState(key) {
  try {
    return JSON.parse(readFileSync(join(STATE, 'servers', `${key}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// One file per server, so parallel samplers never write the same file.
function sample(servers, full) {
  mkdirSync(join(STATE, 'servers'), { recursive: true });
  const t = now();
  for (const s of servers) {
    const prev = readState(s.key);
    const busy = prev && s.cpu - prev.cpu >= CPU_FLOOR + CPU_IDLE_RATE * (t - prev.sampledAt);
    s.activeAt = !prev || s.clients > 0 || busy ? t : prev.activeAt;
    s.idle = Math.max(0, t - s.activeAt);
    writeFileSync(join(STATE, 'servers', `${s.key}.json`), JSON.stringify({ checkout: s.checkout, ports: [...s.ports], cpu: s.cpu, sampledAt: t, activeAt: s.activeAt }));
  }
  if (!full) return;
  const live = new Set(servers.map((s) => `${s.key}.json`));
  for (const name of readdirSync(join(STATE, 'servers'))) if (!live.has(name)) rmSync(join(STATE, 'servers', name), { force: true });
}

function stop(server, table) {
  const identity = new Map(server.pids.map((p) => [p, table.get(p)?.started]));
  const alive = () => {
    const current = processTable();
    return [...identity].filter(([p, started]) => started && current.get(p)?.started === started).map(([p]) => p);
  };
  for (const p of identity.keys()) {
    try {
      process.kill(p, 'SIGTERM');
    } catch {}
  }
  const deadline = Date.now() + 10000;
  while (alive().length && Date.now() < deadline) sleep(250);
  for (const p of alive()) {
    try {
      process.kill(p, 'SIGKILL');
    } catch {}
  }
  sleep(200);
  return alive();
}

const mb = (kb) => `${Math.round(kb / 1024)} MB`;
const minutes = (s) => `${Math.floor(s / 60)}m`;
const describe = (s) => `${s.checkout}${s.gone ? ' (deleted)' : ''}${s.preview ? ' preview' : ''} port ${[...s.ports].join(',')} pid ${s.root} ${mb(s.rss)} resident`;

// A preview is the process `preview` started, recorded with its start time so a reused pid
// never counts. A record whose process has gone is deleted.
function markPreviews(servers, table) {
  const dir = join(STATE, 'previews');
  const live = [];
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    if (!name.endsWith('.json')) continue;
    try {
      const record = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (table.get(record.pid)?.started === record.started) live.push(record.pid);
      else rmSync(join(dir, name), { force: true });
    } catch {}
  }
  for (const s of servers) s.preview = live.some((pid) => s.pids.includes(pid));
}

function log(line) {
  mkdirSync(STATE, { recursive: true });
  appendFileSync(join(STATE, 'reaped.log'), `${new Date().toISOString()} ${line}\n`);
}

// Next.js 16.4 starts detached-flush.js when a dev server stops. It loads next.config through
// esbuild, whose service child keeps the event loop open, and it never calls process.exit, so
// it stays for days. Remove this once Next.js exits the flush on its own.
const FLUSH_RE = /next\/dist\/telemetry\/detached-flush\.js dev (.*?)(?: \S+\.json)?$/;
const FLUSH_LIMIT = 120;

function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function hungFlushes(table, roots, limit) {
  const t = now();
  return [...table.values()]
    .filter((p) => p.ppid === 1 && FLUSH_RE.test(p.command) && t - Date.parse(p.started) / 1000 >= limit)
    .map((p) => ({ dir: FLUSH_RE.exec(p.command)[1], root: p.pid, pids: descendants(table, p.pid), rss: descendants(table, p.pid).reduce((sum, c) => sum + table.get(c).rss, 0) }))
    .filter((f) => !roots.length || roots.some((r) => inside(real(f.dir), r)));
}

function reap({ idle, dryRun, quiet, roots }, level = pressure()) {
  const limit = idle ?? LIMITS[level] ?? LIMITS.normal;
  const { servers, table } = discover(roots);
  sample(servers, !roots.length);
  markPreviews(servers, table);
  let stopped = 0;
  for (const s of servers) {
    const own = s.preview && level !== 'critical' ? Math.max(limit, PREVIEW_LIMIT) : limit;
    if (s.clients > 0 || s.idle < own) {
      if (!quiet) console.log(`kept     ${describe(s)} ${s.clients ? `${s.clients} client(s)` : `idle ${minutes(s.idle)}`}`);
      continue;
    }
    if (dryRun) {
      console.log(`would stop ${describe(s)} idle ${minutes(s.idle)}`);
      continue;
    }
    const survivors = stop(s, table);
    const what = `${describe(s)} idle ${minutes(s.idle)} at ${level} memory pressure`;
    if (survivors.length) {
      console.error(`could not stop ${what}: pids ${survivors.join(' ')} still run`);
      log(`failed ${what}`);
    } else {
      stopped++;
      console.log(`stopped  ${what}`);
      log(`stopped ${what}`);
    }
  }
  for (const f of hungFlushes(table, roots, idle ?? FLUSH_LIMIT)) {
    const what = `Next.js telemetry flush ${f.dir} pid ${f.root} ${mb(f.rss)} resident`;
    if (dryRun) {
      console.log(`would stop ${what}`);
      continue;
    }
    if (stop(f, table).length) {
      console.error(`could not stop ${what}`);
      log(`failed ${what}`);
    } else {
      console.log(`stopped  ${what}`);
      log(`stopped ${what}`);
    }
  }
  if (!quiet) console.log(`${servers.length} dev server(s), ${stopped} stopped, idle limit ${minutes(limit)} at ${level} memory pressure`);
  return servers;
}

function status({ roots }) {
  const level = pressure();
  const { servers, table } = discover(roots);
  sample(servers, !roots.length);
  markPreviews(servers, table);
  console.log(`memory pressure ${level}, idle limit ${minutes(LIMITS[level] ?? LIMITS.normal)}`);
  for (const s of servers) console.log(`${s.clients ? 'active' : 'idle  '}  ${describe(s)} ${s.clients} client(s) idle ${minutes(s.idle)}`);
  if (!servers.length) console.log('no dev servers in linked worktrees');
  console.log(`log: ${join(STATE, 'reaped.log')}`);
}

function gate(opts) {
  const deadline = Date.now() + opts.wait * 1000;
  let level = pressure();
  for (;;) {
    if (level !== 'normal') locked(() => reap({ ...opts, quiet: true }, level));
    if (level !== 'critical') {
      console.log(`ok memory pressure ${level}`);
      return 0;
    }
    if (Date.now() >= deadline) break;
    sleep(Math.min(5000, deadline - Date.now()));
    level = pressure();
  }
  console.log(`memory pressure is ${level}. Defer the dev server, build, full test run, or browser test, and stop the servers this task started.`);
  for (const s of discover(opts.roots).servers) console.log(`  running ${describe(s)} ${s.clients} client(s)`);
  return EXIT_PRESSURE;
}

// Many agents fire hooks at once, so the stamp and the lock keep it to one reap at a time.
// A hook never fails or prints, so it cannot stop the agent that fired it.
function hook() {
  try {
    mkdirSync(STATE, { recursive: true });
    const stamp = join(STATE, 'hook.stamp');
    if (existsSync(stamp) && now() - statSync(stamp).mtimeMs / 1000 < HOOK_INTERVAL) return 0;
    writeFileSync(stamp, '');
    spawn(process.execPath, [fileURLToPath(import.meta.url), 'reap', '--quiet'], { detached: true, stdio: 'ignore' }).unref();
  } catch {}
  return 0;
}

function locked(fn) {
  const lock = join(STATE, 'reap.lock');
  mkdirSync(STATE, { recursive: true });
  try {
    mkdirSync(lock);
  } catch {
    try {
      if (now() - statSync(lock).mtimeMs / 1000 < LOCK_STALE) return null;
      utimesSync(lock, new Date(), new Date());
    } catch {
      return null;
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

const listening = (port) => Promise.all(['127.0.0.1', '::1'].map((host) => new Promise((done) => {
  const socket = connect({ port, host }, () => { socket.destroy(); done(true); });
  socket.once('error', () => done(false));
}))).then((hits) => hits.some(Boolean));

async function preview({ port, wait, exec }) {
  if (!(port > 0) || !exec.length) throw new Error(`preview needs --port and a command after --\n\n${USAGE}`);
  if (await listening(port)) {
    console.error(`port ${port} is already taken. Stop what listens there, or pick a free port.`);
    return 1;
  }
  mkdirSync(join(STATE, 'previews'), { recursive: true });
  const logFile = join(STATE, 'previews', `${port}.log`);
  const child = spawn(exec[0], exec.slice(1), { detached: true, stdio: ['ignore', openSync(logFile, 'w'), openSync(logFile, 'a')] });
  let exit = null;
  child.once('exit', (code, signal) => { exit = signal ?? `code ${code}`; });
  child.once('error', (error) => { exit = error.message; });
  const deadline = Date.now() + wait * 1000;
  while (exit === null && Date.now() < deadline && !(await listening(port))) await new Promise((r) => setTimeout(r, 250));
  if (exit !== null || !(await listening(port))) {
    if (exit === null) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }
    console.error(`the preview did not listen on port ${port}: ${exit === null ? `nothing after ${wait}s` : `its command exited, ${exit}`}. The end of ${logFile}:`);
    console.error(readFileSync(logFile, 'utf8').trimEnd().split('\n').slice(-20).join('\n'));
    return 1;
  }
  const started = processTable().get(child.pid)?.started;
  writeFileSync(join(STATE, 'previews', `${child.pid}.json`), JSON.stringify({ pid: child.pid, started, port, cwd: process.cwd() }));
  child.unref();
  console.log(`preview http://localhost:${port} pid ${child.pid} log ${logFile}`);
  return 0;
}

function main(argv) {
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
    console.log(USAGE);
    return argv.length ? 0 : 2;
  }
  const opts = parseArgs(argv);
  if (opts.command === 'hook') return hook();
  if (run('lsof', ['-v']).error) {
    console.error('lsof is not installed, so dev servers cannot be found.');
    return opts.command === 'gate' ? 0 : 1;
  }
  if (opts.command === 'status') return status(opts), 0;
  if (opts.command === 'reap') {
    if (locked(() => reap(opts)) === null && !opts.quiet) console.log('another reap is running');
    return 0;
  }
  if (opts.command === 'gate') return gate(opts);
  if (opts.command === 'preview') return preview(opts);
  throw new Error(`Unknown command ${opts.command}\n\n${USAGE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((code) => { process.exitCode = code; }, (error) => {
      console.error(error.message);
      process.exitCode = 2;
    });
}

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

const source = resolve('.');
const PORT = 4890 + (process.pid % 50);
let home;
let repo;
let server;
let env;
let openLog;

function exec(args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['bin/ui.mjs', '--port', String(PORT), ...args], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => done({ code, out }));
  });
}

before(async () => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'panel-home-')));
  repo = join(home, 'oner');
  cpSync(source, repo, {
    recursive: true,
    filter: (p) => !/\/(\.git|\.claude|\.oner|tests|docs|local|config\.json|\.build-state\.json|\.update-check\.json|\.local-clone-[^/]+)(\/|$)/.test(p.slice(source.length)) && !/\.panel-stats/.test(p),
  });
  execFileSync('git', ['-C', repo, 'init', '-q']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x']);
  const bin = join(home, 'bin');
  mkdirSync(bin);
  openLog = join(home, 'open.log');
  for (const name of ['open', 'xdg-open']) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "$1" >> "${openLog}"\n`);
    chmodSync(join(bin, name), 0o755);
  }
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho "gh: not logged in" >&2\nexit 1\n');
  chmodSync(join(bin, 'gh'), 0o755);
  env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` };
});

after(async () => {
  try {
    const { pid } = await (await fetch(`http://127.0.0.1:${PORT}/api/panel`)).json();
    process.kill(pid);
  } catch {}
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const url = (path) => `http://127.0.0.1:${PORT}${path}`;
let token;
async function post(path, body) {
  const res = await fetch(url(path), { method: 'POST', headers: { 'X-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('any number of --open runs leave one server and open the browser each time', async () => {
  const runs = await Promise.all([exec(['--open']), exec(['--open']), exec(['--open'])]);
  for (const run of runs) assert.equal(run.code, 0, run.out);
  const ports = new Set(runs.map((r) => /Panel: http:\/\/127\.0\.0\.1:(\d+)/.exec(r.out)?.[1]));
  assert.deepEqual([...ports], [String(PORT)]);
  const again = await exec([]);
  assert.equal(again.code, 0);
  assert.match(again.out, new RegExp(`:${PORT}/`));
  const { pid } = await (await fetch(url('/api/panel'))).json();
  assert.ok(pid);
  const opened = () => (existsSync(openLog) ? readFileSync(openLog, 'utf8').trim().split('\n').length : 0);
  for (let i = 0; i < 50 && opened() < 3; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(opened(), 3);
  assert.equal(await fetch(`http://127.0.0.1:${PORT + 1}/api/panel`).then(() => true, () => false), false);
  const page = await (await fetch(url('/'))).text();
  token = /const TOKEN = "([0-9a-f]+)"/.exec(page)?.[1];
  assert.ok(token);
});

test('a forged Host is refused, and a write needs the token', async () => {
  const forged = await new Promise((done) => {
    const child = spawn('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-H', 'Host: evil.example', url('/api/today')], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('exit', () => done(out));
  });
  assert.equal(forged, '403');
  for (const path of ['/api/local/save', '/api/config', '/api/today']) {
    assert.equal((await fetch(url(path), { method: 'POST', body: '{}' })).status, 403, path);
  }
  assert.equal((await fetch(url('/api/today'), { method: 'DELETE', headers: { 'X-Token': token } })).status, 405);
});

test('a path the URL parser refuses does not bring the server down', async () => {
  const code = execFileSync('curl', ['-s', '--path-as-is', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${PORT}//`], { encoding: 'utf8' });
  assert.ok(['400', '404', '500'].includes(code), code);
  assert.equal((await fetch(url('/api/panel'))).status, 200);
});

test('today answers at once, with each source saying where it stands', async () => {
  const body = await (await fetch(url('/api/today'))).json();
  assert.deepEqual(Object.keys(body.groups), ['waiting', 'running', 'finished']);
  assert.deepEqual(body.sources.map((s) => s.id), ['claude', 'codex', 'github', 'asks']);
  for (const s of body.sources) assert.ok(['ok', 'partial', 'failed', 'off', 'checking'].includes(s.state), s.id);
  const machine = await (await fetch(url('/api/machine'))).json();
  assert.deepEqual(machine.sources.map((s) => s.id), ['worktrees', 'servers']);
  assert.match(await (await fetch(url('/range.js'))).text(), /export function parseRange/);
  const stats = await (await fetch(url('/api/stats?from=2026-01-01'))).json();
  assert.deepEqual(stats.sources.map((s) => s.id), ['stats-claude', 'stats-codex', 'stats-grok', 'stats-prs']);
});

test('the editor saves through the real build, and a build refusal restores the file', async () => {
  const created = await post('/api/local/create', { name: 'panel-made', description: 'Made from the panel' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const installed = join(home, '.claude', 'skills', 'panel-made', 'SKILL.md');
  assert.equal(existsSync(installed), true);

  const file = (await (await fetch(url(`/api/local/file?path=${encodeURIComponent(created.body.path)}`))).json());
  const good = file.text.replace('# panel-made', '# panel-made\n\nEdited.');
  const saved = await post('/api/local/save', { path: file.path, text: good, baseHash: file.hash });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.match(readFileSync(installed, 'utf8'), /Edited\./);

  const refused = await post('/api/local/save', { path: file.path, text: 'no frontmatter at all', baseHash: saved.body.hash });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /frontmatter/);
  assert.equal(readFileSync(join(repo, 'local', file.path), 'utf8'), good);
  assert.match(readFileSync(installed, 'utf8'), /Edited\./);

  const cyrillic = `${good}\n${'Кириллица через границу чанка. '.repeat(8000)}\n`;
  const long = await post('/api/local/save', { path: file.path, text: cyrillic, baseHash: saved.body.hash });
  assert.equal(long.status, 200, JSON.stringify(long.body));
  assert.equal(readFileSync(join(repo, 'local', file.path), 'utf8'), cyrillic);
  const back = await post('/api/local/save', { path: file.path, text: good, baseHash: long.body.hash });
  assert.equal(back.status, 200);

  const stale = await post('/api/local/save', { path: file.path, text: 'x', baseHash: file.hash });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.disk, good);

  const removed = await post('/api/local/delete', { name: 'panel-made' });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(existsSync(installed), false);
  const restored = await post('/api/local/restore', { id: removed.body.id, name: 'panel-made' });
  assert.equal(restored.status, 200);
  assert.equal(existsSync(installed), true);
});

test('saving work recommendations writes config and executors.md, and a refused list leaves both', async () => {
  const assign = [{ work: 'code and API', executor: 'codex' }, { work: 'screens and copy', executor: 'claude' }];
  const saved = await post('/api/config', { assign });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.state.assignments, assign);
  assert.deepEqual(JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).executors.assign, assign);
  const table = join(home, '.claude', 'skills', 'lead', 'executors.md');
  assert.match(readFileSync(table, 'utf8'), /\| code and API \| codex \|\n\| screens and copy \| claude \|/);
  const refused = await post('/api/config', { assign: [...assign, { work: 'code and API', executor: 'claude' }] });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /executors\.assign\.2\.work: repeats an earlier entry/);
  assert.deepEqual(JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).executors.assign, assign);
  const cleared = await post('/api/config', { assign: [] });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.doesNotMatch(readFileSync(table, 'utf8'), /Recommendations/);
});

test('saving a personal repository downloads files and clearing it keeps the checkout', async () => {
  const remote = join(home, 'personal-remote');
  mkdirSync(remote);
  execFileSync('git', ['-C', remote, 'init', '-q', '-b', 'main']);
  writeFileSync(join(remote, 'downloaded.md'), 'Personal repository download.\n');
  execFileSync('git', ['-C', remote, 'add', '--all']);
  execFileSync('git', ['-C', remote, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'personal files']);
  const saved = await post('/api/config', { localRepository: remote });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.state.localRepository, remote);
  assert.equal(readFileSync(join(repo, 'local', 'downloaded.md'), 'utf8'), 'Personal repository download.\n');
  assert.equal(JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).local.repository, remote);
  const cleared = await post('/api/config', { localRepository: null });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.state.localRepository, null);
  assert.equal(existsSync(join(repo, 'local', '.git')), true);
  assert.equal(readFileSync(join(repo, 'local', 'downloaded.md'), 'utf8'), 'Personal repository download.\n');
  const refused = await post('/api/config', { localRepository: 'ext::unsafe' });
  assert.equal(refused.status, 400);
  assert.equal(JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).local.repository, null);
});

test('a server left from before an update of this checkout is replaced', async () => {
  const before = await (await fetch(url('/api/panel'))).json();
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'update']);
  const run = await exec(['--open']);
  assert.equal(run.code, 0, run.out);
  const after_ = await (await fetch(url('/api/panel'))).json();
  assert.notEqual(after_.pid, before.pid);
  assert.notEqual(after_.revision, before.revision);
});

test('a config.json with a mistake still serves the panel', async () => {
  writeFileSync(join(repo, 'config.json'), '{ "language": 5 }');
  const port = PORT + 30;
  const child = spawn(process.execPath, ['bin/ui.mjs', '--port', String(port)], { cwd: repo, env, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((done) => child.stdout.once('data', done));
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/today`)).status, 200);
    const state = await fetch(`http://127.0.0.1:${port}/api/state`);
    assert.equal(state.status, 400);
    assert.match((await state.json()).error, /language/);
  } finally {
    child.kill();
    rmSync(join(repo, 'config.json'));
  }
});

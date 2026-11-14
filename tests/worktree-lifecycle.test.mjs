import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, test } from 'node:test';

const wt = resolve('skills/worktree/wt.sh');
const tidy = resolve('skills/dev-tidy/dev-tidy');
const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const fixtures = [];
const children = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolvePromise => child.once('exit', resolvePromise));
      child.kill('SIGKILL');
      await stopped;
    }
  }
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function server(cwd, port = 0) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['-e', `require('http').createServer((q,s)=>s.end('fixture')).listen(${port},'127.0.0.1',function(){console.log(this.address().port)})`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.once('error', reject);
    child.stderr.on('data', data => reject(new Error(String(data))));
    child.stdout.once('data', data => resolvePromise({ child, port: Number(String(data).trim()) }));
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'port lifecycle '));
  fixtures.push(root);
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  mkdirSync(repo); mkdirSync(bin);
  const runGit = (...args) => execFileSync(git, ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  runGit('init', '-q', '-b', 'main');
  runGit('config', 'user.email', 'fixture@example.test');
  runGit('config', 'user.name', 'Fixture');
  writeFileSync(join(repo, '.gitignore'), '.claude/launch.json\n.claude/worktrees/\n');
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude/worktree.json'), JSON.stringify({ servers: [{ name: 'web', command: 'node server.mjs --port {port}', portRange: [38101, 38110] }] }));
  writeFileSync(join(repo, 'content'), 'initial\n');
  runGit('add', '.'); runGit('commit', '-qm', 'Initialize fixture');
  const sha = runGit('rev-parse', 'HEAD');
  runGit('remote', 'add', 'origin', 'https://github.com/fixture/project.git');
  runGit('update-ref', 'refs/remotes/origin/main', sha);
  runGit('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nfor arg in "$@"; do [ "$arg" = fetch ] && exit 0; done\nexec '${git}' "$@"\n`, { mode: 0o755 });
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\n[ "${FAIL_GH:-}" = 1 ] && exit 1\nprintf "feature\\t%s\\t%s\\n" "$FIXTURE_SHA" "${FIXTURE_STATE:-MERGED}"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_SHA: sha,
    DEV_TIDY_CLAUDE_SESSIONS: join(root, 'sessions'), DEV_TIDY_CODEX_HOME: join(root, 'codex'), DEV_TIDY_T3_HOME: join(root, 't3') };
  const worktree = (name) => { const dir = join(repo, '.claude/worktrees', name); runGit('worktree', 'add', '-qb', name, dir); return dir; };
  const launch = (dir, port = 38101) => { mkdirSync(join(dir, '.claude'), { recursive: true }); writeFileSync(join(dir, '.claude/launch.json'), JSON.stringify({ version: '0.0.1', configurations: [{ name: 'web', runtimeExecutable: 'node', runtimeArgs: ['server.mjs', '--port', String(port)], port }] })); };
  const run = (script, args, cwd = repo, extraEnv = {}) => spawnSync('bash', [script, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000 });
  return { root, repo, env, sha, runGit, worktree, launch, run };
}

function t3State(f, dir, { settled = true, running = false, session = false, custom = false, subagent = false, shared = false } = {}) {
  const userdata = join(f.env.DEV_TIDY_T3_HOME, 'userdata');
  mkdirSync(userdata, { recursive: true });
  writeFileSync(join(userdata, 'settings.json'), JSON.stringify(custom ? { worktreesDirectory: join(f.root, 'custom-checkouts') } : {}));
  const thread = { id: 'thread', projectId: 'project', branch: 'feature', worktreePath: dir,
    deletedAt: null, archivedAt: null, settledAt: settled ? '2026-01-01T00:00:00Z' : null,
    lineage: { parentThreadId: null, relationshipToParent: null } };
  const threads = [thread];
  if (subagent) threads.push({ ...thread, id: 'child', settledAt: null, lineage: { parentThreadId: 'thread', relationshipToParent: 'subagent' } });
  if (shared) threads.push({ ...thread, id: 'independent', settledAt: null });
  const result = spawnSync('python3', ['-c', `
import sqlite3,sys,json
data=json.load(sys.stdin)
c=sqlite3.connect(sys.argv[1])
c.execute('CREATE TABLE IF NOT EXISTS projection_projects (project_id TEXT, workspace_root TEXT)')
c.execute('DELETE FROM projection_projects')
c.execute('INSERT INTO projection_projects VALUES (?,?)',('project',data['repo']))
c.execute('CREATE TABLE IF NOT EXISTS orchestration_v2_projection_threads (payload_json TEXT)')
c.execute('DELETE FROM orchestration_v2_projection_threads')
c.executemany('INSERT INTO orchestration_v2_projection_threads VALUES (?)',[(json.dumps(t),) for t in data['threads']])
for table in ['runs','runtime_requests','subagents']:
 c.execute('CREATE TABLE IF NOT EXISTS orchestration_v2_projection_'+table+' (thread_id TEXT, status TEXT)')
 c.execute('DELETE FROM orchestration_v2_projection_'+table)
if data['running']: c.execute("INSERT INTO orchestration_v2_projection_runs VALUES ('thread','running')")
c.execute('CREATE TABLE IF NOT EXISTS orchestration_v2_effect_outbox (thread_id TEXT, status TEXT)')
c.execute('CREATE TABLE IF NOT EXISTS orchestration_v2_projection_provider_sessions (payload_json TEXT, status TEXT)')
c.execute('DELETE FROM orchestration_v2_projection_provider_sessions')
if data['session']: c.execute('INSERT INTO orchestration_v2_projection_provider_sessions VALUES (?,?)',(json.dumps({'cwd':data['dir']}),'ready'))
c.commit()
`, join(userdata, 'statev2.sqlite')], { input: JSON.stringify({ repo: f.repo, dir, threads, running, session }), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function dockerFixture(f) {
  const home = join(f.root, 'wp-env'); const project = 'wp-env-fixture';
  mkdirSync(join(home, project), { recursive: true });
  const core = join(home, project, 'WordPress'); mkdirSync(core); f.runGit('-C', core, 'init', '-qb', 'main');
  writeFileSync(join(home, project, 'docker-compose.yml'), `services:\n  wordpress:\n    volumes:\n      - '${core}:/var/www/html'\n      - '${f.repo}:/var/www/html/wp-content/plugins/fixture'\n`);
  const statePath = join(f.root, 'docker.json');
  const initial = { running: ['container'], volumes: ['database', 'uploads'], images: [
    { tag: `${project}-wordpress:latest`, id: 'used' },
    { tag: `${project}-cli:latest`, id: 'unused' },
    { tag: 'redis:latest', id: 'redis' },
  ] };
  writeFileSync(statePath, JSON.stringify(initial));
  writeFileSync(join(f.root, 'bin/docker'), `#!${process.execPath}
const fs = require('node:fs');
const path = ${JSON.stringify(statePath)};
const s = JSON.parse(fs.readFileSync(path));
const a = process.argv.slice(2);
const out = x => process.stdout.write(x + '\\n');
const busy = () => require('node:child_process').execFileSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute(\\"INSERT INTO orchestration_v2_projection_runs VALUES ('thread','running')\\"); c.commit()", s.database]);
if (a[0] === 'info') process.exit(0);
if (a[0] === 'ps' && a.includes('-q') && s.busyAt === 'inventory') busy();
if (a[0] === 'ps') out((a.includes('-q') ? s.running : ['container']).join('\\n'));
if (a[0] === 'inspect') {
  if (s.failInspect) process.exit(1);
  out('sha256:used');
}
if (a[0] === 'images' && a.includes('--format')) {
  const format = a[a.indexOf('--format') + 1];
  if (format.includes('.Tag')) out(s.images.map(i => i.tag + '|' + i.id).join('\\n'));
}
if (a[0] === 'stop') {
  if (s.failStop) { console.error('stop failed'); process.exit(1); }
  s.running = s.running.filter(id => id !== a[1]);
  if (s.busyAt === 'stop') busy();
}
if (a[0] === 'rmi') s.images = s.images.filter(i => i.tag !== a[1]);
if (['rm', 'volume'].includes(a[0])) { console.error('data deletion forbidden'); process.exit(1); }
fs.writeFileSync(path, JSON.stringify(s));
`, { mode: 0o755 });
  return { home, initial, read: () => JSON.parse(readFileSync(statePath)),
    write: state => writeFileSync(statePath, JSON.stringify(state)) };
}

function serverRange(dir, port, names = ['web']) {
  const range = [Math.max(1024, port - 10), Math.min(65535, port + 10)];
  writeFileSync(join(dir, '.claude/worktree.json'), JSON.stringify({ servers: names.map(name => ({ name, command: 'node server.mjs --port {port}', portRange: range })) }));
  return range;
}

test('adopt repairs copied ports and keeps its assignment on repeat', () => {
  const f = fixture(); const dir = f.worktree('feature');
  f.launch(f.repo); f.launch(dir);
  const first = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(first.status, 0, first.stderr);
  const port = JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port;
  assert.equal(port, 38102);
  const repeat = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /ports   kept/);
});

test('parallel adopt reserves different ports', async () => {
  const f = fixture(); const dirs = [f.worktree('one'), f.worktree('two')];
  await Promise.all(dirs.map(cwd => new Promise((resolvePromise, reject) => {
    const child = spawn('bash', [wt, 'adopt', '--no-install'], { cwd, env: f.env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('exit', code => { try { assert.equal(code, 0, stderr); resolvePromise(); } catch (error) { reject(error); } });
  })));
  const ports = dirs.map(dir => JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port);
  assert.deepEqual(ports.sort(), [38101, 38102]);
});

test('allocation recovers after its owner dies before publishing a port', () => {
  const f = fixture(); const dir = f.worktree('feature');
  const lock = join(f.runGit('rev-parse', '--path-format=absolute', '--git-common-dir'), 'worktree-ports.lock');
  const killed = join(f.root, 'allocator-killed');
  writeFileSync(join(f.root, 'bin/mkdir'), `#!/bin/sh
/bin/mkdir "$@" || exit $?
if [ "$1" = '${lock}' ] && [ ! -e '${killed}' ]; then
  touch '${killed}'
  kill -KILL "$PPID"
fi
`, { mode: 0o755 });
  writeFileSync(join(f.root, 'bin/git'), `#!/bin/sh
for arg in "$@"; do [ "$arg" = fetch ] && exit 0; done
'${git}' "$@"
result=$?
case "$*" in
  *'update-ref refs/oner/worktree-ports '*)
    if [ "$result" = 0 ] && [ ! -e '${killed}' ]; then
      touch '${killed}'
      kill -KILL "$PPID"
    fi ;;
esac
exit "$result"
`, { mode: 0o755 });
  writeFileSync(join(f.root, 'bin/sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const interrupted = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(interrupted.signal, 'SIGKILL');
  const result = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port, 38101);
  assert.equal(f.runGit('for-each-ref', '--format=%(refname)', 'refs/oner/worktree-ports'), '');
});

test('a copied duplicate cannot move a running checkout reservation', async () => {
  const f = fixture(); const dir = f.worktree('feature'); const copied = f.worktree('copied');
  const own = await server(dir);
  const range = serverRange(dir, own.port);
  serverRange(copied, own.port);
  f.launch(dir, own.port); f.launch(copied, own.port);
  const result = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port, own.port);
  assert.equal(own.child.exitCode, null);
  const repair = f.run(wt, ['adopt', '--no-install'], copied);
  assert.equal(repair.status, 0, repair.stderr);
  const reassigned = JSON.parse(readFileSync(join(copied, '.claude/launch.json'))).configurations[0].port;
  assert.notEqual(reassigned, own.port);
  assert.ok(Number.isInteger(reassigned) && reassigned >= range[0] && reassigned <= range[1]);
  assert.equal(own.child.exitCode, null);
});

test('an unreadable listener identity cannot retain a reserved port', () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  writeFileSync(join(f.root, 'bin/lsof'), `#!/bin/sh
case "$*" in
  *-tiTCP:38101*) exit 0 ;;
  *-iTCP:38101*) exit 0 ;;
esac
exit 1
`, { mode: 0o755 });
  const result = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port, 38102);
});

test('overlapping server ranges still assign distinct ports with an owned listener', async () => {
  const f = fixture(); const dir = f.worktree('feature');
  const own = await server(dir);
  const range = serverRange(dir, own.port, ['web', 'admin']);
  f.launch(dir, own.port);
  const result = f.run(wt,['adopt','--no-install'],dir);
  assert.equal(result.status,0,result.stderr);
  const ports = JSON.parse(readFileSync(join(dir,'.claude/launch.json'))).configurations.map(c=>c.port);
  assert.equal(ports[0], own.port);
  assert.equal(new Set(ports).size, 2);
  assert.ok(ports.every(port => Number.isInteger(port) && port >= range[0] && port <= range[1]));
});

test('port cleanup waits for the same clone reservation as adopt', async () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  const waiting = join(f.root, 'cleanup-waiting');
  const owner = execFileSync(git, ['-C', f.repo, 'hash-object', '-w', '--stdin'], {input:`${process.pid}\nfixture\n`, encoding:'utf8'}).trim();
  f.runGit('update-ref','refs/oner/worktree-ports',owner);
  writeFileSync(join(f.root,'bin/git'), `#!/bin/sh
for arg in "$@"; do [ "$arg" = fetch ] && exit 0; done
case "$*" in *'rev-parse --verify refs/oner/worktree-ports'*) touch '${waiting}' ;; esac
exec '${git}' "$@"
`,{mode:0o755});
  const child=spawn('bash',[tidy,'--ports-only','--yes','--root',f.repo],{cwd:f.repo,env:f.env,stdio:'ignore'});
  children.push(child);
  const closed=new Promise(resolvePromise=>child.once('exit',resolvePromise));
  try {
    const deadline=Date.now()+5000;
    while(!existsSync(waiting)&&child.exitCode===null&&Date.now()<deadline) await new Promise(resolvePromise=>setTimeout(resolvePromise,20));
    assert.equal(existsSync(join(dir,'.claude/launch.json')),true);
    assert.equal(existsSync(waiting),true,'cleanup never attempted the shared allocator reservation');
    f.runGit('update-ref','-d','refs/oner/worktree-ports',owner);
    assert.equal(await closed,0);
    assert.equal(existsSync(join(dir,'.claude/launch.json')),false);
  } finally {
    f.runGit('update-ref','-d','refs/oner/worktree-ports');
  }
});

test('port repair cannot replace the primary checkout fixed assignment', () => {
  const f = fixture(); f.launch(f.repo);
  const result = f.run(wt, ['ports', f.repo]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /primary checkout/);
  assert.equal(JSON.parse(readFileSync(join(f.repo, '.claude/launch.json'))).configurations[0].port, 38101);
});

test('ports-only dry run leaves launch, code, worktree and branch intact', () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  writeFileSync(join(dir, 'content'), 'uncommitted work\n');
  const result = f.run(tidy, ['--ports-only', '--kept', '--root', f.repo]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Released 1 launch reservation\(s\).*Apply: false/);
  assert.equal(existsSync(join(dir, '.claude/launch.json')), true);
  assert.equal(readFileSync(join(dir, 'content'), 'utf8'), 'uncommitted work\n');
});

test('ports-only releases a closed task with dirty files and adopt restores it', () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  writeFileSync(join(dir, 'content'), 'uncommitted work\n');
  const args = ['--ports-only', '--yes', '--root', f.repo];
  const result = f.run(tidy, args, f.repo, { FIXTURE_STATE: 'CLOSED' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, '.claude/launch.json')), false);
  assert.equal(readFileSync(join(dir, 'content'), 'utf8'), 'uncommitted work\n');
  assert.match(f.runGit('branch', '--list', 'feature'), /feature/);
  const gitdir = execFileSync(git, ['-C', dir, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  assert.equal(JSON.parse(readFileSync(join(gitdir, 'launch.released.json'))).configurations[0].port, 38101);
  const repeat = f.run(tidy, args, f.repo, { FIXTURE_STATE: 'CLOSED' });
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /Released 0 launch reservation/);
  const resume = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(resume.status, 0, resume.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port, 38101);
});

test('ports-only retains open tasks and reports unconfirmed completion', () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  const other = f.worktree('abandoned'); f.launch(other, 38102);
  const result = f.run(tidy, ['--ports-only', '--yes', '--kept', '--root', f.repo], f.repo, { FIXTURE_STATE: 'OPEN' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pull request still open/);
  assert.match(result.stdout, /completion unconfirmed/);
  assert.equal(existsSync(join(dir, '.claude/launch.json')), true);
  assert.equal(existsSync(join(other, '.claude/launch.json')), true);
});

test('failed GitHub lookup reports failure and keeps reservations', () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  const result = f.run(tidy, ['--ports-only', '--yes', '--root', f.repo], f.repo, { FAIL_GH: '1' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Could not read pull requests/);
  assert.equal(existsSync(join(dir, '.claude/launch.json')), true);
});

test('adopt keeps a running own server but reallocates a foreign listener', async () => {
  const f = fixture(); const dir = f.worktree('feature');
  const own = await server(dir);
  const range = serverRange(dir, own.port);
  f.launch(dir, own.port);
  const first = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port, own.port);
  const stopped = new Promise(resolvePromise => own.child.once('exit', resolvePromise));
  own.child.kill(); await stopped;
  const foreign = await server(f.repo, own.port);
  const second = f.run(wt, ['adopt', '--no-install'], dir);
  assert.equal(second.status, 0, second.stderr);
  const reassigned = JSON.parse(readFileSync(join(dir, '.claude/launch.json'))).configurations[0].port;
  assert.notEqual(reassigned, own.port);
  assert.ok(Number.isInteger(reassigned) && reassigned >= range[0] && reassigned <= range[1]);
  assert.equal(foreign.child.exitCode, null);
});

test('ports-only stops a real orphan server despite its surviving cache directory', async () => {
  const f = fixture();
  const cwd = join(f.root, '.codex/worktrees/removed/repo/apps/dashboard');
  mkdirSync(cwd, { recursive: true });
  const orphan = await server(cwd);
  const workerFile = join(cwd, '.next/dev/build/chunks/worker.js');
  mkdirSync(resolve(workerFile, '..'), { recursive: true });
  writeFileSync(workerFile, 'setInterval(()=>{},1000); console.log("ready")');
  const worker = spawn(process.execPath, [workerFile], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(worker);
  await new Promise((resolvePromise, reject) => { worker.once('error', reject); worker.stdout.once('data', resolvePromise); });
  const result = f.run(tidy, ['--ports-only', '--yes', '--root', f.root]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /left over from deleted worktree/);
  const probe = spawnSync('lsof', ['-nP', `-iTCP:${orphan.port}`, '-sTCP:LISTEN']);
  assert.notEqual(probe.status, 0, 'orphan server still holds its port');
  const workerProbe = spawnSync('ps', ['-o', 'stat=', '-p', String(worker.pid)], { encoding: 'utf8' });
  assert.ok(workerProbe.status !== 0 || workerProbe.stdout.trim().startsWith('Z'), 'dev compiler worker survived cleanup');
  assert.equal(existsSync(cwd), true);
});

test('ports-only defers a completed task while a real build process runs', async () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir);
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000); console.log("ready")', 'build'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  await new Promise((resolvePromise, reject) => { child.once('error', reject); child.stdout.once('data', resolvePromise); });
  const result = f.run(tidy, ['--ports-only', '--yes', '--kept', '--root', f.repo]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /build, test, install, or migration running/);
  assert.equal(existsSync(join(dir, '.claude/launch.json')), true);
  assert.equal(child.exitCode, null);
});

test('orphan cleanup retains support for a deleted directory in another editor', async () => {
  const f = fixture();
  const cwd = join(f.root, '.cursor/worktrees/deleted');
  mkdirSync(cwd, { recursive: true });
  const orphan = await server(cwd);
  rmSync(cwd, { recursive: true });
  const result = f.run(tidy, ['--ports-only', '--yes', '--root', f.root]);
  assert.equal(result.status, 0, result.stderr);
  const probe = spawnSync('lsof', ['-nP', `-iTCP:${orphan.port}`, '-sTCP:LISTEN']);
  assert.notEqual(probe.status, 0, 'server in a deleted editor directory still holds its port');
});

test('a merged worktree that still holds an open oneshot run or series stage is kept', () => {
  const f = fixture(); const dir = f.worktree('feature');
  writeFileSync(join(f.repo, '.git/info/exclude'), '.specs/\n');
  const tidyRun = () => f.run(tidy, ['--kept', '--skip-docker', '--skip-wp-env', '--root', f.repo]).stdout;
  assert.match(tidyRun(), /worktree {2}feature {2}\[feature\]/);

  mkdirSync(join(dir, '.specs/001-feature'), { recursive: true });
  const log = join(dir, '.specs/001-feature/oneshot.md');
  writeFileSync(log, 'Lane. feature\nBranch. feature\nStatus. waiting\n');
  assert.match(tidyRun(), /kept {6}worktree feature {2}\(open oneshot run\)/);

  writeFileSync(log, 'Lane. feature\nBranch. feature\nStatus. done\n');
  mkdirSync(join(f.repo, '.specs/002-limits'), { recursive: true });
  const program = join(f.repo, '.specs/002-limits/program.json');
  const stage = (state) => writeFileSync(program, JSON.stringify({ status: 'running', stages: [{ id: 'one', branch: 'feature', state }] }));
  stage('merged');
  let out = tidyRun();
  assert.match(out, /kept {6}worktree feature {2}\(stage of an open oneshot series\)/);
  assert.doesNotMatch(out, /^ {2}branch {4}feature/m);

  stage('done');
  assert.match(tidyRun(), /worktree {2}feature {2}\[feature\]/);
  out = f.run(tidy, ['--kept', '--skip-docker', '--skip-wp-env', '--keep', dir, '--root', f.repo]).stdout;
  assert.match(out, /kept {6}worktree feature {2}\(kept by --keep\)/);
});

test('a worktree with an open session is kept, and one whose sessions are all archived goes once nothing would be lost', () => {
  const f = fixture();
  const sessions = join(f.root, 'sessions');
  mkdirSync(sessions);
  const session = (id, cwd, isArchived) => writeFileSync(join(sessions, `local_${id}.json`), JSON.stringify({ sessionId: id, cwd, isArchived }));
  const tidyRun = () => f.run(tidy, ['--kept', '--skip-docker', '--skip-wp-env', '--root', f.repo], f.repo,
    { DEV_TIDY_CLAUDE_SESSIONS: sessions, DEV_TIDY_CODEX_HOME: join(f.root, 'codex') }).stdout;

  const merged = f.worktree('feature');
  session('a', merged, false);
  assert.match(tidyRun(), /kept {6}worktree feature {2}\(session still open\)/);

  const idle = f.worktree('idle');
  assert.match(tidyRun(), /kept {6}worktree idle {2}\(no pull request, nothing of its own\)/);
  session('b', idle, true);
  session('c', idle, true);
  let out = tidyRun();
  assert.match(out, /worktree {2}idle {2}\[sessions archived\]/);

  writeFileSync(join(idle, 'work.txt'), 'work\n');
  f.runGit('-C', idle, 'add', '.');
  f.runGit('-C', idle, 'commit', '-qm', 'Unpushed work');
  out = tidyRun();
  assert.match(out, /kept {6}worktree idle {2}\(no pull request/);
  assert.doesNotMatch(out, /\[sessions archived\]/);

  f.runGit('update-ref', 'refs/remotes/origin/idle', f.runGit('-C', idle, 'rev-parse', 'HEAD'));
  assert.match(tidyRun(), /worktree {2}idle {2}\[sessions archived\]/);
});

test('Turborepo cache entries older than a week go, newer ones stay', () => {
  const f = fixture();
  const cache = join(f.repo, '.turbo/cache');
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, 'old.tar.zst'), 'x'.repeat(4096));
  writeFileSync(join(cache, 'new.tar.zst'), 'x'.repeat(4096));
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  utimesSync(join(cache, 'old.tar.zst'), old, old);
  const args = ['--skip-docker', '--skip-wp-env', '--root', f.repo];
  assert.match(f.run(tidy, args).stdout, /turbo {5}.*\.turbo\/cache {2}\(\d+M older than 7 days\)/);
  assert.equal(existsSync(join(cache, 'old.tar.zst')), true);
  const applied = f.run(tidy, ['--yes', ...args]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(existsSync(join(cache, 'old.tar.zst')), false);
  assert.equal(existsSync(join(cache, 'new.tar.zst')), true);
  assert.doesNotMatch(f.run(tidy, ['--skip-turbo', ...args]).stdout, /turbo /);
});

test('T3 cleanup removes a landed settled checkout and keeps its resumable branch', () => {
  const f = fixture(); const original = f.worktree('feature');
  const dir = join(f.env.DEV_TIDY_T3_HOME, 'worktrees/project/t3-fixture');
  mkdirSync(join(dir, '..'), { recursive: true }); f.runGit('worktree', 'move', original, dir);
  t3State(f, dir, { subagent: true });
  const sessions = join(f.env.DEV_TIDY_CODEX_HOME, 'sessions'); mkdirSync(sessions, { recursive: true });
  writeFileSync(join(sessions, 't3.jsonl'), JSON.stringify({ type: 'session_meta', payload: { cwd: dir } }) + '\n');
  const args = ['--root', join(f.env.DEV_TIDY_T3_HOME, 'worktrees'), '--skip-docker', '--skip-wp-env', '--skip-turbo', '--kept'];
  const dry = f.run(tidy, args); assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Would remove 1 worktree\(s\), 0 branch/); assert.ok(existsSync(dir));
  const applied = f.run(tidy, ['--yes', ...args]); assert.equal(applied.status, 0, applied.stderr);
  assert.equal(existsSync(dir), false); assert.equal(f.runGit('rev-parse', 'feature'), f.sha);
  const repeat = f.run(tidy, ['--yes', ...args, '--root', f.repo]);
  assert.equal(repeat.status, 0, repeat.stderr); assert.equal(f.runGit('rev-parse', 'feature'), f.sha);
});

test('T3 custom checkouts keep open, running and connected tasks in both cleanup modes', () => {
  const f = fixture(); const original = f.worktree('feature');
  const dir = join(f.root, 'custom-checkouts/t3-fixture'); mkdirSync(join(dir, '..'), { recursive: true });
  f.runGit('worktree', 'move', original, dir); f.launch(dir);
  for (const state of [{ settled: false }, { running: true }, { session: true }, { shared: true }]) {
    t3State(f, dir, { custom: true, ...state });
    for (const mode of [[], ['--ports-only']]) {
      const result = f.run(tidy, ['--yes', '--kept', '--root', f.root, '--skip-docker', '--skip-wp-env', '--skip-turbo', ...mode]);
      assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /T3 Code task/);
      assert.ok(existsSync(join(dir, '.claude/launch.json'))); assert.equal(f.runGit('rev-parse', 'feature'), f.sha);
    }
  }
});

test('unreadable T3 state preserves its checkout, launch settings and branch', () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir); t3State(f, dir);
  writeFileSync(join(f.env.DEV_TIDY_T3_HOME, 'userdata/statev2.sqlite'), 'invalid database');
  for (const mode of [[], ['--ports-only']]) {
    const result = f.run(tidy, ['--yes', '--kept', '--root', f.repo, '--skip-docker', '--skip-wp-env', '--skip-turbo', ...mode]);
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /T3 Code state unavailable/);
    assert.ok(existsSync(join(dir, '.claude/launch.json'))); assert.equal(f.runGit('rev-parse', 'feature'), f.sha);
  }
});

test('T3 port cleanup preserves open runs and stops a settled task server', async () => {
  const f = fixture(); const dir = f.worktree('feature'); f.launch(dir); t3State(f, dir);
  const live = await server(dir);
  writeFileSync(join(f.repo, '.git/info/exclude'), '.specs/\n');
  const log = join(dir, '.specs/001-feature/oneshot.md'); mkdirSync(join(log, '..'), { recursive: true });
  writeFileSync(log, 'Status. waiting\n');
  const args = ['--yes', '--ports-only', '--root', f.repo, '--kept'];
  const kept = f.run(tidy, args); assert.equal(kept.status, 0, kept.stderr); assert.ok(existsSync(join(dir, '.claude/launch.json')));
  writeFileSync(log, 'Status. done\n');
  const result = f.run(tidy, args); assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, '.claude/launch.json')), false);
  assert.notEqual(spawnSync('lsof', ['-nP', `-iTCP:${live.port}`, '-sTCP:LISTEN']).status, 0);
});

test('T3 orphan cleanup finds a deleted custom checkout despite surviving cache directories', async () => {
  const f = fixture(); const dir = join(f.root, 'custom-checkouts/project/t3-fixture');
  mkdirSync(dir, { recursive: true }); t3State(f, dir, { custom: true });
  const live = await server(dir); rmSync(dir, { recursive: true }); mkdirSync(join(dir, '.next/cache'), { recursive: true });
  const result = f.run(tidy, ['--ports-only', '--yes', '--root', f.root]);
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(spawnSync('lsof', ['-nP', `-iTCP:${live.port}`, '-sTCP:LISTEN']).status, 0);
});

test('forced cleanup cannot drop an active T3 checkout', () => {
  const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir, { running: true });
  const result = f.run(tidy, ['--drop', dir, '--yes']);
  assert.equal(result.status, 1); assert.ok(existsSync(dir)); assert.equal(f.runGit('rev-parse', 'feature'), f.sha);
});

test('cache reclamation preserves work while removing ignored caches only when idle', async () => {
  const f = fixture(); const dir = f.worktree('feature');
  f.runGit('config', 'core.excludesFile', join(f.root, 'excludes'));
  writeFileSync(join(f.root, 'excludes'), 'node_modules/\n.next/\n.specs/\n');
  t3State(f, dir, { settled: false, session: true });
  const cache = join(dir, 'node_modules/package'); const next = join(dir, 'apps/web/.next');
  mkdirSync(cache, { recursive: true }); mkdirSync(next, { recursive: true });
  writeFileSync(join(cache, 'index.js'), 'cached dependency'); writeFileSync(join(next, 'build'), 'cached build');
  writeFileSync(join(dir, 'draft'), 'uncommitted work');
  const args = ['--reclaim-caches', '--skip-git', '--skip-turbo', '--skip-docker', '--skip-wp-env', '--root', f.repo];
  const dry = f.run(tidy, args); assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /rebuildable/); assert.ok(existsSync(cache));
  const kept = f.run(tidy, ['--yes', '--keep', dir, ...args]); assert.equal(kept.status, 0, kept.stderr);
  assert.ok(existsSync(cache));
  t3State(f, dir, { running: true });
  assert.equal(f.run(tidy, ['--yes', ...args]).status, 0); assert.ok(existsSync(cache));
  t3State(f, dir, { settled: false, session: true });
  const live = await server(dir);
  assert.equal(f.run(tidy, ['--yes', ...args]).status, 0); assert.ok(existsSync(cache));
  const stopped = new Promise(resolvePromise => live.child.once('exit', resolvePromise)); live.child.kill(); await stopped;
  const log = join(dir, '.specs/001/oneshot.md'); mkdirSync(join(log, '..'), { recursive: true });
  writeFileSync(log, 'Status. waiting\n');
  assert.equal(f.run(tidy, ['--yes', ...args]).status, 0); assert.ok(existsSync(cache));
  writeFileSync(log, 'Status. done\n');
  const applied = f.run(tidy, ['--yes', ...args]); assert.equal(applied.status, 0, applied.stderr);
  assert.equal(existsSync(cache), false); assert.equal(existsSync(next), false);
  assert.equal(readFileSync(join(dir, 'draft'), 'utf8'), 'uncommitted work');
  assert.equal(readFileSync(join(dir, 'content'), 'utf8'), 'initial\n');
  const repeat = f.run(tidy, ['--yes', ...args]); assert.equal(repeat.status, 0, repeat.stderr);
  assert.doesNotMatch(repeat.stdout, /rebuildable\)/);
});

test('cache reclamation preserves symlink targets, tracked files and unknown task state', () => {
  const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
  writeFileSync(join(f.repo, '.git/info/exclude'), 'node_modules/\n.next/\n');
  const shared = join(f.root, 'shared'); mkdirSync(shared); writeFileSync(join(shared, 'package'), 'shared');
  symlinkSync(shared, join(dir, 'node_modules'));
  mkdirSync(join(dir, '.next')); writeFileSync(join(dir, '.next/source'), 'tracked');
  f.runGit('-C', dir, 'add', '-f', '.next/source');
  const args = ['--yes', '--reclaim-caches', '--skip-git', '--skip-turbo', '--skip-docker', '--skip-wp-env', '--root', f.repo];
  assert.equal(f.run(tidy, args).status, 0);
  assert.equal(readFileSync(join(shared, 'package'), 'utf8'), 'shared');
  assert.equal(readFileSync(join(dir, '.next/source'), 'utf8'), 'tracked');
  f.runGit('-C', dir, 'reset', '-q', '--', '.next/source');
  writeFileSync(join(f.env.DEV_TIDY_T3_HOME, 'userdata/statev2.sqlite'), 'invalid');
  assert.equal(f.run(tidy, args).status, 0); assert.ok(existsSync(join(dir, '.next/source')));
});

test('cache reclamation preserves nested repository code and nested worktree runs', () => {
  for (const kind of ['repository', 'worktree', 'inside-cache']) {
    const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
    writeFileSync(join(f.repo, '.git/info/exclude'), 'vendor/\nnode_modules/\n');
    const nested = join(dir, kind === 'inside-cache' ? 'node_modules/package' : 'vendor/package');
    mkdirSync(nested, { recursive: true });
    if (kind === 'worktree') {
      rmSync(nested, { recursive: true }); f.runGit('worktree', 'add', '-qb', 'nested', nested);
    } else f.runGit('-C', nested, 'init', '-qb', 'main');
    mkdirSync(join(nested, '.next')); writeFileSync(join(nested, '.next/source'), 'tracked source');
    f.runGit('-C', nested, 'add', '.next/source');
    writeFileSync(join(nested, '.next/source'), 'uncommitted source');
    const result = f.run(tidy, ['--yes', '--reclaim-caches', '--skip-git', '--skip-turbo', '--skip-docker', '--skip-wp-env', '--root', f.repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(nested, '.next/source'), 'utf8'), 'uncommitted source', kind);
  }
});

test('cache reclamation finishes its own traversal before checking active processes', () => {
  const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
  writeFileSync(join(f.repo, '.git/info/exclude'), 'node_modules/\n');
  mkdirSync(join(dir, 'node_modules')); writeFileSync(join(dir, 'node_modules/package'), 'rebuildable');
  writeFileSync(join(f.root, 'bin/find'), '#!/bin/sh\n/usr/bin/find "$@"\ncase " $* " in *" -xdev "*) cd "$1" && sleep 2 ;; esac\n', { mode: 0o755 });
  const result = f.run(tidy, ['--yes', '--reclaim-caches', '--skip-git', '--skip-turbo', '--skip-docker', '--skip-wp-env', '--root', f.repo]);
  assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(join(dir, 'node_modules')), false);
});

test('cache reclamation rechecks activity after either ownership scan', () => {
  for (const phase of [1, 2]) {
    const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
    writeFileSync(join(f.repo, '.git/info/exclude'), 'node_modules/\n');
    const cache = join(dir, 'node_modules'); mkdirSync(cache); writeFileSync(join(cache, 'package'), 'rebuildable');
    writeFileSync(join(f.root, 'bin/find'), `#!/bin/sh
/usr/bin/find "$@" || exit $?
if [ "$(basename "$1")" = node_modules ]; then
  count=0; [ ! -f "$SCAN_COUNT" ] || count=$(cat "$SCAN_COUNT")
  count=$((count + 1)); printf '%s' "$count" > "$SCAN_COUNT"
  if [ "$count" -eq "$SCAN_PHASE" ]; then
    python3 -c 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("INSERT INTO orchestration_v2_projection_runs VALUES (?,?)", ("thread","running")); c.commit()' "$SCAN_DB"
  fi
fi
`, { mode: 0o755 });
    const result = f.run(tidy, ['--yes', '--reclaim-caches', '--skip-git', '--skip-turbo', '--skip-docker', '--skip-wp-env', '--root', f.repo], f.repo,
      { SCAN_PHASE: String(phase), SCAN_COUNT: join(f.root, 'count'), SCAN_DB: join(f.env.DEV_TIDY_T3_HOME, 'userdata/statev2.sqlite') });
    assert.equal(result.status, 0, result.stderr); assert.ok(existsSync(join(cache, 'package')), `ownership scan ${phase}`);
  }
});

test('wp-env stop preserves data and unused image cleanup preserves referenced images', () => {
  const f = fixture(); const d = dockerFixture(f);
  const args = ['--skip-git', '--skip-turbo', '--root', f.repo]; const env = { WP_ENV_HOME: d.home };
  assert.equal(f.run(tidy, args, f.repo, env).status, 0); assert.deepEqual(d.read(), d.initial);
  const normal = f.run(tidy, ['--yes', ...args], f.repo, env); assert.equal(normal.status, 0, normal.stderr);
  assert.deepEqual(d.read(), { ...d.initial, images: [d.initial.images[0], d.initial.images[2]] });
  const dry = f.run(tidy, ['--stop-wp-env', ...args], f.repo, env); assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /wp-stop/); assert.deepEqual(d.read().running, ['container']);
  const kept = f.run(tidy, ['--stop-wp-env', '--yes', '--keep', join(d.home, 'wp-env-fixture/WordPress'), ...args], f.repo, env);
  assert.equal(kept.status, 0, kept.stderr); assert.deepEqual(d.read().running, ['container']);
  const stopped = f.run(tidy, ['--stop-wp-env', '--yes', ...args], f.repo, env);
  assert.equal(stopped.status, 0, stopped.stderr); assert.deepEqual(d.read().running, []);
  assert.deepEqual(d.read().volumes, ['database', 'uploads']);
  assert.deepEqual(d.read().images, [d.initial.images[0], d.initial.images[2]]);
  const repeat = f.run(tidy, ['--stop-wp-env', '--yes', ...args], f.repo, env);
  assert.equal(repeat.status, 0, repeat.stderr); assert.doesNotMatch(repeat.stdout, /wp-stop/);
});

test('wp-env stop defers active work and reports Docker failures without deleting data', () => {
  const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir, { running: true });
  const d = dockerFixture(f);
  const args = ['--stop-wp-env', '--yes', '--skip-git', '--skip-turbo', '--skip-docker', '--root', f.repo];
  const env = { WP_ENV_HOME: d.home };
  for (const target of ['wp-content/plugins/active', 'wp-content/themes/active', 'custom']) {
    writeFileSync(join(d.home, 'wp-env-fixture/docker-compose.yml'), `volumes:\n  - '${f.repo}:/var/www/html/wp-content/plugins/main'\n  - '${dir}:/var/www/html/${target}'\n`);
    assert.equal(f.run(tidy, args, f.repo, env).status, 0); assert.deepEqual(d.read(), d.initial, target);
  }
  t3State(f, dir);
  d.write({ ...d.initial, failStop: true });
  const failed = f.run(tidy, args, f.repo, env); assert.equal(failed.status, 1);
  assert.match(failed.stdout, /stop failed/); assert.deepEqual(d.read().running, ['container']);
  assert.deepEqual(d.read().volumes, ['database', 'uploads']);
  d.write({ ...d.initial, failInspect: true });
  const inspect = f.run(tidy, ['--yes', '--skip-git', '--skip-wp-env', '--skip-turbo', '--root', f.repo], f.repo, env);
  assert.equal(inspect.status, 1); assert.deepEqual(d.read().images, d.initial.images);
});

test('wp-env stop rechecks task state after inventory and between containers', () => {
  for (const phase of ['inventory', 'stop']) {
    const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
    const d = dockerFixture(f);
    writeFileSync(join(d.home, 'wp-env-fixture/docker-compose.yml'), `volumes:\n  - '${dir}:/var/www/html/wp-content/plugins/main'\n`);
    d.write({ ...d.initial, running: ['first', 'second'], busyAt: phase, database: join(f.env.DEV_TIDY_T3_HOME, 'userdata/statev2.sqlite') });
    const result = f.run(tidy, ['--yes', '--stop-wp-env', '--skip-git', '--skip-turbo', '--skip-docker', '--root', f.repo], f.repo, { WP_ENV_HOME: d.home });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(d.read().running, phase === 'inventory' ? ['first', 'second'] : ['second']);
    assert.deepEqual(d.read().volumes, ['database', 'uploads']);
  }
});

test('wp-env stop preserves an active runtime Git clone', () => {
  const f = fixture(); const d = dockerFixture(f);
  t3State(f, join(d.home, 'wp-env-fixture/WordPress'), { running: true });
  const result = f.run(tidy, ['--yes', '--stop-wp-env', '--skip-git', '--skip-turbo', '--skip-docker', '--root', f.repo], f.repo, { WP_ENV_HOME: d.home });
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(d.read(), d.initial);
});

test('wp-env stop preserves stack data when its source disappears after preview', () => {
  const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
  const d = dockerFixture(f);
  const compose = join(d.home, 'wp-env-fixture/docker-compose.yml');
  writeFileSync(compose, `volumes:\n  - '${dir}:/var/www/html/wp-content/plugins/main'\n`);
  const args = ['--stop-wp-env', '--skip-git', '--skip-turbo', '--skip-docker', '--root', f.repo];
  const dry = f.run(tidy, args, f.repo, { WP_ENV_HOME: d.home }); assert.match(dry.stdout, /wp-stop/);
  f.runGit('worktree', 'remove', '--force', dir);
  const result = f.run(tidy, ['--yes', ...args], f.repo, { WP_ENV_HOME: d.home });
  assert.equal(result.status, 0, result.stderr); assert.ok(existsSync(compose)); assert.deepEqual(d.read(), d.initial);
});

test('normal orphan cleanup honors kept runtime clones and stack directories', () => {
  for (const relative of ['wp-env-fixture', 'wp-env-fixture/WordPress']) {
    const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
    const d = dockerFixture(f); const compose = join(d.home, 'wp-env-fixture/docker-compose.yml');
    writeFileSync(compose, `volumes:\n  - '${dir}:/var/www/html/wp-content/plugins/main'\n`);
    f.runGit('worktree', 'remove', '--force', dir);
    const result = f.run(tidy, ['--yes', '--skip-git', '--skip-turbo', '--skip-docker', '--keep', join(d.home, relative), '--root', f.repo], f.repo, { WP_ENV_HOME: d.home });
    assert.equal(result.status, 0, result.stderr); assert.ok(existsSync(compose), relative); assert.deepEqual(d.read(), d.initial);
  }
});

test('forced cleanup cannot drop a checkout while a real build process runs', async () => {
  const f = fixture(); const dir = f.worktree('feature');
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000); console.log("ready")', 'build'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  await new Promise((resolvePromise, reject) => { child.once('error', reject); child.stdout.once('data', resolvePromise); });
  const result = f.run(tidy, ['--drop', dir, '--yes']);
  assert.equal(result.status, 1); assert.match(result.stderr, /build, test, install, or migration running/);
  assert.ok(existsSync(dir)); assert.equal(child.exitCode, null);
});

test('T3 cleanup preserves a branch renamed outside its task records', () => {
  const f = fixture(); const dir = f.worktree('feature'); t3State(f, dir);
  f.runGit('-C', dir, 'branch', '-m', 'renamed');
  const result = f.run(tidy, ['--yes', '--kept', '--root', f.repo, '--skip-docker', '--skip-wp-env']);
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /branch differs from checkout/);
  assert.ok(existsSync(dir)); assert.equal(f.runGit('rev-parse', 'renamed'), f.sha);
});

test('T3 cleanup keeps committed submodule work that no remote holds', () => {
  const f = fixture(); const dir = f.worktree('feature');
  f.runGit('-C', dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', f.repo, 'core');
  f.runGit('-C', dir, 'commit', '-qm', 'Add submodule');
  t3State(f, dir);
  f.runGit('-C', join(dir, 'core'), 'config', 'user.name', 'Fixture');
  f.runGit('-C', join(dir, 'core'), 'config', 'user.email', 'fixture@example.test');
  writeFileSync(join(dir, 'core/content'), 'unpublished submodule work\n');
  f.runGit('-C', join(dir, 'core'), 'commit', '-qam', 'Keep unpublished work');
  f.runGit('-C', dir, 'add', 'core'); f.runGit('-C', dir, 'commit', '-qm', 'Update submodule');
  const tip = f.runGit('-C', dir, 'rev-parse', 'HEAD');
  const result = f.run(tidy, ['--yes', '--kept', '--root', f.repo, '--skip-docker', '--skip-wp-env'], f.repo, { FIXTURE_SHA: tip });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /submodule has local work/);
  assert.equal(readFileSync(join(dir, 'core/content'), 'utf8'), 'unpublished submodule work\n');
});

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
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
    DEV_TIDY_CLAUDE_SESSIONS: join(root, 'sessions'), DEV_TIDY_CODEX_HOME: join(root, 'codex') };
  const worktree = (name) => { const dir = join(repo, '.claude/worktrees', name); runGit('worktree', 'add', '-qb', name, dir); return dir; };
  const launch = (dir, port = 38101) => { mkdirSync(join(dir, '.claude'), { recursive: true }); writeFileSync(join(dir, '.claude/launch.json'), JSON.stringify({ version: '0.0.1', configurations: [{ name: 'web', runtimeExecutable: 'node', runtimeArgs: ['server.mjs', '--port', String(port)], port }] })); };
  const run = (script, args, cwd = repo, extraEnv = {}) => spawnSync('bash', [script, ...args], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000 });
  return { root, repo, env, sha, runGit, worktree, launch, run };
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

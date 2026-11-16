import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const hook = resolve('bin/guard.mjs');
const root = mkdtempSync(join(realpathSync(tmpdir()), 'guard-'));
after(() => rmSync(root, { recursive: true, force: true }));

// A clone of a remote whose default branch is main, checked out on main.
const remote = join(root, 'remote.git');
const repo = join(root, 'repo');
const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
mkdirSync(repo);
g(repo, 'init', '-q', '-b', 'main');
g(repo, '-c', 'user.email=f@example.test', '-c', 'user.name=F', 'commit', '-q', '--allow-empty', '-m', 'init');
g(repo, 'remote', 'add', 'origin', remote);
g(repo, 'push', '-q', '-u', 'origin', 'main');
g(repo, 'remote', 'set-head', 'origin', 'main');

function verdict(command, { tool_name = 'Bash', cwd = repo } = {}) {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name, tool_input: { command }, cwd }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'pass';
}

const rows = [
  ['git push --force origin main', 'deny'],
  ['git push -f', 'deny'],
  ['git push -f origin HEAD', 'deny'],
  ['git push origin +HEAD:main', 'deny'],
  ['git push origin :main', 'deny'],
  ['git push --mirror origin', 'deny'],
  ['cd /tmp && rm -rf /', 'deny'],
  ['rm -rf ~', 'deny'],
  ['rm -rf "$HOME/"', 'deny'],
  ['rm -fr ~/*', 'deny'],
  [`rm -rf ${repo}`, 'deny'],
  ['rm -rf .git', 'deny'],
  ['git reset --hard origin/main', 'ask'],
  ['git clean -fdx', 'ask'],
  ['git checkout -- .', 'ask'],
  ['git restore .', 'ask'],
  ['git branch -D old-work', 'ask'],
  ['git stash drop', 'ask'],
  ['git push --force-with-lease origin feature', 'ask'],
  ['git push -d origin feature', 'ask'],
  ['rm -rf "$DIR/"', 'ask'],
  ['git push', 'pass'],
  ['git push -u origin feature', 'pass'],
  ['git -C . push origin HEAD:feature', 'pass'],
  ['git reset --soft HEAD~1', 'pass'],
  ['git clean -n', 'pass'],
  ['git restore --staged .', 'pass'],
  ['git checkout -b feature', 'pass'],
  ['git stash push -m wip', 'pass'],
  ['rm -rf node_modules dist', 'pass'],
  ['rm -rf "$SCRATCH/home"', 'pass'],
  ['echo git push --force origin main', 'pass'],
];

for (const [command, expected] of rows) {
  test(`${expected}: ${command}`, () => assert.equal(verdict(command), expected));
}

test('a tool other than Bash, and input the hook cannot read, pass untouched', () => {
  assert.equal(verdict('git push --force origin main', { tool_name: 'Read' }), 'pass');
  const r = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
  assert.deepEqual([r.status, r.stdout], [0, '']);
});

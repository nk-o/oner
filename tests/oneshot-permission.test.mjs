import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';

const hook = resolve('skills/oneshot/hook.sh');
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A repository on a feature branch with a run log, and a transcript of a
// session that loaded the skill.
function fixture({ status = 'running', transcript = '<command-name>/oneshot</command-name>\n' } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'permission-'));
  fixtures.push(root);
  const repo = join(root, 'repo');
  mkdirSync(repo);
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'fixture@example.test');
  g('config', 'user.name', 'Fixture');
  writeFileSync(join(repo, '.gitignore'), '.specs/\n');
  g('add', '.');
  g('commit', '-qm', 'Initialize fixture');
  g('switch', '-q', '-c', 'feature');
  const log = (s) => {
    mkdirSync(join(repo, '.specs', '001-feature'), { recursive: true });
    writeFileSync(join(repo, '.specs', '001-feature', 'oneshot.md'),
      `# feature\n\nLane. feature\nBranch. feature\nStatus. ${s}\n\n## Lane\n- [ ] Build\n`);
  };
  log(status);
  const session = join(root, 'session.jsonl');
  writeFileSync(session, transcript);
  const ask = (tool_name, tool_input, { cwd = repo, from = session, ...extra } = {}) => {
    const input = JSON.stringify({ hook_event_name: 'PermissionRequest', cwd, transcript_path: from, tool_name, tool_input, ...extra });
    const out = spawnSync('bash', [hook], { input, encoding: 'utf8' }).stdout;
    if (out === '') return 'ask';
    assert.equal(JSON.parse(out).hookSpecificOutput.decision.behavior, 'allow');
    return 'allow';
  };
  return { root, repo, g, log, ask };
}

test('an open run gets its local work approved and leaves the rest to the user', () => {
  const f = fixture();
  const bash = (command) => f.ask('Bash', { command });

  assert.equal(f.ask('Edit', { file_path: join(f.repo, 'src', 'app.ts') }), 'allow');
  assert.equal(f.ask('Write', { file_path: join(f.root, 'scratch', 'x.md') }, { scratchpad_dir: join(f.root, 'scratch') }), 'allow');
  assert.equal(f.ask('Read', { file_path: join(f.repo, 'README.md') }), 'allow');
  for (const command of ['pnpm test', 'git commit -m "Add the thing"', 'git push -u origin feature',
    'git push --force-with-lease origin feature', 'rm -rf node_modules dist', 'cat vercel.json', 'node -e "1"']) {
    assert.equal(bash(command), 'allow', command);
  }

  assert.equal(f.ask('Edit', { file_path: join(f.root, 'elsewhere.txt') }), 'ask');
  assert.equal(f.ask('Edit', { file_path: join(f.repo, '..', 'elsewhere.txt') }), 'ask');
  assert.equal(f.ask('Write', { file_path: join(f.repo, '.git', 'hooks', 'pre-commit') }), 'ask');
  assert.equal(f.ask('Write', { file_path: join(f.repo, '.claude', 'settings.local.json') }), 'ask');
  assert.equal(f.ask('Read', { file_path: '/etc/hosts' }), 'ask');
  assert.equal(f.ask('mcp__db__execute_sql', { query: 'select 1' }), 'ask');
  assert.equal(f.ask('WebFetch', { url: 'https://example.test' }), 'ask');
  for (const command of ['sudo rm -rf build', 'ssh deploy@example.test', 'npx vercel deploy --prod', 'bash -c "kubectl apply -f k8s"',
    'terraform apply', 'npm publish', 'pnpm -r publish', 'pnpm deploy', 'npm run release:prod', 'gh release create v1', 'gh api -X DELETE repos/o/r',
    'git push --force origin feature', 'git push -f origin feature', 'git push origin main', 'git push origin HEAD:main',
    'git push origin :feature', 'git push origin --delete feature', 'rm -rf ~/Library/Caches', 'rm -rf /tmp/x',
    'rm -rf ../other', 'rm -rf .', 'make && rm -r "$HOME/x"']) {
    assert.equal(bash(command), 'ask', command);
  }
});

test('nothing is approved unless the run is running in a session that loaded the skill', () => {
  const f = fixture();
  const other = join(f.root, 'other.jsonl');
  writeFileSync(other, 'an unrelated session\n');
  const edit = { file_path: join(f.repo, 'app.ts') };
  assert.equal(f.ask('Edit', edit, { from: other }), 'ask');
  assert.equal(f.ask('Edit', edit, { from: join(f.root, 'missing.jsonl') }), 'ask');
  for (const status of ['waiting', 'done']) {
    f.log(status);
    assert.equal(f.ask('Edit', edit), 'ask', status);
  }
  f.log('running');
  f.g('switch', '-q', 'main');
  assert.equal(f.ask('Edit', edit), 'ask', 'a run on another branch');
});

test('a delegate in a detached worktree and an oneshot-auto session count as the run', () => {
  const f = fixture({ transcript: '<command-name>/oneshot-auto</command-name>\n' });
  assert.equal(f.ask('Edit', { file_path: join(f.repo, 'app.ts') }), 'allow');
  const worker = join(f.repo, '.claude', 'worktrees', 'agent-1');
  f.g('worktree', 'add', '-q', '--detach', worker);
  assert.equal(f.ask('Edit', { file_path: join(worker, 'app.ts') }, { cwd: worker }), 'allow');
  assert.equal(f.ask('Bash', { command: 'pnpm test' }, { cwd: worker }), 'allow');
  f.log('done');
  assert.equal(f.ask('Edit', { file_path: join(worker, 'app.ts') }, { cwd: worker }), 'ask');
});

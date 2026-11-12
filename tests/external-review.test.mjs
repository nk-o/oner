import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { validateConfig } from '../build/config.mjs';
import { build } from '../build/install.mjs';
import { TARGETS } from '../build/targets.mjs';

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'grok-review-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'source');
  const scripts = join(dir, 'scripts');
  const bin = join(dir, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  cpSync(resolve('skills/external-review'), scripts, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(repo, 'answer.txt'), 'before\n');
  mkdirSync(join(repo, '.grok'));
  writeFileSync(join(repo, '.grok/config.toml'), 'private hook config\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  writeFileSync(join(repo, 'answer.txt'), 'after\n');
  writeFileSync(join(repo, '.env'), 'SECRET=private\n');
  writeFileSync(join(scripts, 'providers.env'), 'ENABLED="grok"\nCHECK_GROK_SESSION=1\nGROK_MODEL="grok-4.7"\nGROK_EFFORT="high"\n');
  const log = join(dir, 'calls.jsonl');
  const mock = `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'models') {
  console.log(process.env.LOGGED_OUT ? 'You are not logged in.' : 'You are logged in with grok.com.');
  process.exit(0);
}
const prompt = readFileSync(args[args.indexOf('--prompt-file') + 1], 'utf8');
const cwd = process.cwd();
const diffs = Object.fromEntries([...prompt.matchAll(/\\x60([^\\x60]+\\/(\\w+\\.(?:diff|txt)))\\x60/g)].map(([, path, name]) => [name, readFileSync(path, 'utf8')]));
appendFileSync(process.env.CALL_LOG, JSON.stringify({
  args, prompt, cwd, answer: readFileSync('answer.txt', 'utf8'),
  diffs,
  secret: existsSync('.env'), hooks: existsSync('.grok'),
  home: process.env.GROK_HOME, auth: process.env.GROK_AUTH_PATH,
  compat: process.env.GROK_CLAUDE_HOOKS_ENABLED,
  overlay: process.env.GROK_CONFIG ?? null,
}) + '\\n');
console.log(JSON.stringify({ text: process.env.CLI_FAILURE ? 'Provider failure detail' : 'Reviewed answer.txt: after', stopReason: process.env.CANCELLED ? 'cancelled' : 'end_turn' }));
process.exit(process.env.CLI_FAILURE ? 7 : 0);
`;
  writeFileSync(join(bin, 'grok'), mock, { mode: 0o755 });
  return {
    repo, scripts, dir, log,
    run(args = [], env = {}) {
      return spawnSync('bash', [join(scripts, 'ext-review.sh'), '--base', 'main', ...args], {
        cwd: repo, encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: dir, CALL_LOG: log, GROK_SESSION_ID: '', ...env },
      });
    },
  };
}

test('Grok reviews the sanitized change with the configured effort and isolated settings', (t) => {
  const f = fixture(t);
  const result = f.run(['--provider', 'grok', '--intent', 'Change the answer'], { GROK_CONFIG: '{"hooks":{}}' });
  assert.equal(result.status, 0, result.stderr);
  const call = JSON.parse(readFileSync(f.log, 'utf8'));
  assert.equal(call.answer, 'after\n');
  assert.equal(call.secret, false);
  assert.equal(call.hooks, false);
  assert.notEqual(call.cwd, f.repo);
  assert.deepEqual(call.args.slice(0, 6), ['--model', 'grok-4.7', '--effort', 'high', '--output-format', 'json']);
  assert.equal(call.args[call.args.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.equal(call.args[call.args.indexOf('--tools') + 1], 'read_file,list_dir,grep');
  assert.equal(call.args.some((arg) => arg.startsWith('Bash(')), false);
  assert.equal(call.compat, '0');
  assert.equal(call.overlay, null);
  assert.match(call.prompt, /Change the answer/);
  assert.deepEqual(Object.keys(call.diffs), ['working.diff']);
  assert.match(call.diffs['working.diff'], /^-before\n\+after$/m);
  const report = result.stdout.match(/grok\s+ok\s+(.+grok\.md)/)?.[1];
  assert.ok(report, result.stdout);
  assert.match(readFileSync(report, 'utf8'), /Reviewed answer\.txt: after/);
  assert.equal(existsSync(call.cwd), false);
  assert.equal(existsSync(call.home), false);
});

test('Grok logout stops review before any source is sent', (t) => {
  const f = fixture(t);
  const result = f.run([], { LOGGED_OUT: '1' });
  assert.equal(result.status, 4, result.stderr);
  assert.match(result.stderr, /Run `grok login`/);
  assert.equal(existsSync(f.log), false);
});

test('a cancelled Grok response fails review even when the CLI exits zero', (t) => {
  const f = fixture(t);
  const result = f.run([], { CANCELLED: '1' });
  assert.equal(result.status, 1, result.stderr);
  const report = result.stdout.match(/grok\s+exit 1\s+(.+grok\.md)/)?.[1];
  assert.ok(report, result.stdout);
  assert.match(readFileSync(report, 'utf8'), /Grok stopped before completing review: cancelled/);
});

test('a failing Grok CLI preserves its error output in the report', (t) => {
  const f = fixture(t);
  const result = f.run([], { CLI_FAILURE: '1' });
  assert.equal(result.status, 1, result.stderr);
  const report = result.stdout.match(/grok\s+exit 7\s+(.+grok\.md)/)?.[1];
  assert.ok(report, result.stdout);
  assert.match(readFileSync(report, 'utf8'), /Provider failure detail/);
});

test('the shared Claude skills omit the Grok voice inside a Grok session', (t) => {
  const f = fixture(t);
  const result = f.run([], { GROK_SESSION_ID: 'current-session' });
  assert.equal(result.status, 127, result.stderr);
  assert.match(result.stderr, /every voice off/);
  assert.equal(existsSync(f.log), false);
});

test('the build installs Grok review settings and excludes each target own voice', (t) => {
  const f = fixture(t);
  cpSync(resolve('targets'), join(f.repo, 'targets'), { recursive: true });
  cpSync(resolve('AGENTS.md'), join(f.repo, 'AGENTS.md'));
  cpSync(resolve('skills/external-review'), join(f.repo, 'skills/external-review'), { recursive: true });
  const targets = Object.fromEntries(Object.keys(TARGETS).map((name) => [name, { enabled: false, dir: join(f.dir, name) }]));
  targets.claude.enabled = true;
  targets.codex.enabled = true;
  targets.grok.enabled = true;
  const config = validateConfig({ targets, externalReview: { cursor: { enabled: false }, grok: { enabled: true } } }, f.repo);
  build(f.repo, config, { auto: false });
  const providers = (name) => readFileSync(join(f.dir, name, 'skills/external-review/providers.env'), 'utf8');
  assert.match(providers('codex'), /^ENABLED="grok claude"$/m);
  assert.match(providers('codex'), /^GROK_MODEL="grok-4.7"\nGROK_EFFORT="high"$/m);
  assert.match(providers('claude'), /^ENABLED="grok codex claude"$/m);
  assert.match(providers('claude'), /^CHECK_GROK_SESSION=1$/m);
  assert.match(readFileSync(join(f.dir, 'grok/AGENTS.md'), 'utf8'), /recipients: grok, codex, claude/);
  targets.claude.enabled = false;
  build(f.repo, validateConfig({ targets, externalReview: { cursor: { enabled: false }, grok: { enabled: true } } }, f.repo), { auto: false });
  assert.match(providers('grok'), /^ENABLED="codex claude"$/m);
});

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
console.log(JSON.stringify({ type: 'thought', data: 'thinking' }));
console.log(JSON.stringify({ type: 'text', data: process.env.CLI_FAILURE ? 'I will check the quota code.' : 'I will read the diff.' }));
console.log(JSON.stringify({ type: 'tool_call', toolName: 'read_file' }));
if (process.env.CLI_FAILURE) { console.log(JSON.stringify({ type: 'error', message: 'Provider failure detail' })); process.exit(7); }
console.log(JSON.stringify({ type: 'text', data: 'Reviewed answer.txt: ' }));
console.log(JSON.stringify({ type: 'text', data: 'after' }));
console.log(JSON.stringify({ type: 'end', stopReason: process.env.CANCELLED ? 'cancelled' : 'end_turn' }));
process.exit(0);
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
  assert.deepEqual(call.args.slice(0, 6), ['--model', 'grok-4.7', '--effort', 'high', '--output-format', 'streaming-json']);
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
  assert.match(readFileSync(report, 'utf8'), /I will read the diff\.\n\nReviewed answer\.txt: after/);
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

test('a failing Grok CLI keeps its error, and its prose about quotas does not read as a usage limit', (t) => {
  const f = fixture(t);
  const result = f.run([], { CLI_FAILURE: '1' });
  assert.equal(result.status, 1, result.stderr);
  const report = result.stdout.match(/grok\s+exit 7\s+(.+grok\.md)/)?.[1];
  assert.ok(report, result.stdout);
  assert.match(readFileSync(report, 'utf8'), /Error: Provider failure detail/);
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
  assert.match(providers('codex'), /^GROK_MODEL="grok-4.7-build-fast"\nGROK_EFFORT="high"$/m);
  assert.match(providers('codex'), /^GROK_TIMEOUT="1200"$/m);
  assert.match(providers('codex'), /^CLAUDE_TIMEOUT="900"$/m);
  assert.match(providers('claude'), /^ENABLED="grok codex claude"$/m);
  assert.match(providers('claude'), /^CHECK_GROK_SESSION=1$/m);
  assert.match(readFileSync(join(f.dir, 'grok/AGENTS.md'), 'utf8'), /recipients: grok, codex, claude/);
  targets.claude.enabled = false;
  build(f.repo, validateConfig({ targets, externalReview: { cursor: { enabled: false }, grok: { enabled: true } } }, f.repo), { auto: false });
  assert.match(providers('grok'), /^ENABLED="codex claude"$/m);
});

const grokSleeper = `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
if (process.argv[2] === 'models') { console.log('You are logged in with grok.com.'); process.exit(0); }
const pid = spawn('sleep', ['60'], { stdio: 'ignore', detached: true }).pid;
console.log(JSON.stringify({ type: 'text', data: 'Grok partial finding' }));
writeFileSync(process.env.CHILD_PID, String(pid));
setTimeout(() => {}, 60000);
`;

function writeMock(bin, name, body) {
  writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
}

const codexMock = `
const args = process.argv.slice(2);
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (process.env.CODEX_CRASH) process.stderr.write('codex read: "Every new route needs per-user rate limiting"\\n');
process.stderr.write('codex transcript: exec git diff, thinking, tokens used\\n'.repeat(50));
if (process.env.CODEX_CRASH) { process.stderr.write('ERROR: stream disconnected\\n'); process.exit(1); }
if (process.env.CODEX_LIMIT && args.includes('--base')) { process.stderr.write("You've hit your usage limit.\\n"); process.exit(1); }
console.log('Codex review body: answer.txt changed');
`;

test('a voice past its deadline is stopped with its detached children, keeps its streamed text, and is reported as timeout while the others stand', (t) => {
  const f = fixture(t);
  const bin = join(f.dir, 'bin');
  const child = join(f.dir, 'child.pid');
  writeMock(bin, 'grok', grokSleeper);
  writeMock(bin, 'codex', codexMock);
  writeFileSync(join(f.scripts, 'providers.env'), 'ENABLED="grok codex"\nGROK_TIMEOUT="2"\n');
  const start = Date.now();
  const result = f.run([], { CHILD_PID: child });
  const seconds = (Date.now() - start) / 1000;
  assert.equal(result.status, 1, result.stderr);
  assert.ok(seconds < 12, `took ${seconds}s`);
  const grok = result.stdout.match(/grok\s+timeout\s+(.+grok\.md)/)?.[1];
  assert.ok(grok, result.stdout);
  assert.match(readFileSync(grok, 'utf8'), /Grok partial finding[\s\S]*stopped at its 2-second deadline, this review is incomplete/);
  assert.match(result.stdout, /codex\s+ok\s+/);
  const pid = Number(readFileSync(child, 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(existsSync(join(grok, '..', 'grok-home')), false);
});

test('codex.md holds the review alone and the transcript is dropped after a clean run', (t) => {
  const f = fixture(t);
  writeMock(join(f.dir, 'bin'), 'codex', codexMock);
  writeFileSync(join(f.scripts, 'providers.env'), 'ENABLED="codex"\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const report = result.stdout.match(/codex\s+ok\s+(.+codex\.md)/)?.[1];
  assert.ok(report, result.stdout);
  const text = readFileSync(report, 'utf8');
  assert.match(text, /Codex review body/);
  assert.doesNotMatch(text, /codex transcript/);
  assert.equal(existsSync(join(report, '..', 'codex.log')), false);
});

test('a Codex usage limit in the committed review reads as limit after the uncommitted review runs', (t) => {
  const f = fixture(t);
  const git = (...args) => execFileSync('git', ['-C', f.repo, ...args], { stdio: 'pipe' });
  git('switch', '-qc', 'feature');
  writeFileSync(join(f.repo, 'extra.txt'), 'committed\n');
  git('add', 'extra.txt');
  git('commit', '-qm', 'extra');
  writeMock(join(f.dir, 'bin'), 'codex', codexMock);
  writeFileSync(join(f.scripts, 'providers.env'), 'ENABLED="codex"\n');
  const result = f.run([], { CODEX_LIMIT: '1' });
  assert.equal(result.status, 127, result.stderr);
  assert.match(result.stdout, /codex\s+limit\s+/);
});

test('a Codex crash whose transcript mentions rate limiting is a failure, not a limit', (t) => {
  const f = fixture(t);
  writeMock(join(f.dir, 'bin'), 'codex', codexMock);
  writeFileSync(join(f.scripts, 'providers.env'), 'ENABLED="codex"\n');
  const result = f.run([], { CODEX_CRASH: '1' });
  assert.equal(result.status, 1, result.stderr);
  const report = result.stdout.match(/codex\s+exit 1\s+(.+codex\.md)/)?.[1];
  assert.ok(report, result.stdout);
  assert.match(readFileSync(report, 'utf8'), /ERROR: stream disconnected/);
});

test('SIGTERM to the script stops a running voice and its detached children', async (t) => {
  const f = fixture(t);
  const child = join(f.dir, 'child.pid');
  writeMock(join(f.dir, 'bin'), 'grok', grokSleeper);
  const run = spawn('bash', [join(f.scripts, 'ext-review.sh'), '--base', 'main'], {
    cwd: f.repo, stdio: 'ignore',
    env: { ...process.env, PATH: `${join(f.dir, 'bin')}:${process.env.PATH}`, TMPDIR: f.dir, CHILD_PID: child, GROK_SESSION_ID: '' },
  });
  const exited = new Promise((r) => run.on('exit', (c) => r(c)));
  for (let i = 0; !existsSync(child); i++) {
    assert.ok(i < 100 && run.exitCode === null, 'the voice never started');
    await new Promise((r) => setTimeout(r, 100));
  }
  run.kill('SIGTERM');
  const code = await exited;
  assert.equal(code, 130);
  assert.throws(() => process.kill(Number(readFileSync(child, 'utf8')), 0), { code: 'ESRCH' });
});

test('timeoutMinutes must be a whole number of minutes', () => {
  assert.throws(() => validateConfig({ externalReview: { grok: { timeoutMinutes: 0 } } }, resolve('.')), /externalReview\.grok\.timeoutMinutes/);
  assert.throws(() => validateConfig({ externalReview: { codex: { timeoutMinutes: 2.5 } } }, resolve('.')), /whole number/);
  assert.throws(() => validateConfig({ externalReview: { claude: { timeoutMinutes: 1e21 } } }, resolve('.')), /1 to 1440/);
  assert.equal(validateConfig({ externalReview: { grok: { timeoutMinutes: 30 } } }, resolve('.')).reviewers.grok.timeoutMinutes, 30);
});

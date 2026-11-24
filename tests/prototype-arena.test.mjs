import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'arena-'));
after(() => rmSync(root, { recursive: true, force: true }));

const skills = join(root, 'skills');
const script = join(skills, 'prototype', 'arena-judge.sh');
mkdirSync(join(skills, 'prototype'), { recursive: true });
mkdirSync(join(skills, 'external-review'), { recursive: true });
copyFileSync(resolve('skills/prototype/arena-judge.sh'), script);
chmodSync(script, 0o755);

const bin = join(root, 'bin');
mkdirSync(bin);
const argv = join(root, 'codex-argv');
const fakeCodex = (body) => {
  writeFileSync(join(bin, 'codex'), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${argv}"\n${body}\n`);
  chmodSync(join(bin, 'codex'), 0o755);
};

const rubric = join(root, 'rubric.md');
writeFileSync(rubric, '1. The order number reads first at 390px.\n');
const shots = ['list-a.png', 'list-b.png'].map((n) => join(root, n));
for (const s of shots) writeFileSync(s, 'png');
const verdict = join(root, 'verdict.md');

function judge(enabled) {
  writeFileSync(join(skills, 'external-review', 'providers.env'), `ENABLED="${enabled}"\nCODEX_MODEL="m"\nCODEX_EFFORT="high"\nCODEX_TIMEOUT="30"\n`);
  rmSync(argv, { force: true });
  return spawnSync(script, [rubric, verdict, ...shots], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
}

test('a session whose external review leaves Codex out skips the second judge without calling it', () => {
  fakeCodex('exit 0');
  const r = judge('grok claude');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^skip: codex is off/);
  assert.equal(existsSync(argv), false);
});

const answer = (text) => `out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done; printf '${text}' > "$out"`;

test('Codex judges in an empty directory, with copies of the screenshots and the rubric only', () => {
  fakeCodex(answer('A misses the order number.\\n**Base:** B\\n'));
  const started = Date.now();
  const r = judge('grok codex claude');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(Date.now() - started < 5000, 'a finished judge returns at once, not at its deadline');
  assert.equal(r.stdout.trim(), verdict);
  assert.match(readFileSync(verdict, 'utf8'), /Base:\*\* B/);
  const args = readFileSync(argv, 'utf8').split('\n');
  const work = args[args.indexOf('-C') + 1];
  assert.ok(!work.startsWith(root), 'not the caller directory');
  assert.equal(existsSync(work), false, 'the copies are removed');
  const pair = (a, b) => args.some((x, i) => x === a && args[i + 1] === b);
  assert.ok(pair('--sandbox', 'read-only'));
  assert.ok(args.includes('--ignore-user-config'), 'the user config carries MCP servers');
  for (const tool of ['shell_tool', 'apps', 'plugins']) assert.ok(pair('--disable', tool), tool);
  for (const s of shots) assert.ok(args.includes(`--image=${join(work, s.split('/').at(-1))}`), s);
  const prompt = args.slice(args.indexOf('--') + 1).join('\n');
  assert.match(prompt, /The order number reads first at 390px\./);
});

test('a reply that names no candidate as the base is a failure', () => {
  fakeCodex(answer('I cannot read these images.\\n'));
  const r = judge('codex');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail: codex exited 0 without a verdict naming a base among ab/);
  assert.equal(existsSync(verdict), false);
});

test('a Codex run that leaves no verdict is a failure, not a pass', () => {
  fakeCodex('exit 0');
  const r = judge('codex');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail: codex exited 0 without a verdict/);
});

test('a judge past its deadline is stopped with what it started', () => {
  const child = join(root, 'child-pid');
  fakeCodex(`trap "" TERM; sleep 60 & echo $! > "${child}"; wait`);
  writeFileSync(join(skills, 'external-review', 'providers.env'), 'ENABLED="codex"\nCODEX_MODEL="m"\nCODEX_EFFORT="high"\nCODEX_TIMEOUT="1"\n');
  const started = Date.now();
  const r = spawnSync(script, [rubric, verdict, ...shots], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(r.status, 1);
  assert.ok(Date.now() - started < 15000, `stopped after ${Date.now() - started} ms`);
  const pid = Number(readFileSync(child, 'utf8'));
  assert.throws(() => process.kill(pid, 0), /ESRCH/, `child ${pid} still runs`);
});

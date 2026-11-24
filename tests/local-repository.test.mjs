import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { validateConfig } from '../build/config.mjs';
import { build } from '../build/install.mjs';
import { syncLocal } from '../build/local.mjs';
import { hashInputs } from '../build/render.mjs';
import { TARGETS } from '../build/targets.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const commit = (dir, message) => {
  git(dir, 'add', '--all');
  git(dir, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', message);
};
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'oner-local-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'oner'), producer = join(root, 'producer'), remote = join(root, 'remote.git');
  mkdirSync(repo);
  mkdirSync(producer);
  git(producer, 'init', '-q', '-b', 'main');
  writeFileSync(join(producer, 'AGENTS.md'), 'Personal rules.\n');
  mkdirSync(join(producer, 'skills', 'personal'), { recursive: true });
  writeFileSync(join(producer, 'skills', 'personal', 'SKILL.md'), '---\nname: personal\ndescription: Personal fixture.\n---\n\nOriginal skill.\n');
  commit(producer, 'initial files');
  git(root, 'clone', '--bare', producer, remote);
  git(producer, 'remote', 'add', 'origin', remote);
  git(producer, 'push', '-u', 'origin', 'main');
  return { root, repo, producer, remote, local: join(repo, 'local'),
    publish(path, text) {
      writeFileSync(join(producer, path), text);
      commit(producer, 'update personal files');
      git(producer, 'push', 'origin', 'main');
    } };
}

test('repository config is optional and rejects executable transports and embedded credentials', () => {
  assert.equal(validateConfig({}, '.').localRepository, null);
  for (const repository of ['', null]) assert.equal(validateConfig({ local: { repository } }, '.').localRepository, null);
  for (const repository of ['git@github.com:you/oner-local.git', 'https://github.com/you/oner-local.git', 'ssh://git@github.com/you/oner-local.git']) {
    assert.equal(validateConfig({ local: { repository } }, '.').localRepository, repository);
  }
  for (const repository of [5, {}, '--upload-pack=anything', 'ext::anything', 'https://token@github.com/you/repo', 'https://you:secret@github.com/repo', 'https://github.com/repo\n']) {
    assert.throws(() => validateConfig({ local: { repository } }, '.'), /local.repository/);
  }
});

test('a fresh installation restores the repository root into local and a second sync changes nothing', t => {
  const f = fixture(t);
  assert.equal(syncLocal(f.repo, f.remote).state, 'cloned');
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Personal rules.\n');
  assert.equal(git(f.local, 'rev-parse', '--show-toplevel'), f.local);
  assert.equal(syncLocal(f.repo, pathToFileURL(f.remote).href).state, 'current');
  assert.equal(git(f.local, 'status', '--porcelain'), '');
});

test('adoption preserves extra local files and attaches matching files without nesting another local folder', t => {
  const f = fixture(t);
  mkdirSync(f.local);
  writeFileSync(join(f.local, 'AGENTS.md'), 'Personal rules.\n');
  writeFileSync(join(f.local, 'ports.md'), 'Machine ports.\n');
  assert.equal(syncLocal(f.repo, f.remote).state, 'adopted');
  assert.equal(readFileSync(join(f.local, 'ports.md'), 'utf8'), 'Machine ports.\n');
  assert.match(readFileSync(join(f.local, 'skills', 'personal', 'SKILL.md'), 'utf8'), /Original skill/);
  assert.equal(existsSync(join(f.local, 'local')), false);
  assert.equal(git(f.local, 'status', '--porcelain'), '?? ports.md');
});

test('a conflicting connection refuses before copying any new file or attaching Git', t => {
  const f = fixture(t);
  f.publish('a-new.txt', 'Remote new file.\n');
  mkdirSync(f.local);
  writeFileSync(join(f.local, 'AGENTS.md'), 'Keep my rules.\n');
  assert.throws(() => syncLocal(f.repo, f.remote), /AGENTS.md differs/);
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Keep my rules.\n');
  assert.equal(existsSync(join(f.local, 'a-new.txt')), false);
  assert.equal(existsSync(join(f.local, '.git')), false);
});

test('adoption preserves Git filenames with leading spaces and line breaks', t => {
  const f = fixture(t), name = ' leading name\n.md';
  f.publish(name, 'Exact file bytes.\n');
  mkdirSync(f.local);
  assert.equal(syncLocal(f.repo, f.remote).state, 'adopted');
  assert.equal(readFileSync(join(f.local, name), 'utf8'), 'Exact file bytes.\n');
  assert.equal(git(f.local, 'status', '--porcelain'), '');
});

test('adoption never follows a local symlink to write repository files outside local', t => {
  const f = fixture(t), outside = join(f.root, 'outside');
  mkdirSync(outside);
  mkdirSync(f.local);
  symlinkSync(outside, join(f.local, 'skills'));
  assert.throws(() => syncLocal(f.repo, f.remote), /conflicts/);
  assert.equal(existsSync(join(outside, 'personal')), false);
  assert.equal(existsSync(join(f.local, 'AGENTS.md')), false);
});

test('fast-forward installs updated bytes and dirty files refuse downloads without a stash', t => {
  const f = fixture(t);
  syncLocal(f.repo, f.remote);
  f.publish('AGENTS.md', 'Updated rules.\n');
  assert.equal(syncLocal(f.repo, f.remote).state, 'updated');
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Updated rules.\n');
  const head = git(f.local, 'rev-parse', 'HEAD');
  writeFileSync(join(f.local, 'AGENTS.md'), 'Uncommitted work.\n');
  f.publish('AGENTS.md', 'Another remote update.\n');
  assert.equal(syncLocal(f.repo, f.remote).state, 'modified');
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Uncommitted work.\n');
  assert.equal(git(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.local, 'stash', 'list'), '');
});

test('unpushed commits survive and divergent history stops before changing the working files', t => {
  const f = fixture(t);
  syncLocal(f.repo, f.remote);
  writeFileSync(join(f.local, 'mine.txt'), 'Local commit.\n');
  commit(f.local, 'local work');
  const head = git(f.local, 'rev-parse', 'HEAD');
  assert.equal(syncLocal(f.repo, f.remote).state, 'ahead');
  f.publish('AGENTS.md', 'Remote work.\n');
  assert.throws(() => syncLocal(f.repo, f.remote), /diverged/);
  assert.equal(git(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(f.local, 'mine.txt'), 'utf8'), 'Local commit.\n');
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Personal rules.\n');
});

test('a different remote and a detached HEAD stop the update', t => {
  const f = fixture(t);
  syncLocal(f.repo, f.remote);
  assert.throws(() => syncLocal(f.repo, join(f.root, 'another.git')), /origin does not match/);
  git(f.local, 'checkout', '--detach');
  assert.throws(() => syncLocal(f.repo, f.remote), /detached HEAD/);
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Personal rules.\n');
});

test('disabling downloading keeps all personal files and Git metadata never changes the build hash', t => {
  const f = fixture(t);
  syncLocal(f.repo, f.remote);
  const before = hashInputs(f.repo);
  writeFileSync(join(f.local, '.git', 'FETCH_HEAD'), 'Metadata only.\n');
  assert.equal(hashInputs(f.repo), before);
  assert.equal(syncLocal(f.repo, null).state, 'disabled');
  assert.equal(readFileSync(join(f.local, 'AGENTS.md'), 'utf8'), 'Personal rules.\n');
  writeFileSync(join(f.local, 'AGENTS.md'), 'Changed source.\n');
  assert.notEqual(hashInputs(f.repo), before);
});

test('manual builds install downloaded skills and automatic builds use disk without fetching', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'AGENTS.md'), 'Shared rules.\n');
  cpSync(resolve('targets'), join(f.repo, 'targets'), { recursive: true });
  const targets = Object.fromEntries(Object.keys(TARGETS).map(name => [name, { enabled: false, dir: join(f.root, `agent-${name}`) }]));
  targets.claude.enabled = true;
  const config = validateConfig({ local: { repository: f.remote }, targets, externalReview: {
    cursor: { enabled: false }, codex: { enabled: false }, claude: { enabled: false },
  } }, f.repo);
  assert.deepEqual(build(f.repo, config, { auto: true }), []);
  assert.equal(existsSync(f.local), false);
  assert.match(build(f.repo, config, { auto: false }).join('\n'), /local: cloned/);
  const installed = join(targets.claude.dir, 'skills', 'personal', 'SKILL.md');
  assert.match(readFileSync(installed, 'utf8'), /Original skill/);
  f.publish('skills/personal/SKILL.md', '---\nname: personal\ndescription: Updated fixture.\n---\n\nRemote update.\n');
  writeFileSync(join(f.local, 'AGENTS.md'), 'Local disk edit.\n');
  build(f.repo, config, { auto: true });
  assert.match(readFileSync(join(targets.claude.dir, 'CLAUDE.md'), 'utf8'), /Local disk edit/);
  assert.match(readFileSync(installed, 'utf8'), /Original skill/);
  assert.equal(syncLocal(f.repo, f.remote).state, 'modified');
  git(f.local, 'restore', 'AGENTS.md');
  build(f.repo, config, { auto: false });
  assert.match(readFileSync(installed, 'utf8'), /Remote update/);
});

test('an automatic build reports a skipped agent every time until the conflict is gone', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'AGENTS.md'), 'Shared rules.\n');
  cpSync(resolve('targets'), join(f.repo, 'targets'), { recursive: true });
  const targets = Object.fromEntries(Object.keys(TARGETS).map(name => [name, { enabled: false, dir: join(f.root, `agent-${name}`) }]));
  targets.claude.enabled = true;
  const codexDir = join(f.root, 'agent-codex');
  const foreign = join(codexDir, 'skills', 'personal', 'SKILL.md');
  mkdirSync(join(codexDir, 'skills', 'personal'), { recursive: true });
  writeFileSync(foreign, 'Not written by the build.\n');
  delete targets.codex;
  const config = validateConfig({ local: { repository: f.remote }, targets, externalReview: {
    cursor: { enabled: false }, codex: { enabled: false }, claude: { enabled: false },
  } }, f.repo);
  config.targets.codex = { enabled: true, explicit: false, dir: codexDir };
  assert.match(build(f.repo, config, { auto: false }).join('\n'), /codex: skipped: these already exist/);
  const settings = join(targets.claude.dir, 'settings.json');
  const own = JSON.parse(readFileSync(settings, 'utf8'));
  own.permissions.allow.push('Bash(npm test:*)');
  writeFileSync(settings, JSON.stringify(own));
  const retry = build(f.repo, config, { auto: true });
  assert.equal(retry.length, 1);
  assert.match(retry[0], /^codex: skipped: these already exist/);
  assert.ok(JSON.parse(readFileSync(settings, 'utf8')).permissions.allow.includes('Bash(npm test:*)'));
  rmSync(foreign);
  assert.match(build(f.repo, config, { auto: true }).join('\n'), /codex: .*written/);
  assert.deepEqual(build(f.repo, config, { auto: true }), []);
});

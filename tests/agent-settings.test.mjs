import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { mergeTables, mergeTopKeys } from '../build/codex-config.mjs';
import { readFileSync } from 'node:fs';
import { listSkills, validateConfig } from '../build/config.mjs';
import { build, executorsTable, mergeSettings } from '../build/install.mjs';
import { TARGETS } from '../build/targets.mjs';
import { renderFile, renderText, tokenValues, walk } from '../build/render.mjs';

const personal = 'model = "gpt"\n\n[mcp_servers.node_repl]\ncommand = "node_repl"\n';
const block = '# oner: start (written by bin/build.mjs)\n["analytics"]\nenabled = false\n# oner: end\n';

test('a table goes after the last table and the rest stays byte for byte', () => {
  assert.equal(mergeTables(personal, { analytics: { enabled: false } }), personal + '\n' + block);
});

test('a second build changes nothing, and turning it off restores the file', () => {
  const once = mergeTables(personal, { analytics: { enabled: false } });
  assert.equal(mergeTables(once, { analytics: { enabled: false } }), once);
  assert.equal(mergeTables(once, {}), personal);
  assert.equal(mergeTables(mergeTables('', { analytics: { enabled: false } }), {}), '');
});

test('a table the user set stops the build instead of duplicating it', () => {
  for (const own of ['[analytics]\nenabled = true\n', 'analytics.enabled = true\n', '[analytics.extra]\na = 1\n']) {
    assert.throws(() => mergeTables(own, { analytics: { enabled: false } }), /\[analytics\] is already set/, own);
  }
  const quoted = 'note = "[analytics]"\n# [analytics]\n';
  assert.equal(mergeTables(quoted, { analytics: { enabled: false } }), quoted + '\n' + block);
});

test('a top-level key goes before the first table, never into it', () => {
  assert.equal(
    mergeTopKeys(personal, { model_auto_compact_token_limit: 900000 }),
    'model = "gpt"\n\nmodel_auto_compact_token_limit = 900000\n[mcp_servers.node_repl]\ncommand = "node_repl"\n',
  );
  assert.equal(mergeTopKeys('', { k: 1 }), 'k = 1\n');
});

test('a top-level key the user set is replaced, and removed only while it still holds what the build wrote', () => {
  const own = 'model_auto_compact_token_limit = 970000 # mine\nmodel = "gpt"\n';
  const set = mergeTopKeys(own, { model_auto_compact_token_limit: 900000 });
  assert.equal(set, 'model_auto_compact_token_limit = 900000\nmodel = "gpt"\n');
  assert.equal(mergeTopKeys(set, {}, { model_auto_compact_token_limit: 900000 }), 'model = "gpt"\n');
  assert.equal(mergeTopKeys(own, {}, { model_auto_compact_token_limit: 900000 }), own);
});

test('the build owns its permission rules one by one, so the user own rules survive', () => {
  const user = { permissions: { allow: ['Bash(npm test:*)'], deny: ['Read(./.env)'], defaultMode: 'acceptEdits' } };
  const first = mergeSettings(user, { permissions: { allow: ['Bash(gh pr merge:*)'] } }, null, []);
  assert.deepEqual(first.settings.permissions, { allow: ['Bash(npm test:*)', 'Bash(gh pr merge:*)'], deny: ['Read(./.env)'], defaultMode: 'acceptEdits' });
  const again = mergeSettings(first.settings, { permissions: { allow: ['Bash(gh pr merge:*)'] } }, first.owned, []);
  assert.deepEqual(again.settings.permissions, first.settings.permissions);
  const off = mergeSettings(again.settings, {}, again.owned, []);
  assert.deepEqual(off.settings.permissions, { allow: ['Bash(npm test:*)'], deny: ['Read(./.env)'], defaultMode: 'acceptEdits' });
  const had = mergeSettings({ permissions: { allow: ['Bash(gh pr merge:*)'] } }, { permissions: { allow: ['Bash(gh pr merge:*)'] } }, null, []);
  const kept = mergeSettings(had.settings, {}, had.owned, []);
  assert.deepEqual(kept.settings.permissions, { allow: ['Bash(gh pr merge:*)'] });
});

test('the build owns env entry by entry, so the user own variables survive', () => {
  const user = { env: { MINE: '1', CLAUDE_CODE_ENABLE_CFC: '1' } };
  const first = mergeSettings(user, { env: { A: 'x', CLAUDE_CODE_ENABLE_CFC: '1' } }, null, []);
  assert.deepEqual(first.settings.env, { MINE: '1', CLAUDE_CODE_ENABLE_CFC: '1', A: 'x' });
  const off = mergeSettings(first.settings, { env: { A: 'x' } }, first.owned, []);
  assert.deepEqual(off.settings.env, { MINE: '1', A: 'x' });
  assert.deepEqual(mergeSettings(off.settings, {}, off.owned, []).settings, { env: { MINE: '1' } });
});

test('agent settings default to browser off, no attribution, telemetry on, no auto-compact', () => {
  const repo = resolve('.');
  const config = validateConfig({}, repo);
  assert.deepEqual([config.browser, config.attribution, config.telemetry, config.autoCompact], [false, false, true, null]);
  assert.equal(validateConfig({ autoCompact: { tokens: 900000 } }, repo).autoCompact, 900000);
  assert.throws(() => validateConfig({ autoCompact: { tokens: 99999 } }, repo), /autoCompact\.tokens/);
  assert.throws(() => validateConfig({ telemetry: { enabled: 'no' } }, repo), /telemetry\.enabled: must be true or false/);
});

test('oneshot release defaults to pr, takes production, refuses anything else, and renders as a token', () => {
  const repo = resolve('.');
  assert.equal(validateConfig({}, repo).oneshotRelease, 'pr');
  const production = validateConfig({ oneshot: { release: 'production' } }, repo);
  assert.equal(production.oneshotRelease, 'production');
  assert.throws(() => validateConfig({ oneshot: { release: 'merge' } }, repo), /oneshot\.release: must be one of: pr, production/);
  assert.throws(() => validateConfig({ oneshot: { deploy: true } }, repo), /oneshot\.deploy: unknown key/);
  const values = tokenValues({ skills_dir: repo, agents_dir: repo, repo_dir: repo, target_dir: repo }, 'tilde', production);
  assert.equal(renderText('release: {{oneshot_release}}', values), 'release: production');
});

test('orchestration.parallel defaults to 4, refuses anything below one stage, and reaches series.mjs', () => {
  const repo = resolve('.');
  assert.equal(validateConfig({}, repo).parallel, 4);
  for (const parallel of [0, 1.5, '2']) {
    assert.throws(() => validateConfig({ orchestration: { parallel } }, repo), /orchestration\.parallel: must be a whole number/);
  }
  const config = validateConfig({ orchestration: { parallel: 2 } }, repo);
  const rendered = renderFile(resolve('skills/oneshot/series.mjs'), tokenValues(Object.fromEntries(['skills_dir', 'agents_dir', 'repo_dir', 'target_dir'].map((t) => [t, repo])), 'tilde', config)).toString();
  assert.match(rendered, /Number\.parseInt\('2', 10\)/);
});

test('executors default to the measured tiers, take a tier override, and refuse an unknown provider, tier, or effort', () => {
  const repo = resolve('.');
  const { executors } = validateConfig({}, repo);
  assert.deepEqual(Object.fromEntries(Object.entries(executors).map(([name, e]) => [name, e.enabled])), { claude: true, codex: true, grok: false, cursor: false });
  assert.deepEqual(executors.claude.tiers.build, { model: 'opus', effort: 'medium' });
  assert.deepEqual(executors.cursor.tiers, {});
  const sonnet = validateConfig({ executors: { claude: { build: { model: 'sonnet', effort: 'high' } } } }, repo).executors.claude.tiers;
  assert.deepEqual([sonnet.build, sonnet.lead], [{ model: 'sonnet', effort: 'high' }, { model: 'opus', effort: 'high' }]);
  assert.throws(() => validateConfig({ executors: { gemini: { enabled: true } } }, repo), /executors\.gemini: unknown key, expected one of: claude, codex, grok, cursor/);
  assert.throws(() => validateConfig({ executors: { claude: { review: { model: 'opus' } } } }, repo), /executors\.claude\.review: unknown key, expected one of: enabled, lead, build, light/);
  assert.throws(() => validateConfig({ executors: { codex: { build: { effort: 'max' } } } }, repo), /executors\.codex\.build\.effort: must be one of: low, medium, high/);
  assert.throws(() => validateConfig({ executors: { cursor: { build: { model: 'x', effort: 'high' } } } }, repo), /executors\.cursor\.build\.effort: unknown key/);
  assert.throws(() => validateConfig({ executors: { grok: { light: { model: 'grok 4' } } } }, repo), /executors\.grok\.light\.model: must be a plain name/);
});

test('the executor table lists enabled executors only, and says when one has no build model', () => {
  const repo = resolve('.');
  const config = validateConfig({ executors: { codex: { enabled: false }, grok: { enabled: true }, cursor: { enabled: true } } }, repo);
  const rows = executorsTable(config.executors).split('\n').filter((line) => /^\| [a-z]/.test(line));
  assert.deepEqual(rows, [
    '| claude | lead | opus | high |', '| claude | build | opus | medium |', '| claude | light | haiku | high |',
    '| grok | lead | grok-4.7 | high |', '| grok | build | grok-4.7 | high |', '| grok | light | grok-4.7 | high |',
  ]);
  assert.match(executorsTable(config.executors), /cursor is enabled with no build model, so it runs no stage/);
  const lightOnly = validateConfig({ executors: { cursor: { enabled: true, light: { model: 'cursor-x' } } } }, repo);
  assert.match(executorsTable(lightOnly.executors), /\| cursor \| light \| cursor-x \| default \|\n\ncursor is enabled with no build model/);
  const none = validateConfig({ executors: { claude: { enabled: false }, codex: { enabled: false } } }, repo);
  assert.match(executorsTable(none.executors), /No enabled executor has a model/);
});

test('a recommendation reaches the executor table, and one to an executor that runs no stage falls back', () => {
  const repo = resolve('.');
  const assign = [{ work: 'code, API, infrastructure', executor: 'codex' }, { work: ' screens and copy ', executor: 'claude' }];
  const config = validateConfig({ executors: { assign } }, repo);
  assert.match(executorsTable(config.executors, config.assignments), /## Recommendations[\s\S]*\| Work \| Executor \|\n\| --- \| --- \|\n\| code, API, infrastructure \| codex \|\n\| screens and copy \| claude \|\n$/);
  assert.doesNotMatch(executorsTable(validateConfig({}, repo).executors, []), /\| Work \|/);
  const off = validateConfig({ executors: { codex: { enabled: false }, assign: [{ work: 'code', executor: 'codex' }, { work: 'ui', executor: 'cursor' }] } }, repo);
  assert.match(executorsTable(off.executors, off.assignments), /codex is off, so its rows fall back to the tiers\.\n\ncursor is off, so its rows fall back/);
  const noBuild = validateConfig({ executors: { cursor: { enabled: true }, assign: [{ work: 'ui', executor: 'cursor' }] } }, repo);
  assert.match(executorsTable(noBuild.executors, noBuild.assignments), /cursor has no build model, so its rows fall back to the tiers/);
  assert.throws(() => validateConfig({ executors: { assign: [{ work: 'code', executor: 'gemini' }] } }, repo), /executors\.assign\.0\.executor: must be one of: claude, codex, grok, cursor/);
  assert.throws(() => validateConfig({ executors: { assign: [{ work: 'a | b', executor: 'codex' }] } }, repo), /executors\.assign\.0\.work: must be one line/);
  assert.throws(() => validateConfig({ executors: { assign: [{ work: 'code\rui', executor: 'codex' }] } }, repo), /executors\.assign\.0\.work: must be one line/);
  assert.throws(() => validateConfig({ executors: { assign: [{ work: 'code', executor: 'claude' }, { work: ' code', executor: 'codex' }] } }, repo), /executors\.assign\.1\.work: repeats an earlier entry, "code"/);
  assert.throws(() => validateConfig({ executors: { assign: { work: 'code', executor: 'codex' } } }, repo), /executors\.assign: must be a list/);
  assert.throws(() => validateConfig({ executors: { assign: [{ work: '  ', executor: 'codex' }] } }, repo), /executors\.assign\.0\.work: is empty/);
});

test('a disabled skill that was merged or renamed keeps the config valid, and an unknown one still fails', () => {
  const repo = resolve('.');
  assert.deepEqual(validateConfig({ skills: { disabled: ['gardener', 'architecture-scan', 'deslop'] } }, repo).disabledSkills, ['deslop']);
  assert.deepEqual(validateConfig({ skills: { disabled: ['improve'] } }, repo).disabledSkills, ['improve-code']);
  assert.throws(() => validateConfig({ skills: { disabled: ['nope'] } }, repo), /no skill named "nope"/);
});

test('Grok review needs explicit consent and accepts its model and effort', () => {
  const repo = resolve('.');
  assert.equal(validateConfig({}, repo).reviewers.grok.enabled, false);
  const config = validateConfig({ externalReview: { grok: { enabled: true, model: 'grok-4.7', effort: 'high' } } }, repo);
  assert.deepEqual(config.reviewers.grok, { enabled: true, model: 'grok-4.7', effort: 'high', timeoutMinutes: 20 });
});

test('the settings page puts every skill under a stage, so none falls into Other', () => {
  const page = readFileSync(resolve('ui/index.html'), 'utf8');
  const stages = page.match(/const STAGES = \[([\s\S]*?)\n\];/)[1];
  const staged = new Set([...stages.matchAll(/"([a-z][a-z-]*)"/g)].map((m) => m[1]));
  assert.deepEqual(listSkills(resolve('.')).filter((name) => !staged.has(name)), []);
});

test('no text names an agent file by extension, since each agent host stores it differently', () => {
  const names = walk(resolve('agents')).map((f) => f.rel.replace(/\.md$/, ''));
  const file = new RegExp(`\\b(?:${names.join('|')})\\.(?:agent\\.)?(?:md|toml)\\b`, 'g');
  const texts = [resolve('AGENTS.md'), ...walk(resolve('skills')).map((f) => f.abs)];
  const hits = texts.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(file)].map((m) => `${f}: ${m[0]}`));
  assert.deepEqual(hits, []);
});

test('the build links the oner command once and leaves a command it does not own', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'oner-command-')));
  const home = process.env.HOME;
  process.env.HOME = join(root, 'home');
  t.after(() => {
    process.env.HOME = home;
    rmSync(root, { recursive: true, force: true });
  });
  const repo = join(root, 'oner');
  mkdirSync(join(repo, 'bin'), { recursive: true });
  writeFileSync(join(repo, 'bin', 'oner.mjs'), '');
  const targets = Object.fromEntries(Object.keys(TARGETS).map((name) => [name, { enabled: false, dir: join(root, name) }]));
  const config = validateConfig({ targets }, repo);
  const link = join(root, 'home', '.local', 'bin', 'oner');
  const command = (auto = false) => build(repo, config, { auto }).filter((line) => line.startsWith('command: '));

  assert.match(command()[0], /^command: linked \(.+\/\.local\/bin\/oner\)/);
  assert.equal(readlinkSync(link), join(repo, 'bin', 'oner.mjs'));
  assert.deepEqual(command(), [`command: up to date (${link})`]);
  assert.deepEqual(command(true), []);

  const other = join(root, 'other.mjs');
  writeFileSync(other, '');
  rmSync(link);
  symlinkSync(other, link);
  assert.deepEqual(command(), [`command: ${link} links to ${other}, left as it is`]);
  assert.equal(readlinkSync(link), other);

  rmSync(other);
  assert.match(command()[0], new RegExp(`^command: relinked from ${other}, which no longer exists`));
  assert.equal(readlinkSync(link), join(repo, 'bin', 'oner.mjs'));

  rmSync(link);
  writeFileSync(link, 'mine\n');
  assert.deepEqual(command(), [`command: ${link} is not a link, left as it is`]);
  assert.equal(readFileSync(link, 'utf8'), 'mine\n');

  rmSync(link);
  chmodSync(dirname(link), 0o555);
  try {
    assert.match(command()[0], /^command: could not link .+: EACCES/);
  } finally {
    chmodSync(dirname(link), 0o755);
  }
});

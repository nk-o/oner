import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { mergeTables, mergeTopKeys } from '../build/codex-config.mjs';
import { validateConfig } from '../build/config.mjs';
import { mergeSettings } from '../build/install.mjs';

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

test('Grok review needs explicit consent and accepts its model and effort', () => {
  const repo = resolve('.');
  assert.equal(validateConfig({}, repo).reviewers.grok.enabled, false);
  const config = validateConfig({ externalReview: { grok: { enabled: true, model: 'grok-4.7', effort: 'high' } } }, repo);
  assert.deepEqual(config.reviewers.grok, { enabled: true, model: 'grok-4.7', effort: 'high' });
});

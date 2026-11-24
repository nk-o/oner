import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { validateConfig } from '../build/config.mjs';
import { CHUNK_LIMIT, chunkInstructions, toolPath, writeEvalPlugin } from '../build/eval.mjs';
import { walk } from '../build/render.mjs';

const repo = resolve('.');
const root = mkdtempSync(join(realpathSync(tmpdir()), 'eval-'));
after(() => rmSync(root, { recursive: true, force: true }));

test('chunks stay under the hook limit and rejoin to the instructions', () => {
  const text = ['# Rules', 'a'.repeat(5000), 'b'.repeat(5000), 'c'.repeat(20000), 'end'].join('\n\n');
  const chunks = chunkInstructions(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.length >= 5);
  for (const c of chunks) assert.ok(c.length <= CHUNK_LIMIT, `chunk of ${c.length}`);
});

test('the eval plugin carries skills, the instructions as hooks, and the cases', () => {
  const dir = join(root, 'plugin');
  writeEvalPlugin(repo, validateConfig({}, repo), dir);

  const hooks = JSON.parse(readFileSync(join(dir, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const commands = (event) => hooks[event].flatMap((e) => e.hooks.map((h) => h.command));
  const context = readdirSync(join(dir, 'context')).sort();
  assert.deepEqual(
    commands('SessionStart').filter((c) => c.includes('/context/')),
    context.map((f) => `cat "\${CLAUDE_PLUGIN_ROOT}/context/${f}"`),
  );
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Stop']) {
    assert.ok(commands(event).includes('"${CLAUDE_PLUGIN_ROOT}/skills/oneshot/hook.sh"'), `${event} runs the oneshot hook`);
  }
  assert.ok(!Object.values(hooks).flat().some((e) => e.hooks.some((h) => /build\.mjs|update-check|devservers/.test(h.command))));
  const instructions = context.map((f) => readFileSync(join(dir, 'context', f), 'utf8')).join('');
  assert.match(instructions, /^These rules are installed for Claude Code\./);
  assert.match(instructions, /## Whole tasks/);

  const oneshot = readFileSync(join(dir, 'skills', 'oneshot', 'SKILL.md'), 'utf8');
  assert.ok(oneshot.includes(join(dir, 'skills')), 'skill paths point into the plugin');
  for (const f of walk(join(dir, 'skills'))) {
    assert.ok(!readFileSync(f.abs, 'utf8').includes('~/.claude/skills'), `${f.rel} points at the installed copy`);
  }
  assert.equal(JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'oner');
  assert.ok(walk(join(dir, 'evals')).some((f) => f.rel.endsWith('prompt.md')));
});

test('toolPath skips the xcrun git and version-manager shims', () => {
  const shimDir = join(root, 'shims');
  const xcrunDir = join(root, 'xcrun');
  const realDir = join(root, 'real');
  for (const d of [shimDir, xcrunDir, realDir]) mkdirSync(d);
  writeFileSync(join(root, 'mise'), '');
  symlinkSync(join(root, 'mise'), join(shimDir, 'git'));
  symlinkSync('/usr/bin/git', join(xcrunDir, 'git'));
  writeFileSync(join(realDir, 'git'), '');
  assert.equal(toolPath('git', [shimDir, xcrunDir, realDir].join(delimiter)), realDir);
  assert.equal(toolPath('git', [shimDir, xcrunDir].join(delimiter)), null);
});

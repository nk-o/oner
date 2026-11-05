import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createEditor, hashOf } from '../panel/editor.mjs';

const roots = [];
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

function setup({ rebuild = () => ['claude: built'] } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'panel-editor-'));
  roots.push(repo);
  mkdirSync(join(repo, 'skills', 'shared'), { recursive: true });
  writeFileSync(join(repo, 'skills', 'shared', 'SKILL.md'), '---\nname: shared\n---\n');
  mkdirSync(join(repo, 'local', 'skills', 'mine'), { recursive: true });
  const file = join(repo, 'local', 'skills', 'mine', 'SKILL.md');
  writeFileSync(file, 'one');
  let time = 1000;
  return { repo, file, editor: createEditor({ repo, rebuild, clock: () => time++ }) };
}
const PATH = 'skills/mine/SKILL.md';

test('paths outside the local files are refused', () => {
  const { editor, repo } = setup();
  for (const path of ['../config.json', 'skills/mine/../../../config.json', '.history/1/x', 'skills/.hidden/x', 'other.md', 'skills/mine', '/etc/passwd', 'skills/UP/x']) {
    assert.throws(() => editor.save({ path, text: 'x', baseHash: null }), /outside/, path);
  }
  assert.equal(existsSync(join(repo, 'config.json')), false);
});

test('a symlink on the way is refused', () => {
  const { editor, repo } = setup();
  symlinkSync(join(repo, 'skills'), join(repo, 'local', 'skills', 'link'));
  assert.throws(() => editor.read('skills/link/shared/SKILL.md'), /symlink/);
  assert.throws(() => editor.save({ path: 'skills/link/x.md', text: 'x', baseHash: null }), /symlink/);
});

test('saving keeps the previous version and returns the new hash', () => {
  const { editor, file } = setup();
  const { hash } = editor.read(PATH);
  const out = editor.save({ path: PATH, text: 'two', baseHash: hash });
  assert.equal(out.changed, true);
  assert.equal(out.hash, hashOf('two'));
  assert.equal(readFileSync(file, 'utf8'), 'two');
  const [version] = editor.versions(PATH);
  assert.equal(editor.version(PATH, version.id).text, 'one');
});

test('saving identical text changes nothing and keeps no version', () => {
  let builds = 0;
  const { editor } = setup({ rebuild: () => { builds++; return []; } });
  const { hash, text } = editor.read(PATH);
  assert.equal(editor.save({ path: PATH, text, baseHash: hash }).changed, false);
  assert.equal(builds, 0);
  assert.deepEqual(editor.versions(PATH), []);
});

test('a file changed on disk refuses the save and returns the disk version', () => {
  const { editor, file } = setup();
  const { hash } = editor.read(PATH);
  writeFileSync(file, 'an agent wrote this');
  assert.throws(() => editor.save({ path: PATH, text: 'mine', baseHash: hash }), (err) => {
    assert.equal(err.status, 409);
    assert.equal(err.extra.disk, 'an agent wrote this');
    return true;
  });
  assert.equal(readFileSync(file, 'utf8'), 'an agent wrote this');
});

test('a build that refuses restores the file and reports why', () => {
  let builds = 0;
  const { editor, file } = setup({ rebuild: () => { if (++builds === 1) throw new Error('bad frontmatter'); return []; } });
  const { hash } = editor.read(PATH);
  assert.throws(() => editor.save({ path: PATH, text: 'broken', baseHash: hash }), /bad frontmatter/);
  assert.equal(readFileSync(file, 'utf8'), 'one');
  assert.equal(builds, 2);
  assert.deepEqual(editor.versions(PATH), []);
});

test('a new name that collides with a shared skill is refused before the build', () => {
  let builds = 0;
  const { editor } = setup({ rebuild: () => { builds++; return []; } });
  assert.throws(() => editor.create({ name: 'shared' }), /shared skill/);
  assert.throws(() => editor.create({ name: 'Bad Name' }), /lowercase/);
  assert.throws(() => editor.create({ name: 'mine' }), /already exists/);
  assert.equal(builds, 0);
});

test('create writes a skill the build can read, and a failed build removes it', () => {
  const { editor, repo } = setup();
  const out = editor.create({ name: 'fresh', description: 'Does: a thing' });
  assert.match(readFileSync(join(repo, 'local', out.path), 'utf8'), /^---\nname: fresh\ndescription: "Does: a thing"\n---/);
  const failing = setup({ rebuild: () => { throw new Error('no'); } });
  assert.throws(() => failing.editor.create({ name: 'fresh' }), /no/);
  assert.equal(existsSync(join(failing.repo, 'local', 'skills', 'fresh')), false);
});

test('delete moves the skill to the history and restore brings it back', () => {
  const { editor, repo, file } = setup();
  const { id } = editor.delete({ name: 'mine' });
  assert.equal(existsSync(file), false);
  assert.deepEqual(editor.list().skills, []);
  assert.deepEqual(editor.deleted().map((d) => d.name), ['mine']);
  editor.restore({ id, name: 'mine' });
  assert.equal(readFileSync(join(repo, 'local', PATH), 'utf8'), 'one');
  assert.deepEqual(editor.deleted(), []);
});

test('a delete the build refuses leaves the skill in place', () => {
  const { editor, file } = setup({ rebuild: () => { throw new Error('no'); } });
  assert.throws(() => editor.delete({ name: 'mine' }), /no/);
  assert.equal(existsSync(file), true);
});

test('a new file needs its skill, and the rules file can be created', () => {
  const { editor, repo } = setup();
  assert.throws(() => editor.save({ path: 'skills/absent/x.md', text: 'x', baseHash: null }), /Create the skill/);
  assert.equal(editor.read('AGENTS.md').hash, null);
  editor.save({ path: 'AGENTS.md', text: 'rules', baseHash: null });
  assert.equal(readFileSync(join(repo, 'local', 'AGENTS.md'), 'utf8'), 'rules');
});

test('a binary file is listed but not editable', () => {
  const { editor, repo } = setup();
  writeFileSync(join(repo, 'local', 'skills', 'mine', 'logo.png'), Buffer.from([0x89, 0, 1, 2]));
  const [skill] = editor.list().skills;
  assert.deepEqual(skill.files.map((f) => [f.name, f.editable]), [['SKILL.md', true], ['logo.png', false]]);
  assert.throws(() => editor.read('skills/mine/logo.png'), /not a text file/);
});

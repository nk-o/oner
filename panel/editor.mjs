import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { skillDescription } from '../build/status.mjs';
import { listSkills } from '../build/config.mjs';

const MAX_BYTES = 1024 * 1024;
const NAME = /^[a-z0-9][a-z0-9-]*$/;

export class EditorError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const hashOf = (text) => createHash('sha256').update(text).digest('hex');

const isText = (buffer) => buffer.length <= MAX_BYTES && !buffer.includes(0) && Buffer.from(buffer.toString('utf8')).equals(buffer);

// Edits the files under local/, whose only copy is on this disk. Each write keeps the
// previous version under local/.history, which the build does not read, and goes back
// when the build refuses it. `rebuild` runs the same build a settings save does.
export function createEditor({ repo, rebuild, clock = Date.now }) {
  const local = join(repo, 'local');
  const historyRoot = join(local, '.history');

  // Allowed: skills/<name>/<file> and AGENTS.md, with no symlink on the way.
  function resolve(path) {
    if (typeof path !== 'string' || !path || path.includes('\0')) throw new EditorError('Expected a file path.');
    const parts = path.split('/');
    const allowed = path === 'AGENTS.md' || (parts[0] === 'skills' && parts.length >= 3 && NAME.test(parts[1]));
    if (!allowed || parts.some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))) {
      throw new EditorError(`${path} is outside the files this page edits.`, 403);
    }
    let current = local;
    for (const part of parts) {
      current = join(current, part);
      if (isLink(current)) throw new EditorError(`${path} goes through a symlink, which this page does not follow.`, 403);
    }
    return current;
  }

  function isLink(path) {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  }

  function keep(path, content) {
    const folder = join(historyRoot, String(clock()));
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
    return folder;
  }

  function buildOrRestore(restore) {
    try {
      return rebuild();
    } catch (err) {
      restore();
      // Targets built before the refusal got the new files, so they are built back.
      try {
        rebuild();
      } catch {}
      throw new EditorError(String(err?.message ?? err));
    }
  }

  function walk(dir, prefix = '') {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (b.name === 'SKILL.md') - (a.name === 'SKILL.md') || a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) files.push(...walk(join(dir, entry.name), rel));
      else if (entry.isFile()) files.push({ rel, abs: join(dir, entry.name) });
    }
    return files;
  }

  return {
    list() {
      const root = join(local, 'skills');
      const skills = existsSync(root)
        ? readdirSync(root, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .map((d) => d.name)
            .sort()
            .map((name) => ({
              name,
              description: skillDescription(join(root, name, 'SKILL.md')),
              files: walk(join(root, name)).map(({ rel, abs }) => ({
                path: `skills/${name}/${rel}`,
                name: rel,
                editable: isText(readFileSync(abs)),
              })),
            }))
        : [];
      return { skills, agents: existsSync(join(local, 'AGENTS.md')), deleted: this.deleted() };
    },

    read(path) {
      const abs = resolve(path);
      if (!existsSync(abs)) {
        if (path === 'AGENTS.md') return { path, text: '', hash: null };
        throw new EditorError(`${path} does not exist.`, 404);
      }
      const buffer = readFileSync(abs);
      if (!isText(buffer)) throw new EditorError(`${path} is not a text file this page can edit.`);
      return { path, text: buffer.toString('utf8'), hash: hashOf(buffer) };
    },

    // baseHash is the version the text was edited from, null for a new file.
    save({ path, text, baseHash }) {
      const abs = resolve(path);
      if (typeof text !== 'string') throw new EditorError('Expected the file text.');
      if (Buffer.byteLength(text) > MAX_BYTES) throw new EditorError('The file is larger than this page edits.', 413);
      const exists = existsSync(abs);
      const before = exists ? readFileSync(abs) : null;
      const current = before ? hashOf(before) : null;
      if (current !== (baseHash ?? null)) {
        throw new EditorError(`${path} changed on disk after you opened it.`, 409, { disk: before?.toString('utf8') ?? '', hash: current });
      }
      if (before?.toString('utf8') === text) return { path, hash: current, changed: false, lines: [] };
      if (!exists && path !== 'AGENTS.md' && !existsSync(join(local, 'skills', path.split('/')[1]))) {
        throw new EditorError(`Create the skill ${path.split('/')[1]} first.`, 404);
      }
      const mode = exists ? statSync(abs).mode & 0o777 : 0o644;
      const kept = before && keep(path, before);
      mkdirSync(dirname(abs), { recursive: true });
      const temporary = `${abs}.${process.pid}.tmp`;
      writeFileSync(temporary, text);
      chmodSync(temporary, mode);
      renameSync(temporary, abs);
      const lines = buildOrRestore(() => {
        if (before) writeFileSync(abs, before);
        else rmSync(abs);
        if (kept) rmSync(kept, { recursive: true });
      });
      return { path, hash: hashOf(text), changed: true, lines };
    },

    create({ name, description }) {
      if (typeof name !== 'string' || !NAME.test(name)) throw new EditorError('Use lowercase letters, digits, and dashes for the name.');
      if (listSkills(repo).includes(name)) throw new EditorError(`${name} is already a shared skill. Pick another name.`, 409);
      const dir = join(local, 'skills', name);
      if (existsSync(dir)) throw new EditorError(`${name} already exists.`, 409);
      const about = typeof description === 'string' && description.trim() ? description.trim().replace(/\s+/g, ' ') : `What ${name} does and when to use it.`;
      const text = `---\nname: ${name}\ndescription: ${JSON.stringify(about)}\n---\n\n# ${name}\n`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), text);
      const lines = buildOrRestore(() => rmSync(dir, { recursive: true, force: true }));
      return { path: `skills/${name}/SKILL.md`, hash: hashOf(text), lines };
    },

    // The skill moves into the history, so a delete can be undone from the page.
    delete({ name }) {
      if (typeof name !== 'string' || !NAME.test(name)) throw new EditorError('Expected a skill name.');
      const dir = join(local, 'skills', name);
      resolve(`skills/${name}/SKILL.md`);
      if (!existsSync(dir)) throw new EditorError(`${name} does not exist.`, 404);
      const id = String(clock());
      const moved = join(historyRoot, id, 'deleted', name);
      mkdirSync(dirname(moved), { recursive: true });
      renameSync(dir, moved);
      const lines = buildOrRestore(() => renameSync(moved, dir));
      return { id, lines };
    },

    deleted() {
      if (!existsSync(historyRoot)) return [];
      const out = [];
      for (const id of readdirSync(historyRoot)) {
        const dir = join(historyRoot, id, 'deleted');
        if (!existsSync(dir)) continue;
        for (const name of readdirSync(dir)) out.push({ id, name, at: Number(id) });
      }
      return out.sort((a, b) => b.at - a.at);
    },

    restore({ id, name }) {
      if (typeof id !== 'string' || !/^\d+$/.test(id) || typeof name !== 'string' || !NAME.test(name)) throw new EditorError('Expected a deleted skill.');
      const moved = join(historyRoot, id, 'deleted', name);
      if (!existsSync(moved)) throw new EditorError(`${name} is not in the history.`, 404);
      const dir = join(local, 'skills', name);
      if (existsSync(dir)) throw new EditorError(`${name} exists again. Delete or rename it first.`, 409);
      mkdirSync(dirname(dir), { recursive: true });
      renameSync(moved, dir);
      const lines = buildOrRestore(() => renameSync(dir, moved));
      return { path: `skills/${name}/SKILL.md`, lines };
    },

    versions(path) {
      resolve(path);
      if (!existsSync(historyRoot)) return [];
      return readdirSync(historyRoot)
        .filter((id) => existsSync(join(historyRoot, id, path)))
        .map((id) => ({ id, at: Number(id) }))
        .sort((a, b) => b.at - a.at);
    },

    version(path, id) {
      resolve(path);
      if (typeof id !== 'string' || !/^\d+$/.test(id)) throw new EditorError('Expected a version.');
      const file = join(historyRoot, id, path);
      if (!existsSync(file)) throw new EditorError('That version is gone.', 404);
      return { path, text: readFileSync(file, 'utf8') };
    },
  };
}

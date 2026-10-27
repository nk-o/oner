// Builds the sanitized repository copy that external reviewers read.
//
// History: fresh Git objects for the original merge-base and HEAD, the sanitized source index,
// then the current tracked and untracked source files. No original history, messages, authors,
// remotes, hooks, or object-store links are copied. Whole files and callers stay available.
//
// Encoding and filters: Git normalizes text and encoding before the copy reaches reviewers.
// Source clean and smudge filters never run. A filtered working file is omitted, its staged
// blob stays, and stderr says its current contents were not reviewed. A file whose working-tree
// encoding Git cannot convert is omitted the same way, with a reason.
//
// Exclusions, from every version: environment files, common credential files, keys,
// certificates, data dumps, and files matching repository or user ignore rules. Unsupported
// symlink and submodule states are omitted; their regular committed versions stay. Paths
// beneath a current directory symlink are excluded entirely, because Git cannot classify their
// ignore rules without traversing that link. Agent runtime directories and MCP configuration
// are omitted so copied project hooks, skills, and servers cannot run when a reviewer starts.
// stderr lists every exclusion. A change made only of excluded files exits 3 in ext-review.sh
// without a provider call.
//
// This controls the review input; it is not a filesystem sandbox for arbitrary absolute reads.
// Reviewers are instructed to stay inside the copy. The copy is removed after review, and the
// report files remain.

import { execFileSync } from 'node:child_process';
import { chmodSync, closeSync, copyFileSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

function gitEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
}

function sourceGitConfig(root, key) {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  try {
    return execFileSync('git', ['-C', root, 'config', '--path', '--get', key], {
      env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).replace(/\r?\n$/, '');
  } catch (error) {
    if (error.status !== 1) throw error;
    return undefined;
  }
}

function sourceIgnoreFile(root) {
  const file = sourceGitConfig(root, 'core.excludesFile');
  return file ? resolve(root, file) : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'git', 'ignore');
}

const env = {
  ...gitEnvironment(), GIT_ATTR_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Code review', GIT_AUTHOR_EMAIL: 'review@example.invalid',
  GIT_COMMITTER_NAME: 'Code review', GIT_COMMITTER_EMAIL: 'review@example.invalid',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
};

function git(root, args, input, allowed = [], stdio = ['pipe', 'pipe', 'pipe']) {
  try {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.attributesFile=/dev/null', '-C', root, ...args], {
      env, input, maxBuffer: 64 * 1024 * 1024, stdio,
    });
  } catch (error) {
    if (allowed.includes(error.status)) return error.stdout;
    throw new Error(`git ${args[0]} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

function paths(buffer, keepEmpty = false) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text).equals(buffer)) throw new Error('review paths must use UTF-8');
  return keepEmpty ? text.split('\0').slice(0, -1) : text.split('\0').filter(Boolean);
}

function tree(root, ref) {
  return new Map(paths(git(root, ['ls-tree', '-rz', '--full-tree', ref])).map(record => {
    const tab = record.indexOf('\t');
    const [mode, type, sha] = record.slice(0, tab).split(' ');
    return [record.slice(tab + 1), { mode, type, sha }];
  }));
}

function writeBlob(source, sha, target) {
  const descriptor = openSync(target, 'w', 0o600);
  try { git(source, ['cat-file', 'blob', sha], undefined, [], ['ignore', descriptor, 'pipe']); }
  finally { closeSync(descriptor); }
}

function sensitive(path) {
  const parts = path.toLowerCase().split('/');
  const name = parts.at(-1);
  if (parts.some(part => ['.claude', '.cursor', '.codex', '.agents'].includes(part)) || name === '.mcp.json') return 'agent runtime configuration';
  if (parts.some(part => ['.git', '.ssh', '.aws', '.gnupg', '.azure', '.docker'].includes(part))) return 'private or Git directory';
  if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env') || name === '.envrc' || name.startsWith('.envrc.')) return 'environment file';
  if (['.npmrc', '.netrc', 'credentials', 'credentials.json', 'credentials.yaml', 'credentials.yml', 'secrets.json', 'secrets.yaml', 'secrets.yml'].includes(name)) return 'credential file';
  if (/\.(pem|key|p12|pfx|crt|cer|der|jks|keystore)$/.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(name)) return 'key or certificate';
  if (/\.(dump|bak|sqlite|sqlite3|db)$/.test(name) || /(^|[._-])(dump|backup)[._-].*sql(\.(gz|bz2|xz|zip))?$/.test(name) || /^(dump|backup)\.sql(\.(gz|bz2|xz|zip))?$/.test(name)) return 'data dump';
  return '';
}

function localFile(root, path) {
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(`unsafe review path ${JSON.stringify(path)}`);
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { absent: true };
      throw error;
    }
    if (stat.isSymbolicLink()) return { excluded: i < parts.length - 1 ? 'directory symbolic link' : 'symbolic link' };
    if (i < parts.length - 1 && !stat.isDirectory()) return { absent: true };
    if (i === parts.length - 1) {
      if (stat.isDirectory()) return { absent: true };
      if (!stat.isFile()) return { excluded: 'non-regular file' };
      return { file: current, mode: stat.mode & 0o111 ? '100755' : '100644' };
    }
  }
}

export function prepareSnapshot(source, base, destination) {
  source = resolve(source);
  destination = resolve(destination);
  if (git(source, ['rev-parse', '--is-bare-repository']).toString().trim() === 'true') throw new Error('review needs a working checkout; run from a linked worktree');
  base = git(source, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).toString().trim();
  const ancestor = git(source, ['merge-base', base, 'HEAD']).toString().trim();
  const baseline = tree(source, ancestor), head = tree(source, 'HEAD');
  const tracked = paths(git(source, ['ls-files', '-z']));
  const skipped = new Set(paths(git(source, ['ls-files', '-v', '-z'])).filter(record => /^[Ss] /.test(record)).map(record => record.slice(2)));
  const indexEntries = paths(git(source, ['ls-files', '--stage', '-z'])).map(record => {
    const tab = record.indexOf('\t');
    const [mode, sha, stage] = record.slice(0, tab).split(' ');
    return [record.slice(tab + 1), { mode, sha, stage }];
  });
  const index = new Map(indexEntries.filter(([, entry]) => entry.stage === '0'));
  const changes = paths(git(source, ['diff', '--cached', '--name-status', '--no-renames', '--no-ext-diff', '--no-textconv', '--ita-invisible-in-index', '-z', '--']));
  const staged = new Map();
  for (let i = 0; i < changes.length; i += 2) staged.set(changes[i + 1], changes[i]);
  const intended = new Set([...index.keys()].filter(path => staged.get(path) === 'D' || (!head.has(path) && !staged.has(path))));
  const excludes = process.env.ONESHOT_REVIEW_EXCLUDES || sourceIgnoreFile(source);
  const untracked = paths(git(source, ['-c', `core.excludesFile=${excludes}`, 'ls-files', '--others', '--exclude-standard', '-z']));
  const all = [...new Set([...baseline.keys(), ...head.keys(), ...tracked, ...untracked])];
  const locals = new Map(all.map(path => [path, localFile(source, path)]));
  const checked = all.filter(path => locals.get(path).excluded !== 'directory symbolic link');
  const ignored = new Set(checked.length ? paths(git(source, ['-c', `core.excludesFile=${excludes}`, 'check-ignore', '--no-index', '-z', '--stdin'], Buffer.from(checked.join('\0') + '\0'), [1])) : []);
  const attributeFile = process.env.ONESHOT_REVIEW_ATTRIBUTES || sourceGitConfig(source, 'core.attributesFile') || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'git', 'attributes');
  const autocrlf = process.env.ONESHOT_REVIEW_AUTOCRLF || sourceGitConfig(source, 'core.autocrlf') || 'false';
  const attributes = new Map();
  if (checked.length) {
    const records = paths(git(source, ['-c', `core.attributesFile=${attributeFile}`, 'check-attr', '-z', '--stdin', 'filter', 'text', 'eol', 'working-tree-encoding', 'ident'], Buffer.from(checked.join('\0') + '\0')), true);
    for (let i = 0; i < records.length; i += 3) {
      const [path, name, value] = records.slice(i, i + 3);
      if (!attributes.has(path)) attributes.set(path, {});
      attributes.get(path)[name] = value;
    }
  }
  const excluded = new Map(), omitted = new Map(), current = new Map();
  for (const path of all) {
    const local = locals.get(path);
    const reason = sensitive(path) || (ignored.has(path) ? 'ignored file' : '') || (local.excluded === 'directory symbolic link' ? local.excluded : '');
    if (reason) excluded.set(path, reason);
    else if (local.excluded || (!local.absent && !['unspecified', 'unset'].includes(attributes.get(path)?.filter))) {
      omitted.set(path, local.excluded ? `current ${local.excluded}` : 'working-tree filter content');
      const staged = index.get(path);
      const safe = ['100644', '100755'].includes(staged?.mode) ? staged : staged && head.get(path);
      if (safe && ['100644', '100755'].includes(safe.mode)) current.set(path, safe);
    }
    else if (local.absent && skipped.has(path) && ['100644', '100755'].includes(index.get(path)?.mode)) current.set(path, index.get(path));
    else if (!local.absent) current.set(path, local);
  }

  mkdirSync(destination, { recursive: false, mode: 0o700 });
  git(destination, ['init', '--quiet', '--template=', '--initial-branch=review']);
  const blobs = new Map();
  function writeTree(entries, commitTree = true) {
    git(destination, ['read-tree', '--empty']);
    const index = [];
    for (const [path, entry] of entries) {
      if (excluded.has(path)) continue;
      if (!['100644', '100755'].includes(entry.mode)) { omitted.set(path, 'symlink or submodule state'); continue; }
      let sha = blobs.get(entry.sha);
      if (!sha) {
        const blob = join(destination, '.git', 'review-blob');
        writeBlob(source, entry.sha, blob);
        const descriptor = openSync(blob, 'r');
        try { sha = git(destination, ['hash-object', '-w', '--stdin'], undefined, [], [descriptor, 'pipe', 'pipe']).toString().trim(); }
        finally { closeSync(descriptor); unlinkSync(blob); }
        blobs.set(entry.sha, sha);
      }
      index.push(`${entry.mode} ${sha}${entry.stage ? ` ${entry.stage}` : ''}\t${path}\0`);
    }
    if (index.length) git(destination, ['update-index', '-z', '--index-info'], Buffer.from(index.join('')));
    if (commitTree) return git(destination, ['write-tree']).toString().trim();
  }
  const baseTree = writeTree(baseline), headTree = writeTree(head);
  const baseCommit = git(destination, ['commit-tree', baseTree], 'Review baseline\n').toString().trim();
  const headCommit = git(destination, ['commit-tree', headTree, '-p', baseCommit], 'Review changes\n').toString().trim();
  git(destination, ['update-ref', 'refs/heads/review-base', baseCommit]);
  git(destination, ['update-ref', 'refs/heads/review', headCommit]);
  writeTree(indexEntries.filter(([path]) => !intended.has(path)), false);
  const attributeOverride = join(destination, '.git', 'info', 'attributes');
  mkdirSync(dirname(attributeOverride), { recursive: true });
  for (const [path, entry] of current) {
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.sha) writeBlob(source, entry.sha, target);
    else if (autocrlf === 'false' && ['text', 'eol', 'working-tree-encoding', 'ident'].every(name => ['unspecified', 'unset'].includes(attributes.get(path)[name]))) copyFileSync(entry.file, target);
    else {
      const overrides = ['-filter'];
      for (const name of ['text', 'eol', 'working-tree-encoding', 'ident']) {
        const value = attributes.get(path)[name];
        if (/\s/.test(value)) throw new Error(`invalid ${name} attribute for ${JSON.stringify(path)}`);
        overrides.push(value === 'unspecified' ? `!${name}` : value === 'unset' ? `-${name}` : value === 'set' ? name : `${name}=${value}`);
      }
      // Use Git's own text conversion without loading or executing source filters.
      writeFileSync(attributeOverride, `* ${overrides.join(' ')}\n`);
      const descriptor = openSync(entry.file, 'r');
      let sha;
      try { sha = git(destination, ['-c', `core.autocrlf=${autocrlf}`, 'hash-object', '-w', `--path=${path}`, '--stdin'], undefined, [], [descriptor, 'pipe', 'pipe']).toString().trim(); }
      catch (error) {
        if (['unspecified', 'unset'].includes(attributes.get(path)['working-tree-encoding'])) throw error;
        omitted.set(path, `working-tree encoding failure: ${error.message}`);
      }
      finally { closeSync(descriptor); }
      if (sha) writeBlob(destination, sha, target);
      else {
        const staged = index.get(path);
        if (!['100644', '100755'].includes(staged?.mode)) continue;
        writeBlob(source, staged.sha, target);
        chmodSync(target, staged.mode === '100755' ? 0o755 : 0o644);
        continue;
      }
    }
    chmodSync(target, entry.mode === '100755' ? 0o755 : 0o644);
  }
  writeFileSync(attributeOverride, '* -filter -text !eol !working-tree-encoding -ident\n');
  const intentPaths = [...intended].filter(path => current.has(path) && !excluded.has(path));
  if (intentPaths.length) git(destination, ['add', '--intent-to-add', '--', ...intentPaths]);
  const hasCommitted = baseTree !== headTree;
  const hasLocal = git(destination, ['status', '--porcelain', '-z']).length > 0;
  return { hasCommitted, hasLocal, excluded: [...excluded, ...omitted].map(([path, reason]) => ({ path, reason })) };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source, base, destination, ...extra] = process.argv.slice(2);
    if (!source || !base || !destination || extra.length) throw new Error('usage: snapshot.mjs <repository> <base> <destination>');
    const result = prepareSnapshot(source, base, destination);
    for (const entry of result.excluded) console.error(`ext-review: excluded ${JSON.stringify(entry.path)} (${entry.reason})`);
    console.error('ext-review: reviewers receive an independent repository with sanitized baseline, HEAD and current files.');
    if (!result.hasCommitted && !result.hasLocal) process.exitCode = 3;
  } catch (error) {
    console.error(`ext-review: ${error.message}`);
    process.exitCode = 1;
  }
}

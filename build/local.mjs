import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BuildError } from './config.mjs';

function git(dir, ...args) {
  try {
    const output = execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -oBatchMode=yes' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    return args.includes('-z') ? output : output.trim();
  } catch (error) {
    throw new BuildError(`local: git ${args[0]} failed. ${String(error.stderr ?? error.message).trim()}`);
  }
}

function repositoryKey(repository) {
  if (isAbsolute(repository)) return resolve(repository);
  const scp = /^([^@]+)@([^:]+):(.+)$/.exec(repository);
  const url = new URL(scp ? `ssh://${scp[1]}@${scp[2]}/${scp[3]}` : repository);
  if (url.protocol === 'file:') return decodeURIComponent(url.pathname);
  return `${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}/${url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')}`;
}

function installClone(repo, local, repository) {
  const temporary = mkdtempSync(join(repo, '.local-clone-'));
  try {
    git(repo, 'clone', '--', repository, temporary);
    git(temporary, 'rev-parse', '--verify', 'HEAD');
    if (!existsSync(local)) {
      renameSync(temporary, local);
      return { state: 'cloned', line: 'local: cloned the personal repository' };
    }
    const paths = git(temporary, 'ls-files', '-z').split('\0').filter(Boolean);
    for (const path of paths) {
      let parent = dirname(join(local, path));
      while (parent !== local) {
        const stat = lstatSync(parent, { throwIfNoEntry: false });
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
          throw new BuildError(`local: ${relative(local, parent)} conflicts with the repository. Existing files were kept.`);
        }
        parent = dirname(parent);
      }
      const destination = join(local, path), source = join(temporary, path);
      const stat = lstatSync(destination, { throwIfNoEntry: false });
      if (!stat) continue;
      const sourceStat = lstatSync(source);
      const equal = stat.isFile() && sourceStat.isFile() && readFileSync(source).equals(readFileSync(destination))
        || stat.isSymbolicLink() && sourceStat.isSymbolicLink() && readlinkSync(source) === readlinkSync(destination);
      if (!equal) throw new BuildError(`local: ${path} differs from the repository. Existing files were kept.`);
    }
    for (const path of paths) {
      const source = join(temporary, path), destination = join(local, path);
      mkdirSync(dirname(destination), { recursive: true });
      try {
        if (lstatSync(source).isSymbolicLink()) symlinkSync(readlinkSync(source), destination);
        else copyFileSync(source, destination, constants.COPYFILE_EXCL);
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    renameSync(join(temporary, '.git'), join(local, '.git'));
    return { state: 'adopted', line: 'local: connected existing files to the personal repository' };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function syncLocal(repo, repository) {
  if (!repository) return { state: 'disabled', line: null };
  const local = join(repo, 'local');
  const stat = lstatSync(local, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new BuildError('local: expected a directory, not a symlink or file');
  }
  if (!lstatSync(join(local, '.git'), { throwIfNoEntry: false })) return installClone(repo, local, repository);
  if (git(local, 'rev-parse', '--show-toplevel') !== local) throw new BuildError('local: is not a separate Git checkout');
  const origin = git(local, 'remote', 'get-url', 'origin');
  if (repositoryKey(origin) !== repositoryKey(repository)) {
    throw new BuildError('local: origin does not match local.repository. Existing files were kept.');
  }
  if (git(local, 'status', '--porcelain')) {
    return { state: 'modified', line: 'local: uncommitted changes kept; commit them before downloading updates' };
  }
  if (!git(local, 'branch', '--show-current')) throw new BuildError('local: detached HEAD; switch to a branch before updating');
  const upstream = git(local, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  if (!upstream.startsWith('origin/')) throw new BuildError('local: the current branch must track origin');
  git(local, 'fetch', '--quiet', 'origin');
  const [ahead, behind] = git(local, 'rev-list', '--left-right', '--count', `HEAD...${upstream}`).split(/\s+/).map(Number);
  if (ahead && behind) throw new BuildError('local: local and remote commits diverged. Reconcile them with Git; no files were changed.');
  if (behind) {
    git(local, 'merge', '--ff-only', upstream);
    return { state: 'updated', line: `local: downloaded ${behind} commit${behind === 1 ? '' : 's'}` };
  }
  return ahead
    ? { state: 'ahead', line: `local: ${ahead} local commit${ahead === 1 ? '' : 's'} not pushed` }
    : { state: 'current', line: 'local: up to date' };
}

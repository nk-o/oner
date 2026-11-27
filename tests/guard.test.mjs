import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';

const hook = resolve('bin/guard.mjs');
const root = mkdtempSync(join(realpathSync(tmpdir()), 'guard-'));
after(() => rmSync(root, { recursive: true, force: true }));

// A clone of a remote whose default branch is main, checked out on main.
const remote = join(root, 'remote.git');
const repo = join(root, 'repo');
const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
mkdirSync(repo);
g(repo, 'init', '-q', '-b', 'main');
writeFileSync(join(repo, 'tracked.test.mjs'), 'export {};\n');
writeFileSync(join(repo, '.gitignore'), 'ignored.mjs\n');
writeFileSync(join(repo, 'ignored.mjs'), 'export {};\n');
writeFileSync(join(repo, 'untracked.mjs'), 'export {};\n');
writeFileSync(join(repo, '2'), 'two\n');
writeFileSync(join(root, 'outside.mjs'), 'export {};\n');
g(repo, 'add', 'tracked.test.mjs', '.gitignore');
g(repo, '-c', 'user.email=f@example.test', '-c', 'user.name=F', 'commit', '-q', '-m', 'init');
g(repo, 'remote', 'add', 'origin', remote);
g(repo, 'push', '-q', '-u', 'origin', 'main');
g(repo, 'remote', 'set-head', 'origin', 'main');

function verdict(command, { tool_name = 'Bash', cwd = repo, args = [] } = {}) {
  const r = spawnSync(process.execPath, [hook, ...args], { input: JSON.stringify({ tool_name, tool_input: { command }, cwd }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'pass';
}

const rows = [
  ["cat > tracked.test.mjs <<'EOF'\nx\nEOF", 'ask'],
  ["cat > new.mjs <<'EOF'\nx\nEOF", 'pass'],
  ['echo x >> tracked.test.mjs', 'pass'],
  ['cmd > /tmp/out.txt', 'pass'],
  ['echo x >| tracked.test.mjs', 'ask'],
  ['echo x &> tracked.test.mjs', 'ask'],
  ['echo x &>> tracked.test.mjs', 'pass'],
  ['echo x 2>tracked.test.mjs', 'ask'],
  ['echo x >&2', 'pass'],
  ['>tracked.test.mjs', 'ask'],
  ['echo x | tee tracked.test.mjs', 'ask'],
  ['echo x | tee -a tracked.test.mjs', 'pass'],
  ['echo x | tee --append tracked.test.mjs', 'pass'],
  ['echo x | tee 2>/dev/null', 'pass'],
  ['echo x | tee 2 >/dev/null', 'ask'],
  ['echo x > untracked.mjs', 'ask'],
  ['echo x > ignored.mjs', 'pass'],
  [`echo x > '${join(root, 'outside.mjs')}'`, 'pass'],
  ['git push --force origin main', 'deny'],
  ['git push -f', 'deny'],
  ['git push -f origin HEAD', 'deny'],
  ['git push origin +HEAD:main', 'deny'],
  ['git push origin :main', 'deny'],
  ['git push --mirror origin', 'deny'],
  ['cd /tmp && rm -rf /', 'deny'],
  ['rm -rf ~', 'deny'],
  ['rm -rf "$HOME/"', 'deny'],
  ['rm -fr ~/*', 'deny'],
  [`rm -rf ${repo}`, 'deny'],
  ['rm -rf .git', 'deny'],
  ['git reset --hard origin/main', 'ask'],
  ['git clean -fdx', 'ask'],
  ['git checkout -- .', 'ask'],
  ['git restore .', 'ask'],
  ['git branch -D old-work', 'ask'],
  ['git stash drop', 'ask'],
  ['git push --force-with-lease origin feature', 'ask'],
  ['git push -d origin feature', 'ask'],
  ['rm -rf "$DIR/"', 'ask'],
  ['git push', 'pass'],
  ['git push -u origin feature', 'pass'],
  ['git -C . push origin HEAD:feature', 'pass'],
  ['git reset --soft HEAD~1', 'pass'],
  ['git clean -n', 'pass'],
  ['git restore --staged .', 'pass'],
  ['git checkout -b feature', 'pass'],
  ['git stash push -m wip', 'pass'],
  ['rm -rf node_modules dist', 'pass'],
  ['rm -rf "$SCRATCH/home"', 'pass'],
  ['echo git push --force origin main', 'pass'],
  // What the shell runs, wherever it sits in the line.
  ["bash -c 'git push --force origin main'", 'deny'],
  ["sh -lc 'rm -rf /'", 'deny'],
  ['git commit -m "$(git push --force origin main)"', 'deny'],
  ['echo `rm -rf ~`', 'deny'],
  ['if true; then rm -rf "$HOME"; fi', 'deny'],
  ['for d in a b; do rm -rf "$d"; done', 'pass'],
  ['echo "example; rm -rf /; done"', 'pass'],
  ["git commit -F - <<'EOF'\ngit push --force origin main\nrm -rf /\nEOF\n", 'pass'],
  ["git commit -F - <<'EOF'\nfine\nEOF\ngit push --force origin main", 'deny'],
  // The directory a cd moved to, and paths only a variable names.
  [`cd .. && rm -rf ${repo.split('/').pop()}`, 'deny'],
  [`rm -rf ${root}`, 'deny'],
  ['cd /tmp && rm -rf *', 'pass'],
  [`cd / && cd ${repo} && rm -rf *`, 'deny'],
  [`rm -rf ${dirname(homedir())}/${process.env.USER === basename(homedir()) ? '$USER' : basename(homedir())}`, 'deny'],
  ['rm -rf "${HOME:-/}"', 'deny'],
  // Every way git spells a remote, a refspec, or a flag.
  ['git push --repo=origin :main', 'deny'],
  ['git push --repo=origin +HEAD:main', 'deny'],
  ['git push --force origin :', 'deny'],
  ["git push origin '+refs/heads/*:refs/heads/*'", 'deny'],
  ['git push origin :', 'pass'],
  ['git checkout -qf main', 'ask'],
  ['git switch -f main', 'ask'],
  ['git switch --discard-changes main', 'ask'],
  ['git branch -d --force old-work', 'ask'],
  ['git branch -df old-work', 'ask'],
  ['git branch -d merged-work', 'pass'],
  ['git restore -S .', 'pass'],
  ['git restore -SW .', 'ask'],
  ['git clean -fn', 'pass'],
  // Second review round: what a here-document feeds, where a cd really leaves the shell.
  ["bash <<'EOF'\ngit push --force origin main\nEOF", 'deny'],
  ['cat <<EOF\n$(rm -rf ~)\nEOF', 'deny'],
  ["cat <<'EOF'\n$(rm -rf ~)\nEOF", 'pass'],
  ['cat <<\\EOF\nEOF\ngit push --force origin main', 'deny'],
  ["git commit -F - <<'EOF'\ntext\nEOF \ngit push --force origin main\nEOF", 'pass'],
  ['(cd /tmp); rm -rf *', 'deny'],
  ['(cd /tmp && rm -rf *)', 'pass'],
  ['cd /tmp | cat; rm -rf *', 'deny'],
  ['cd -- .; rm -rf *', 'deny'],
  ['cd /definitely-missing-dir; rm -rf *', 'ask'],
  ['false && cd /tmp; rm -rf *', 'ask'],
  ['cd /dev/null || rm -rf *', 'ask'],
  ['cd /tmp && rm -rf *; rm -rf *', 'ask'],
  [`cd -P .. && rm -rf ${repo.split('/').pop()}`, 'deny'],
  ['cd /tmp && echo "$(rm -rf *)"', 'pass'],
  // Spellings the shell and git accept.
  ['git push --force-with-l origin main', 'deny'],
  ["git push --force origin '+refs/tags/*:refs/tags/*'", 'ask'],
  ["git push origin '+refs/heads/feature/*:refs/heads/feature/*'", 'ask'],
  ['rm -rf ~ --', 'deny'],
  ["bash -c $'rm -rf ~'", 'deny'],
  ['rm -rf "${HOME:0}"', 'deny'],
  ['rm -rf "${PATH:+$HOME}"', 'deny'],
  ['rm -rf "${PATH:+/}"', 'deny'],
  ['rm -rf "${DIR%/*}"', 'ask'],
  ['echo <(rm -rf ~)', 'deny'],
  ["git -c alias.p='push --force origin main' p", 'deny'],
  ['git -c remote.origin.mirror=true push origin', 'deny'],
  ['rm -rf "$(pwd)"', 'deny'],
  ['rm -rf "$(git rev-parse --show-toplevel)/dist"', 'pass'],
  ['rm -rf /{tmp,}', 'deny'],
  ['rm -rf ~/{.ssh,}', 'deny'],
  ['sudo -n rm -rf ~', 'deny'],
  ['env -u FOO rm -rf ~', 'deny'],
  ['nice -n 5 rm -rf ~', 'deny'],
  ['time -p git push --force origin main', 'deny'],
  [`${"bash -c '".repeat(1)}${'eval '.repeat(12)}rm -rf ~'`, 'ask'],
  // Third review round: directories created on the way, returns, conditions, local variables.
  [`mkdir -p ${root}/fresh && cd ${root}/fresh && rm -rf /`, 'deny'],
  [`git clone ${remote} ${root}/fresh2 && cd ${root}/fresh2 && git push --force origin main`, 'deny'],
  ['cd /tmp; cd -; rm -rf *', 'ask'],
  ['pushd /tmp; popd; rm -rf *', 'ask'],
  ['if false; then cd /tmp; fi; rm -rf *', 'ask'],
  ['for d in /tmp; do cd "$d"; done; rm -rf *', 'ask'],
  ['TARGET="$PWD"; rm -rf "$TARGET"', 'deny'],
  ['rm -rf "$UNSET_IN_THIS_TEST"', 'ask'],
  ['for d in build dist; do rm -rf "$d"; done', 'pass'],
  ['OUT=dist; rm -rf "$OUT"', 'pass'],
  ['timeout 30 git push --force origin main', 'deny'],
  ['timeout -s KILL 10 rm -rf /', 'deny'],
  // Fourth review round: values a skipped assignment leaves, and what a pipe hands a shell.
  ['rm -rf "$HOME/$UNSET_IN_THIS_TEST"', 'ask'],
  ['TARGET="$PWD"; false && TARGET=dist; rm -rf "$TARGET"', 'ask'],
  ['TARGET="$PWD"; (TARGET=dist); rm -rf "$TARGET"', 'ask'],
  ['OUT=dist; export OUT="$PWD"; rm -rf "$OUT"', 'ask'],
  ['for d in $(git push --force origin main); do echo "$d"; done', 'deny'],
  ["cat <<'EOF' | bash\nrm -rf ~\nEOF", 'deny'],
  ['cd /dev/null && (true); rm -rf *', 'ask'],
  [`for d in ${Array.from({ length: 40 }, (_, n) => `d${n}`).join(' ')} "$HOME"; do rm -rf "$d"; done`, 'ask'],
  ['export OUT=dist; rm -rf "$OUT"', 'pass'],
  [`env -C .. rm -rf ${repo.split('/').pop()}`, 'deny'],
  // Fifth review round: where env -C expands words, which assignments replace a value.
  ['env -C /tmp rm -rf "$PWD"', 'deny'],
  ['env -C /tmp rm -rf "$(pwd)"', 'deny'],
  ['dir="$PWD"; dir="$dir/dist"; rm -rf "$dir"', 'pass'],
  ['HOME=/tmp/guard-empty-home; rm -rf "$HOME"', 'pass'],
  ['DIR="$PWD" git status; rm -rf "$DIR"', 'ask'],
  ['cd /tmp && (true); rm -rf *', 'ask'],
  ["cat <<'EOF' | bash -c 'cat >/dev/null'\nrm -rf ~\nEOF", 'pass'],
  ['if false; then UNSET_IN_THIS_TEST=dist; fi; rm -rf "${UNSET_IN_THIS_TEST:-$HOME}"', 'ask'],
  ['echo UNSET_IN_THIS_TEST=dist; rm -rf "${UNSET_IN_THIS_TEST:-$HOME}"', 'deny'],
  ['if true; then OUT=dist; fi; rm -rf "$OUT"', 'pass'],
  // Sixth review round: a command certain to hit a protected path is refused, one that hits it
  // only in some directory or value the shell may have is asked about.
  ['false && cd /tmp && (true); rm -rf *', 'ask'],
  ['TARGET="$HOME"; (for TARGET in dist; do :; done); rm -rf "$TARGET"', 'ask'],
  ['TARGET="$HOME"; false && { :; TARGET=dist; }; rm -rf "$TARGET"', 'ask'],
  ["cat <<'EOF' | bash -s -- arg\nrm -rf ~\nEOF", 'deny'],
  ["cat <<'EOF' | bash -o pipefail\nrm -rf ~\nEOF", 'deny'],
  // Seventh review round: an assignment that surely runs replaces, empty values are harmless.
  ['d="$PWD"; for d in dist build; do rm -rf "$d"; done', 'pass'],
  ['d=dist; d=$d/a; d=$d/b; d=$d/c; d=$d/e; d=$d/f; rm -rf "$d"', 'pass'],
  ['dir="$PWD"; dir=""; rm -rf "$dir"', 'pass'],
  ['if false; then OUT=/; fi; rm -rf "$OUT"', 'ask'],
  ['OUT=dist; OUT=; rm -rf "${OUT:+$HOME}"', 'pass'],
  ["cat <<'EOF' | bash /dev/null\nrm -rf ~\nEOF", 'pass'],
  ['d="$HOME"; for d in; do :; done; rm -rf "$d"', 'deny'],
  // Eighth review round: declarations that can fail, readonly names, a shell reading a pipe.
  ["cat <<'EOF' | bash --rcfile /dev/null\nrm -rf ~\nEOF", 'deny'],
  ["cat <<'EOF' | bash /dev/stdin\nrm -rf ~\nEOF", 'deny'],
  ["cat <<'EOF' | bash -- ./run.sh\nrm -rf ~\nEOF", 'pass'],
  ["cat <<'EOF' | bash -sc 'cat >/dev/null'\nrm -rf ~\nEOF", 'pass'],
  ['local HOME=/tmp/safe; rm -rf "$HOME"', 'ask'],
  ['readonly HOME; HOME=/tmp/safe; rm -rf "$HOME"', 'ask'],
  ['d="$HOME"; export d=dist e="$d"; rm -rf "$e"', 'ask'],
  ['{ cd /tmp; rm -rf *; }', 'pass'],
  ['false && { cd /tmp; }; rm -rf *', 'ask'],
];

test('a logical path to the repository counts the same as git\'s physical one', (t) => {
  const link = join(root, 'link');
  execFileSync('ln', ['-s', repo, link]);
  assert.equal(verdict('rm -rf .', { cwd: link }), 'deny');
});

for (const [command, expected] of rows) {
  test(`${expected}: ${command}`, () => assert.equal(verdict(command), expected));
}

test('a tool other than Bash, and input the hook cannot read, pass untouched', () => {
  assert.equal(verdict('git push --force origin main', { tool_name: 'Read' }), 'pass');
  const r = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
  assert.deepEqual([r.status, r.stdout], [0, '']);
});

test('in Codex, which cannot ask, what would ask is refused and the rest is unchanged', () => {
  const codex = { args: ['--host', 'codex'] };
  assert.equal(verdict('git reset --hard origin/main', codex), 'deny');
  assert.equal(verdict('git push --force origin main', codex), 'deny');
  assert.equal(verdict('git push -u origin feature', codex), 'pass');
});

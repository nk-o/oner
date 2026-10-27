import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';

const seriesScript = resolve('skills/oneshot/series.mjs');
const hook = resolve('skills/oneshot/hook.sh');
const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A GitHub stand-in: pull requests keyed by head branch in a JSON file, and a
// login that can be made to fail.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.env.GH_STATE, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_LOG, args.join(' ') + '\\n');
if (state.fail) { process.stderr.write(state.fail + '\\n'); process.exit(1); }
if (args[0] === 'pr' && args[1] === 'list') {
  const pr = state.prs[args[args.indexOf('--head') + 1]];
  process.stdout.write(JSON.stringify(pr ? [{ number: pr.number, url: pr.url }] : []));
} else if (args[0] === 'pr' && args[1] === 'view') {
  // Another process saving the program while this pass is between its read and its save.
  if (state.onView) {
    const command = state.onView;
    delete state.onView;
    fs.writeFileSync(process.env.GH_STATE, JSON.stringify(state));
    require('child_process').execSync(command, { stdio: 'ignore' });
  }
  process.stdout.write(JSON.stringify(Object.values(state.prs).find((p) => String(p.number) === args[2])));
} else process.exit(1);
`;

function fixture({ timeoutMinutes = 60, authorization = 'Yes, release every stage' } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'series-'));
  fixtures.push(root);
  const repo = join(root, 'repo');
  const origin = join(root, 'origin.git');
  const bin = join(root, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  const g = (...args) => execFileSync(git, ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync(git, ['init', '-q', '--bare', '-b', 'main', origin]);
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'fixture@example.test');
  g('config', 'user.name', 'Fixture');
  writeFileSync(join(repo, '.gitignore'), '.specs/\n');
  writeFileSync(join(repo, 'app.txt'), 'v0\n');
  g('add', '.');
  g('commit', '-qm', 'Initialize fixture');
  g('remote', 'add', 'origin', origin);
  g('push', '-q', 'origin', 'main');
  g('remote', 'set-head', 'origin', 'main');
  writeFileSync(join(bin, 'gh'), FAKE_GH, { mode: 0o755 });
  const ghState = join(root, 'gh.json');
  const ghLog = join(root, 'gh.log');
  writeFileSync(ghState, JSON.stringify({ prs: {} }));
  writeFileSync(ghLog, '');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_STATE: ghState, GH_LOG: ghLog };

  const program = join(repo, '.specs', '001-billing');
  mkdirSync(program, { recursive: true });
  const record = () => JSON.parse(readFileSync(join(program, 'program.json'), 'utf8'));
  const writeRecord = (p) => writeFileSync(join(program, 'program.json'), JSON.stringify(p, null, 2));
  writeRecord({
    status: 'running',
    ...(authorization ? { authorization } : {}),
    release: {
      checks: ['test'],
      deployed: `cat '${join(root, 'deployed')}'`,
      migrations: `test -f '${join(root, 'migrated')}'`,
      accept: [`test -f '${join(root, 'healthy')}'`],
      timeoutMinutes,
    },
    stages: [{ id: 'schema', migrations: true, accept: ['true'] }, { id: 'api', after: ['schema'], accept: ['true'] }],
  });
  writeFileSync(join(root, 'deployed'), g('rev-parse', 'HEAD') + '\n');

  const series = (args, cwd = repo) => {
    const r = spawnSync(process.execPath, [seriesScript, ...args], { cwd, env, encoding: 'utf8' });
    const actions = args[0] !== 'next' ? [] : r.stdout.split('\n').slice(2).filter(Boolean).map((line) => {
      const [, kind, stage, detail] = /^(\S+) (\S+): (.*)$/.exec(line);
      return { kind, stage, detail };
    });
    return { ...r, actions };
  };
  const gh = (update) => {
    const s = JSON.parse(readFileSync(ghState, 'utf8'));
    update(s);
    writeFileSync(ghState, JSON.stringify(s));
  };
  const stage = (id) => record().stages.find((s) => s.id === id);

  // Cuts the stage's worktree from origin/main and commits one change in it,
  // with the run folder the stage's oneshot run would leave behind.
  const build = (id, branch = `billing-${id}`) => {
    const dir = join(root, 'worktrees', branch);
    g('fetch', '-q', 'origin');
    g('worktree', 'add', '-q', '-b', branch, dir, 'origin/main');
    writeFileSync(join(dir, `${branch}.txt`), `${branch}\n`);
    execFileSync(git, ['-C', dir, 'add', '.']);
    execFileSync(git, ['-C', dir, 'commit', '-qm', `Build ${branch}`]);
    mkdirSync(join(dir, '.specs', '001-stage'), { recursive: true });
    writeFileSync(join(dir, '.specs', '001-stage', 'oneshot.md'), `# ${branch}\n\nLane. feature\nBranch. ${branch}\nStatus. done\n`);
    return { dir, branch, head: execFileSync(git, ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  };
  let prNumber = 0;
  const openPr = (branch, head, rollup = [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }]) => {
    prNumber += 1;
    const number = prNumber;
    gh((s) => {
      s.prs[branch] = { number, url: `https://github.test/fixture/pull/${number}`, state: 'OPEN', headRefOid: head,
        mergeStateStatus: 'CLEAN', reviewDecision: '', statusCheckRollup: rollup, mergeCommit: null };
    });
    return number;
  };
  // What `gh pr merge --squash` does on GitHub: one new commit on main with the branch's tree.
  const merge = (branch, head) => {
    g('fetch', '-q', 'origin');
    const sha = g('commit-tree', `${head}^{tree}`, '-p', 'origin/main', '-m', `Squash ${branch}`);
    g('push', '-q', 'origin', `${sha}:refs/heads/main`);
    gh((s) => Object.assign(s.prs[branch], { state: 'MERGED', mergeCommit: { oid: sha } }));
    return sha;
  };
  const production = ({ deployed, migrated, healthy }) => {
    if (deployed) writeFileSync(join(root, 'deployed'), deployed + '\n');
    for (const [name, on] of [['migrated', migrated], ['healthy', healthy]]) {
      if (on === true) writeFileSync(join(root, name), '');
      if (on === false) rmSync(join(root, name), { force: true });
    }
  };
  // Walks one stage from nothing to a verified production release.
  const ship = (id) => {
    const b = build(id);
    openPr(b.branch, b.head);
    assert.equal(kinds(series(['next']), id)[0], 'merge');
    const sha = merge(b.branch, b.head);
    production({ deployed: sha, migrated: true, healthy: true });
    series(['next']);
    assert.equal(stage(id).state, 'done');
    return { ...b, merge: sha };
  };
  return { root, repo, program, env, g, gh, series, record, writeRecord, stage, build, openPr, merge, production, ship, ghLog };
}

const kinds = (r, id) => r.actions.filter((a) => a.stage === id).map((a) => a.kind);

test('a series carries its first stage to production and only then starts the next', () => {
  const f = fixture();
  let r = f.series(['next']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(kinds(r, 'schema'), ['start']);
  assert.deepEqual(kinds(r, 'api'), ['hold']);

  const b = f.build('schema');
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['build']);
  assert.equal(f.stage('schema').state, 'building');
  assert.equal(f.stage('schema').base, f.g('rev-parse', 'origin/main'));

  f.openPr(b.branch, b.head);
  r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['merge']);
  assert.match(r.actions[0].detail, new RegExp(`^gh pr merge 1 --squash --match-head-commit ${b.head}$`));
  assert.equal(f.stage('schema').approvedHead, b.head);

  // Merged, but production still runs the old commit: the stage is not done.
  const sha = f.merge(b.branch, b.head);
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['wait-deploy']);
  assert.equal(f.stage('schema').state, 'merged');
  assert.equal(f.stage('schema').merge, sha);

  // Deployed, but the migrations are not applied: still not done.
  f.production({ deployed: sha, healthy: true });
  r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['wait-verify']);
  assert.match(r.actions.find((a) => a.stage === 'schema').detail, /migrated/);
  assert.equal(f.stage('schema').state, 'deployed');

  f.production({ migrated: true });
  r = f.series(['next']);
  assert.equal(f.stage('schema').state, 'done');
  assert.equal(f.stage('schema').deployed, sha);
  assert.deepEqual(kinds(r, 'api'), ['start']);
  assert.match(r.actions.find((a) => a.stage === 'api').detail, new RegExp(`at ${sha.slice(0, 9)}`));
  assert.deepEqual(kinds(r, 'schema'), ['cleanup']);
  assert.ok(existsSync(join(f.program, 'stages', 'schema', '001-stage', 'oneshot.md')));
  assert.equal(f.record().status, 'running');
  assert.equal(f.series(['report']).status, 1);

  f.ship('api');
  r = f.series(['next']);
  assert.equal(f.record().status, 'done');
  assert.ok(r.actions.every((a) => a.kind === 'complete' || a.kind === 'cleanup'));
  const report = f.series(['report']);
  assert.equal(report.status, 0, report.stdout);
});

test('red, pending, and missing checks never produce a merge', () => {
  const f = fixture();
  const b = f.build('schema');
  const cases = [
    [[{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }], 'fix'],
    [[{ __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' }], 'wait-checks'],
    [[{ __typename: 'StatusContext', context: 'test', state: 'PENDING' }], 'wait-checks'],
    [[], 'wait-checks'],
    [[{ __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }], 'wait-checks'],
  ];
  f.openPr(b.branch, b.head);
  for (const [rollup, expected] of cases) {
    f.gh((s) => { s.prs[b.branch].statusCheckRollup = rollup; });
    const r = f.series(['next']);
    assert.deepEqual(kinds(r, 'schema'), [expected], JSON.stringify(rollup));
    assert.equal(f.stage('schema').approvedHead, undefined);
  }
  assert.match(f.series(['next']).actions[0].detail, /test \(not reported\)/);

  // A skipped run beside a passing one of the same check does not hide the pass.
  f.gh((s) => {
    s.prs[b.branch].statusCheckRollup = [
      { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SKIPPED' },
    ];
  });
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['merge']);

  // A required check that only skipped never ran, and nothing in the series will run it.
  f.gh((s) => { s.prs[b.branch].statusCheckRollup = [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SKIPPED' }]; });
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['ask']);
  assert.match(f.record().waiting.action, /required checks were skipped/);

  // A record that names no check would let a head whose checks have not registered look green.
  const p = f.record();
  p.release.checks = [];
  f.writeRecord(p);
  const r = f.series(['next']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /release.checks must name at least one check/);
});

test('checks verified on an old head approve neither a newer head nor its merge', () => {
  const f = fixture();
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['merge']);

  writeFileSync(join(b.dir, 'late.txt'), 'late\n');
  execFileSync(git, ['-C', b.dir, 'add', 'late.txt']);
  execFileSync(git, ['-C', b.dir, 'commit', '-qm', 'Late change']);
  const newer = execFileSync(git, ['-C', b.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  f.gh((s) => Object.assign(s.prs[b.branch], {
    headRefOid: newer, statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: 'QUEUED', conclusion: '' }],
  }));
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['wait-checks']);
  assert.equal(f.stage('schema').approvedHead, undefined);

  f.merge(b.branch, newer);
  f.gh((s) => { s.prs[b.branch].headRefOid = newer; });
  const r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['ask']);
  assert.equal(f.stage('schema').state, 'pr-open');
  assert.equal(f.stage('schema').merge, undefined);
  assert.equal(f.record().status, 'waiting');
});

test('a series without the user\'s release authorization asks instead of merging', () => {
  const f = fixture({ authorization: null });
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  const r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['ask']);
  assert.equal(f.record().waiting.reason, 'input');
});

test('a stale deployment fails the stage and asks, and a recheck after the fix completes it', () => {
  const f = fixture({ timeoutMinutes: 0 });
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const old = f.g('rev-parse', 'origin/main');
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: old, migrated: true, healthy: true });
  f.series(['next']);
  assert.equal(f.stage('schema').state, 'failed');
  assert.equal(f.stage('schema').failure.kind, 'deploy');
  const r = f.series(['next']);
  assert.deepEqual(r.actions.map((a) => a.kind), ['ask']);
  assert.equal(f.record().status, 'waiting');

  // The user redeployed; the series reads production again instead of asking forever.
  f.production({ deployed: sha });
  assert.equal(f.series(['resume', '--recheck', 'schema']).status, 0);
  f.series(['next']);
  assert.equal(f.stage('schema').state, 'done');
  assert.equal(f.stage('schema').deployed, sha);
});

test('a failed production check fixes forward on a new branch, at most twice', () => {
  const f = fixture({ timeoutMinutes: 0 });
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: sha, migrated: true, healthy: false });
  f.series(['next']);
  let r = f.series(['next']);
  assert.equal(f.stage('schema').failure.kind, 'acceptance');
  assert.deepEqual(kinds(r, 'schema'), ['fix-forward']);
  assert.match(r.actions[0].detail, /billing-schema-fix1/);
  assert.deepEqual(kinds(r, 'api'), ['hold']);

  f.build('schema', 'billing-schema-fix1');
  f.series(['next']);
  const s = f.stage('schema');
  assert.equal(s.state, 'building');
  assert.equal(s.branch, 'billing-schema-fix1');
  assert.equal(s.fixes, 1);
  assert.equal(s.history[0].failure.kind, 'acceptance');
  assert.equal(s.merge, undefined);
  assert.ok(existsSync(join(f.program, 'stages', 'schema', '001-stage')));

  const p = f.record();
  Object.assign(p.stages[0], { state: 'failed', fixes: 2, failure: { kind: 'acceptance', detail: 'still red', at: new Date().toISOString() } });
  f.writeRecord(p);
  r = f.series(['next']);
  assert.deepEqual(r.actions.map((a) => a.kind), ['ask']);
});

test('a 401 from a production check is a failed check, not a lost login', () => {
  const f = fixture({ timeoutMinutes: 0 });
  const p = f.record();
  p.release.accept = ['echo "curl: (22) The requested URL returned error: 401 Unauthorized"; exit 22'];
  f.writeRecord(p);
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  // A JSON version body with a numeric timestamp after the sha still names the sha.
  f.production({ deployed: `{"commit":"${sha}","builtAt":1760900000}`, migrated: true });
  const r = f.series(['next']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.record().status, 'running');
  assert.equal(f.stage('schema').deployed, sha);
  assert.equal(f.stage('schema').failure.kind, 'acceptance');
});

test('merges go one at a time, even when two pull requests merge outside the series', () => {
  const f = fixture();
  const p = f.record();
  p.stages[1].after = [];
  f.writeRecord(p);
  const a = f.build('schema');
  const b = f.build('api');
  f.openPr(a.branch, a.head);
  f.openPr(b.branch, b.head);
  let r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['merge']);
  assert.deepEqual(kinds(r, 'api'), ['hold']);

  // A merge queue keeps the approved pull request open and not mergeable again;
  // the approval still holds the second stage.
  f.gh((s) => { s.prs[a.branch].mergeStateStatus = 'BLOCKED'; });
  r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['wait-checks']);
  assert.deepEqual(kinds(r, 'api'), ['hold']);

  // Somebody merges both; the record follows reality and stays loadable.
  f.merge(a.branch, a.head);
  f.merge(b.branch, b.head);
  f.gh((s) => { s.prs[b.branch].headRefOid = b.head; });
  r = f.series(['next']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.stage('schema').state, 'merged');
  assert.deepEqual(kinds(r, 'api'), ['ask']);
  assert.equal(f.series(['report']).status, 1);
});

test('a stage built beside another is brought up to date before its merge', () => {
  const f = fixture();
  const p = f.record();
  p.stages[1].after = [];
  f.writeRecord(p);
  const b = f.build('api');
  f.ship('schema');
  f.openPr(b.branch, b.head);
  const r = f.series(['next']);
  assert.deepEqual(kinds(r, 'api'), ['update']);
  assert.match(r.actions.find((x) => x.stage === 'api').detail, /lacks schema/);
});

test('a closed pull request replaced by a new one is followed, not asked about again', () => {
  const f = fixture();
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  f.gh((s) => { s.prs[b.branch].state = 'CLOSED'; });
  let r = f.series(['next']);
  assert.deepEqual(r.actions.map((a) => a.kind), ['ask']);
  f.gh((s) => { s.prs.closed = s.prs[b.branch]; });
  f.openPr(b.branch, b.head);
  f.series(['resume']);
  r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['merge']);
  assert.equal(f.stage('schema').pr.number, 2);
});

test('a background pass does not overwrite a wait saved while it ran', () => {
  const f = fixture();
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next'], f.repo);
  f.gh((s) => {
    s.prs[b.branch].headRefOid = b.head;
    s.onView = `'${process.execPath}' '${seriesScript}' wait decision 'hold the series' --program '${f.program}'`;
  });
  const r = f.series(['next']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.record().status, 'waiting');
  assert.equal(f.record().waiting.action, 'hold the series');
  assert.deepEqual(r.actions.map((a) => a.kind), ['ask']);
});

test('a failed migration waits for the user instead of fixing forward', () => {
  const f = fixture({ timeoutMinutes: 0 });
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: sha, migrated: false, healthy: true });
  f.series(['next']);
  const r = f.series(['next']);
  assert.equal(f.stage('schema').failure.kind, 'migration');
  assert.equal(r.actions[0].kind, 'ask');
  assert.equal(f.record().status, 'waiting');
});

test('a lost login keeps progress, and resume records the merge instead of repeating it', () => {
  const f = fixture();
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['merge']);
  f.merge(b.branch, b.head);

  f.gh((s) => { s.fail = 'HTTP 401: Bad credentials (https://api.github.com/graphql)'; });
  let r = f.series(['next']);
  assert.equal(r.status, 3, r.stderr);
  const waiting = f.record();
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.waiting.reason, 'auth');
  assert.match(waiting.waiting.action, /gh pr view 1/);
  assert.equal(f.stage('schema').state, 'pr-open');
  assert.equal(f.stage('schema').approvedHead, b.head);

  r = f.series(['next']);
  assert.deepEqual(r.actions.map((a) => a.kind), ['ask']);

  f.gh((s) => { delete s.fail; });
  assert.equal(f.series(['resume']).status, 0);
  r = f.series(['next']);
  assert.ok(!r.actions.some((a) => a.kind === 'merge'), JSON.stringify(r.actions));
  assert.deepEqual(kinds(r, 'schema'), ['wait-deploy']);
  assert.equal(f.stage('schema').state, 'merged');
  assert.equal(f.record().waits[0].reason, 'auth');
});

test('an answer moves only the stage it was about, and a gated failure waits for it', () => {
  const f = fixture({ timeoutMinutes: 0 });
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: sha, migrated: false, healthy: true });
  f.series(['next']);
  // A fix branch cut before anyone answered does not get past the migration gate.
  f.build('schema', 'billing-schema-fix1');
  let r = f.series(['next']);
  assert.deepEqual(r.actions.map((a) => a.kind), ['ask']);
  assert.match(r.actions[0].detail, /cut branch billing-schema-fix1/);
  assert.equal(f.stage('schema').state, 'failed');

  r = f.series(['resume', '--recheck', 'api']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /waits on stage schema/);

  // The user chose a fix forward: resuming lets next take the branch up.
  assert.equal(f.series(['resume']).status, 0);
  f.series(['next']);
  assert.equal(f.stage('schema').state, 'building');
  assert.equal(f.stage('schema').branch, 'billing-schema-fix1');
});

test('a recheck given for another question does not accept a later unverified merge', () => {
  const f = fixture();
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.gh((s) => { s.prs[b.branch].reviewDecision = 'REVIEW_REQUIRED'; });
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['ask']);
  assert.equal(f.series(['resume', '--recheck', 'schema']).status, 0);
  f.gh((s) => { s.prs[b.branch].reviewDecision = 'APPROVED'; });
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['merge']);
  assert.equal(f.stage('schema').recheck, undefined);

  writeFileSync(join(b.dir, 'late.txt'), 'late\n');
  execFileSync(git, ['-C', b.dir, 'add', 'late.txt']);
  execFileSync(git, ['-C', b.dir, 'commit', '-qm', 'Late change']);
  const newer = execFileSync(git, ['-C', b.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  f.merge(b.branch, newer);
  f.gh((s) => { s.prs[b.branch].headRefOid = newer; });
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['ask']);
  assert.equal(f.stage('schema').merge, undefined);
});

test('a merge seen outside the series withdraws a merge printed earlier in the same pass', () => {
  const f = fixture();
  const p = f.record();
  p.stages[1].after = [];
  f.writeRecord(p);
  const a = f.build('schema');
  const b = f.build('api');
  f.openPr(a.branch, a.head);
  f.openPr(b.branch, b.head, []);
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['merge']);
  // Somebody merges api by hand; the user accepts that merge.
  f.merge(b.branch, b.head);
  assert.deepEqual(kinds(f.series(['next']), 'api'), ['ask']);
  assert.equal(f.series(['resume', '--recheck', 'api']).status, 0);
  const r = f.series(['next']);
  assert.ok(!r.actions.some((x) => x.kind === 'merge'), JSON.stringify(r.actions));
  assert.deepEqual(kinds(r, 'schema'), ['hold']);
  assert.equal(f.stage('api').checks.acceptedByUser.startsWith('stage api:'), true);
});

test('a wait written about one stage lets the user\'s repair move that stage', () => {
  const f = fixture({ timeoutMinutes: 0 });
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: sha, migrated: true, healthy: false });
  f.series(['next']);
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['fix-forward']);
  assert.equal(f.series(['wait', 'decision', 'the user will set the missing config', '--stage', 'schema']).status, 0);
  f.production({ healthy: true });
  const r = f.series(['resume', '--recheck', 'schema']);
  assert.equal(r.status, 0, r.stderr);
  f.series(['next']);
  assert.equal(f.stage('schema').state, 'done');
});

test('a full deployed sha wins over a short one printed before it', () => {
  const f = fixture();
  const old = f.g('rev-parse', 'HEAD');
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: `previous ${old.slice(0, 7)} current ${sha}`, migrated: true, healthy: true });
  f.series(['next']);
  assert.equal(f.stage('schema').state, 'done');
});

test('the deployed commit is found past a timestamp printed before a short sha', () => {
  const f = fixture();
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  f.series(['next']);
  const sha = f.merge(b.branch, b.head);
  f.production({ deployed: `{"builtAt":1760900000,"commit":"${sha.slice(0, 12)}"}`, migrated: true, healthy: true });
  f.series(['next']);
  assert.equal(f.stage('schema').state, 'done');
  assert.equal(f.stage('schema').deployed, sha);
});

test('the program record survives a branch switch and the removal of a stage worktree', () => {
  const f = fixture();
  const first = f.ship('schema');
  const b = f.build('api');
  assert.deepEqual(kinds(f.series(['next'], b.dir), 'api'), ['build']);

  execFileSync(git, ['-C', f.repo, 'worktree', 'remove', '--force', first.dir]);
  execFileSync(git, ['-C', f.repo, 'switch', '-q', '-c', 'elsewhere']);
  const r = f.series(['next'], b.dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.stage('schema').state, 'done');
  assert.equal(f.stage('api').state, 'building');
  assert.ok(existsSync(join(f.program, 'stages', 'schema', '001-stage', 'oneshot.md')));
  assert.deepEqual(kinds(r, 'schema'), []);
});

test('the report and every command refuse a stage marked done without its evidence', () => {
  const f = fixture();
  const p = f.record();
  p.stages[0].state = 'done';
  f.writeRecord(p);
  for (const command of ['next', 'report']) {
    const r = f.series([command]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /stage schema is done without the evidence/);
  }
  p.stages[0].state = 'pending';
  f.writeRecord(p);
  const r = f.series(['report']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /incomplete: schema \(pending\), api \(pending\)/);
});

test('a stage without a production check of its own is not merged until it gets one or a waiver', () => {
  const f = fixture();
  const p = f.record();
  p.stages[0].accept = [];
  f.writeRecord(p);
  assert.match(f.series(['next']).actions.find((a) => a.stage === 'schema').detail, /write its production check while you build/);
  const b = f.build('schema');
  f.openPr(b.branch, b.head);
  let r = f.series(['next']);
  assert.deepEqual(kinds(r, 'schema'), ['accept']);
  assert.match(r.actions[0].detail, /amend --stage schema --accept/);

  assert.equal(f.series(['amend', '--stage', 'schema', '--waive-accept', ' ']).status, 2);
  assert.equal(f.series(['amend', '--stage', 'schema', '--accept', `test -f '${join(f.root, 'healthy')}'`]).status, 0);
  assert.deepEqual(kinds(f.series(['next']), 'schema'), ['merge']);
  assert.equal(f.record().amendments.length, 1);
});

test('amend replaces the stages not started yet, keeps started ones, and records the approval', () => {
  const f = fixture();
  f.ship('schema');
  const file = join(f.root, 'stages.json');
  writeFileSync(file, JSON.stringify([{ id: 'ui', after: ['schema'], accept: ['true'] }, { id: 'api', after: ['ui'], accept: ['true'] }]));
  assert.match(f.series(['amend', '--stages', file]).stderr, /quotes the user's approval/);
  let r = f.series(['amend', '--stages', file, '--approval', 'Yes, release the new map']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(f.record().stages.map((s) => [s.id, s.state]), [['schema', 'done'], ['ui', 'pending'], ['api', 'pending']]);
  assert.deepEqual(f.record().amendments[0].removed, []);
  assert.equal(f.record().amendments[0].approval, 'Yes, release the new map');
  assert.deepEqual(kinds(f.series(['next']), 'ui'), ['start']);

  writeFileSync(file, JSON.stringify([{ id: 'schema' }]));
  assert.match(f.series(['amend', '--stages', file, '--approval', 'redo']).stderr, /Stage schema has started/);
  writeFileSync(file, JSON.stringify([{ id: 'ui', state: 'done' }]));
  assert.match(f.series(['amend', '--stages', file, '--approval', 'skip']).stderr, /sets state, which only series.mjs writes/);
  writeFileSync(file, JSON.stringify([{ id: 'api', after: ['missing'] }]));
  r = f.series(['amend', '--stages', file, '--approval', 'broken']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /comes after missing/);
  assert.deepEqual(f.record().stages.map((s) => s.id), ['schema', 'ui', 'api']);
});

test('release commands that call files outside the program folder are refused until moved in', () => {
  const f = fixture();
  const p = f.record();
  const tool = join(process.env.HOME, '.series-fixture-tool', 'probe.py');
  p.release.accept = [`python3 ${tool} accept`];
  f.writeRecord(p);
  let r = f.series(['next']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, new RegExp(`outside the program folder: ${tool}`));
  assert.equal(f.series(['report']).status, 1);

  const release = { ...p.release, accept: [`test -f '${join(f.program, 'release', 'ok')}' || true`] };
  writeFileSync(join(f.root, 'release.json'), JSON.stringify(release));
  r = f.series(['amend', '--release', join(f.root, 'release.json'), '--approval', 'Move the probe in']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.series(['next']).status, 0);
  assert.equal(f.series(['amend', '--stage', 'api', '--accept', 'cat /tmp/probe']).status, 2);
});

test('an open stage\'s run folder is copied into the program folder on every pass, not only when it closes', () => {
  const f = fixture();
  const b = f.build('schema');
  f.series(['next']);
  const archived = join(f.program, 'stages', 'schema', '001-stage', 'oneshot.md');
  assert.ok(existsSync(archived));
  assert.deepEqual(f.stage('schema').logs, ['stages/schema/001-stage']);
  writeFileSync(join(b.dir, '.specs', '001-stage', 'oneshot.md'), 'Status. running\nBranch. billing-schema\nStep two\n');
  f.series(['next']);
  assert.match(readFileSync(archived, 'utf8'), /Step two/);
  assert.deepEqual(f.stage('schema').logs, ['stages/schema/001-stage']);
});

function runHook(cwd, event, transcript, extra = {}) {
  const input = JSON.stringify({ hook_event_name: event, cwd, transcript_path: transcript, background_tasks: [], session_crons: [], ...extra });
  return spawnSync('bash', [hook], { input, encoding: 'utf8' }).stdout;
}

test('an ordinary run still ends at its open pull request', () => {
  const f = fixture();
  rmSync(f.program, { recursive: true });
  f.g('switch', '-q', '-c', 'feature');
  const run = join(f.repo, '.specs', '002-feature');
  mkdirSync(run);
  const log = (status, box) => writeFileSync(join(run, 'oneshot.md'),
    `# feature\n\nLane. feature\nBranch. feature\nStatus. ${status}\n\n## Lane\n- [x] Build\n- [${box}] Ship\n`);
  const transcript = join(f.root, 'transcript.jsonl');
  writeFileSync(transcript, '<command-name>/oneshot</command-name>\n');

  log('running', ' ');
  const open = runHook(f.repo, 'Stop', transcript);
  assert.match(open, /steps still open/);
  assert.doesNotMatch(open, /series/);

  log('done', 'x');
  assert.equal(runHook(f.repo, 'Stop', transcript), '');
  assert.equal(runHook(f.repo, 'UserPromptSubmit', transcript), '');
});

test('the hook keeps the coordinator going until the series is done, once per state, and never through a wait', () => {
  const f = fixture();
  const b = f.build('schema');
  const out = f.series(['next']).stdout;
  const transcript = join(f.root, 'coordinator.jsonl');
  writeFileSync(transcript, `<command-name>/oneshot</command-name>\n${JSON.stringify({ output: out })}\n`);
  const bystander = join(f.root, 'bystander.jsonl');
  writeFileSync(bystander, '<command-name>/oneshot</command-name>\n');

  const first = runHook(b.dir, 'Stop', transcript);
  assert.match(first, /oneshot series in .*001-billing is open, 0 of 2 stages done/);
  assert.equal(runHook(b.dir, 'Stop', transcript), '', 'a turn that changed nothing is let go');
  assert.equal(runHook(b.dir, 'Stop', bystander), '');
  assert.match(runHook(b.dir, 'SessionStart', bystander), /oneshot series is open in this repository/);
  assert.equal(runHook(b.dir, 'UserPromptSubmit', bystander, { prompt: 'hello' }), '');
  assert.equal(runHook(b.dir, 'Stop', transcript), '', 'another session\'s prompt does not re-arm the coordinator');
  const reporter = join(f.root, 'reporter.jsonl');
  writeFileSync(reporter, `<command-name>/oneshot</command-name>\n${JSON.stringify({ output: f.series(['report']).stdout })}\n`);
  assert.equal(runHook(b.dir, 'Stop', reporter), '', 'a session that only read the report is not the coordinator');

  // A stage run waiting on the user holds the series with it.
  writeFileSync(join(b.dir, '.specs', '001-stage', 'oneshot.md'), `# s\n\nLane. feature\nBranch. ${b.branch}\nStatus. waiting\n\n## Lane\n- [ ] Ship\n`);
  runHook(b.dir, 'UserPromptSubmit', transcript, { prompt: 'continue' });
  assert.equal(runHook(b.dir, 'Stop', transcript), '');

  runHook(b.dir, 'UserPromptSubmit', transcript, { prompt: 'continue' });
  execFileSync(git, ['-C', f.repo, 'worktree', 'remove', '--force', b.dir]);
  assert.match(runHook(f.repo, 'Stop', transcript), /0 of 2 stages done/);

  f.series(['wait', 'auth', 'gh pr view 1 needs a fresh login']);
  runHook(f.repo, 'UserPromptSubmit', transcript, { prompt: 'continue' });
  assert.equal(runHook(f.repo, 'Stop', transcript), '');

  const p = f.record();
  p.status = 'done';
  f.writeRecord(p);
  assert.equal(runHook(f.repo, 'SessionStart', transcript), '');
});

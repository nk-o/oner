// Bounded exhaustive check of series.mjs's per-stage waits, run on the real
// script. Stages a and b are independent, c comes after a. Every event below is
// followed by the coordinator's `next`, and the properties are checked on what
// it saved and printed. The whole state is program.json plus the GitHub
// stand-in's files, so each state is explored by restoring those files.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const seriesScript = resolve('skills/oneshot/series.mjs');
const DEPTH = 4;
const IDLE = new Set(['ask', 'asked', 'hold', 'cleanup']);

const FAKE_GH = `#!/bin/sh
if [ "$1 $2" = "pr list" ]; then
  while [ $# -gt 0 ]; do [ "$1" = --head ] && b="$2"; shift; done
  cat "$GH_DIR/list-$b.json" 2>/dev/null || echo '[]'
elif [ "$1 $2" = "pr view" ]; then cat "$GH_DIR/view-$3.json"
else exit 1; fi
`;

function world() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'series-model-'));
  const repo = join(root, 'repo');
  const ghDir = join(root, 'gh');
  mkdirSync(repo);
  mkdirSync(ghDir);
  mkdirSync(join(root, 'bin'));
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', join(root, 'origin.git')]);
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'fixture@example.test');
  g('config', 'user.name', 'Fixture');
  writeFileSync(join(repo, '.gitignore'), '.specs/\n');
  g('add', '.');
  g('commit', '-qm', 'Initialize fixture');
  g('remote', 'add', 'origin', join(root, 'origin.git'));
  g('push', '-q', 'origin', 'main');
  g('remote', 'set-head', 'origin', 'main');
  const head = g('rev-parse', 'HEAD');
  for (const id of ['a', 'b']) g('branch', `model-${id}`);
  // The commit a hand merge of a puts on main, there from the start so every
  // state shares one git history.
  g('commit', '-q', '--allow-empty', '-m', 'Hand merge of a');
  const handMerge = g('rev-parse', 'HEAD');
  g('push', '-q', 'origin', 'main');
  writeFileSync(join(root, 'bin', 'gh'), FAKE_GH, { mode: 0o755 });
  const env = { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, GH_DIR: ghDir };
  const program = join(repo, '.specs', '001-model');
  mkdirSync(program, { recursive: true });
  const record = join(program, 'program.json');
  const prs = { a: 1, b: 2 };
  for (const [id, number] of Object.entries(prs)) {
    writeFileSync(join(ghDir, `list-model-${id}.json`), JSON.stringify([{ number, url: `https://github.test/pull/${number}` }]));
  }
  const pr = (pending) => ({ state: 'OPEN', headRefOid: head, mergeStateStatus: 'CLEAN', reviewDecision: '', mergeCommit: null,
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: pending ? 'IN_PROGRESS' : 'COMPLETED', conclusion: pending ? '' : 'SUCCESS' }] });
  const initial = {
    program: JSON.stringify({
      status: 'running',
      authorization: 'Yes',
      release: { checks: ['test'], deployed: 'git rev-parse origin/main', accept: [], timeoutMinutes: 60 },
      stages: [{ id: 'a', accept: ['true'] }, { id: 'b', accept: ['true'] }, { id: 'c', after: ['a'], accept: ['true'] }],
    }),
    gh: { a: pr(true), b: pr(true) },
  };
  const restore = (state) => {
    writeFileSync(record, state.program);
    for (const [id, view] of Object.entries(state.gh)) writeFileSync(join(ghDir, `view-${prs[id]}.json`), JSON.stringify(view));
  };
  const read = () => ({
    program: readFileSync(record, 'utf8'),
    gh: Object.fromEntries(Object.keys(prs).map((id) => [id, JSON.parse(readFileSync(join(ghDir, `view-${prs[id]}.json`), 'utf8'))])),
  });
  const series = (...args) => spawnSync(process.execPath, [seriesScript, ...args], { cwd: repo, env, encoding: 'utf8' });
  const view = (id, change) => {
    const file = join(ghDir, `view-${prs[id]}.json`);
    const v = JSON.parse(readFileSync(file, 'utf8'));
    change(v);
    writeFileSync(file, JSON.stringify(v));
  };
  const checks = (id, pending) => view(id, (v) => { v.statusCheckRollup = pr(pending).statusCheckRollup; });
  const events = {
    'coordinator runs next': () => {},
    'a: checks pass': () => checks('a', false),
    'a: review required': () => view('a', (v) => { v.reviewDecision = 'REVIEW_REQUIRED'; }),
    'a: review approved': () => view('a', (v) => { v.reviewDecision = 'APPROVED'; }),
    'a: merged by hand': () => view('a', (v) => { Object.assign(v, { state: 'MERGED', mergeCommit: { oid: handMerge } }); }),
    'b: checks pass': () => checks('b', false),
    'b: coordinator asks the user': () => series('wait', 'decision', 'pick a name', '--stage', 'b'),
    'user answers a': () => series('resume', '--stage', 'a'),
    'user answers b': () => series('resume', '--stage', 'b'),
  };
  // A step is an event, then the coordinator's next, whose output the checks read.
  let actions = [];
  const step = (event) => {
    events[event]();
    const r = series('next');
    if (r.status !== 0) throw new Error(`next exited ${r.status}: ${r.stderr}`);
    actions = r.stdout.split('\n').slice(2).filter(Boolean).map((line) => /^(\S+) (\S+): (.*)$/.exec(line).slice(1));
  };
  const fingerprint = () => {
    const p = JSON.parse(readFileSync(record, 'utf8'));
    return JSON.stringify([p, read().gh], (k, v) => (['since', 'at', 'startedAt', 'waits', 'logs'].includes(k) ? undefined : v));
  };
  return { root, initial, restore, read, step, events, fingerprint, record, actions: () => actions, gh: () => read().gh };
}

// Stage ids a stage waits for, directly or through the stages it comes after.
const upstream = (p, id) => {
  const s = p.stages.find((x) => x.id === id);
  return s.after.flatMap((d) => [d, ...upstream(p, d)]);
};
const inRelease = (s) => s.waiting?.release || ['merged', 'deployed', 'failed'].includes(s.state) || (s.state === 'pr-open' && s.approvedHead);

const properties = {
  // Merges go one stage at a time, whatever waits.
  'merges go one at a time': (p, actions, gh) => {
    const merges = actions.filter(([kind]) => kind === 'merge');
    return merges.length <= 1 && merges.every(([, id]) => !p.stages.some((t) => t.id !== id && t.state !== 'done' &&
      (inRelease(t) && t.state !== 'pr-open' || t.waiting?.release || gh[t.id]?.state === 'MERGED')));
  },
  // A waiting stage never blocks a stage that does not depend on it.
  'a waiting stage blocks only its dependents': (p, actions) => {
    const waiting = p.stages.filter((s) => s.waiting);
    const free = p.stages.filter((s) => !s.waiting && s.state !== 'done' &&
      !waiting.some((w) => upstream(p, s.id).includes(w.id) || inRelease(w)));
    if (p.status === 'waiting') return free.length === 0;
    return actions.every(([kind, id, detail]) => kind !== 'hold' || !free.some((s) => s.id === id) ||
      !waiting.some((w) => new RegExp(`\\b${w.id}\\b`).test(detail)));
  },
  // The program never reads running while no stage can act.
  'running means some stage can act': (p, actions) =>
    p.status !== 'running' || actions.some(([kind]) => !IDLE.has(kind)) || p.stages.every((s) => s.state === 'done'),
};

test('per-stage waits: a waiting stage blocks only its dependents, and running means a stage can act', { timeout: 300000 }, () => {
  const w = world();
  try {
    const seen = new Map();
    let frontier = [{ state: w.initial, path: [] }];
    let transitions = 0;
    for (let depth = 1; depth <= DEPTH && frontier.length; depth += 1) {
      const nextFrontier = [];
      for (const { state, path } of frontier) {
        for (const event of Object.keys(w.events)) {
          w.restore(state);
          w.step(event);
          transitions += 1;
          const p = JSON.parse(readFileSync(w.record, 'utf8'));
          for (const [name, holds] of Object.entries(properties)) {
            assert.ok(holds(p, w.actions(), w.gh()), `${name} broke after: ${[...path, event].join(' -> ')}\n${JSON.stringify(w.actions())}\n${JSON.stringify(p.stages.map((s) => [s.id, s.state, s.waiting]))} status ${p.status}`);
          }
          const key = w.fingerprint();
          if (seen.has(key)) continue;
          seen.set(key, [...path, event]);
          if (depth < DEPTH) nextFrontier.push({ state: w.read(), path: [...path, event] });
        }
      }
      frontier = nextFrontier;
    }
    // The exploration reached the states the properties are about.
    const reached = [...seen.keys()].map((k) => JSON.parse(k)[0]);
    assert.ok(reached.some((p) => p.status === 'waiting'), 'some path sets the program waiting');
    assert.ok(reached.some((p) => p.status === 'running' && p.stages.some((s) => s.waiting)), 'some path keeps it running beside a wait');
    console.log(`explored ${seen.size} states, ${transitions} transitions, depth ${DEPTH}`);
  } finally {
    rmSync(w.root, { recursive: true, force: true });
  }
});

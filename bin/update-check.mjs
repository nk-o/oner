#!/usr/bin/env node
// Session-start hook. Prints one line for the agent when this checkout's default
// branch is behind its remote, so the agent can offer the update; it never pulls.
// Starts at most one background fetch a day, so the answer is at most a day old
// and the hook never waits on the network. Silent otherwise, errors included.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 24 * 60 * 60 * 1000;
const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const git = (...args) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  const statePath = join(repo, '.update-check.json');
  let fetchedAt = 0;
  try {
    fetchedAt = JSON.parse(readFileSync(statePath, 'utf8')).fetchedAt ?? 0;
  } catch {}
  if (Date.now() - fetchedAt > DAY) {
    writeFileSync(statePath, JSON.stringify({ fetchedAt: Date.now() }) + '\n');
    spawn('git', ['-C', repo, 'fetch', '--quiet', 'origin'], { detached: true, stdio: 'ignore' }).unref();
  }

  // Work on a feature branch is the user's own; only the default branch is updated.
  let defaultBranch = 'main';
  try {
    defaultBranch = git('rev-parse', '--abbrev-ref', 'origin/HEAD').replace(/^origin\//, '');
  } catch {}
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== defaultBranch) process.exit(0);
  const behind = Number(git('rev-list', '--count', `HEAD..origin/${defaultBranch}`));
  if (behind > 0) {
    console.log(
      `An update to the agent config at ${repo} is available: ${behind} commit${behind === 1 ? '' : 's'} on origin/${defaultBranch}. ` +
        'When the conversation reaches a natural pause, offer it to the user in one line. ' +
        'Apply it only when they agree, through the configure skill.',
    );
  }
} catch {}

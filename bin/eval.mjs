#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError, loadConfig } from '../build/config.mjs';
import { toolPath, writeEvalPlugin } from '../build/eval.mjs';

const USAGE = `Usage: node bin/eval.mjs [--case <glob>] [--tag <tag>] [--runs <n>] [--baseline] [--keep] [-- <claude plugin eval options>]

Renders this checkout's skills, agents, and AGENTS.md into a temporary Claude Code
plugin and runs \`claude plugin eval\` on evals/. Results and the HTML report go to
.oner/evals/<timestamp>/ and are never published. The settings and local/ come
from this checkout, else from the primary checkout, and every skill is on. It exits 1
when a case scores below 1.

  --case <glob>  Only the cases whose name matches, such as 'route-*'
  --tag <tag>    Only the cases with this tag
  --runs <n>     Runs per case (default 1)
  --baseline     Also run every case without oner and report the difference
  --keep         Keep the temporary plugin and the run directories

Every run spends the Claude Code account's usage.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const split = args.indexOf('--');
const own = split === -1 ? args : args.slice(0, split);
const passThrough = split === -1 ? [] : args.slice(split + 1);
const forwarded = [];
let runs = '1';
let baseline = false;
let keep = false;
for (let i = 0; i < own.length; i++) {
  const a = own[i];
  if (a === '--baseline') baseline = true;
  else if (a === '--keep') keep = true;
  else if (a === '--runs' && own[i + 1]) runs = own[++i];
  else if ((a === '--case' || a === '--tag') && own[i + 1]) forwarded.push(a, own[++i]);
  else {
    console.error(`eval: unknown argument ${a}\n\n${USAGE}`);
    process.exit(2);
  }
}

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const primary = spawnSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  .stdout?.match(/^worktree (.+)$/m)?.[1];
const configRepo = existsSync(join(repo, 'config.json')) || !primary ? repo : primary;

const tmp = mkdtempSync(join(tmpdir(), 'oner-eval-'));
const plugin = join(tmp, 'oner');
try {
  writeEvalPlugin(repo, loadConfig(configRepo), plugin, { local: join(configRepo, 'local') });
} catch (err) {
  rmSync(tmp, { recursive: true, force: true });
  if (!(err instanceof BuildError)) throw err;
  console.error(`eval: ${err.message}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(repo, '.oner', 'evals', stamp);
const path = [toolPath('git'), toolPath('node'), process.env.PATH].filter(Boolean).join(delimiter);
const result = spawnSync('claude', [
  'plugin', 'eval', plugin,
  '--scaffold', '--trust-plugin', '--no-publish',
  '--allow-tools', 'Bash', 'Edit', 'Write',
  '--runs', runs,
  '--ablation', baseline ? 'with-without' : 'none',
  '--output-dir', out,
  '--report', join(out, 'report.html'),
  '--json', join(out, 'result.json'),
  ...(keep ? ['--keep-temp'] : []),
  ...forwarded,
  ...passThrough,
], { stdio: 'inherit', env: { ...process.env, PATH: path } });

if (keep) console.log(`eval: plugin kept at ${plugin}`);
else rmSync(tmp, { recursive: true, force: true });
if (result.error) {
  console.error(`eval: could not start claude: ${result.error.message}`);
  process.exit(1);
}
console.log(`eval: results in ${out}`);
process.exit(result.status ?? 1);

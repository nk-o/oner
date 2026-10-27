#!/usr/bin/env node
// What is configured, installed, and available on this machine. The configure
// skill and the setup guide read it instead of probing by hand.
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError } from '../build/config.mjs';
import { status } from '../build/status.mjs';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--json')) {
  console.error('Usage: node bin/status.mjs [--json]');
  process.exit(2);
}
const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
let s;
try {
  s = status(repo);
} catch (err) {
  if (!(err instanceof BuildError)) throw err;
  console.error(`status: ${err.message}`);
  process.exit(1);
}
if (args.includes('--json')) {
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}

const yes = (b) => (b ? 'yes' : 'no');
const width = Math.max(...s.targets.map((t) => t.label.length), ...s.reviewers.map((r) => r.label.length)) + 2;
console.log(`Checkout   ${s.repo} (${s.version.branch} ${s.version.commit}, ${s.version.date})`);
if (s.version.behind) console.log(`Update     ${s.version.behind} commit(s) on ${s.version.upstream}`);
console.log(`Config     ${s.configExists ? 'config.json' : 'none, defaults in use'}`);
console.log(`Language   ${s.language}`);
console.log('\nAgents');
for (const t of s.targets) {
  const installed = t.installedFrom === s.repo ? `installed, ${t.files} files` : t.installedFrom ? `installed from ${t.installedFrom}` : 'not installed';
  console.log(`  ${t.label.padEnd(width)} build ${yes(t.enabled).padEnd(4)} cli ${yes(t.cliFound).padEnd(4)} ${installed}  ${t.dir}`);
}
console.log(`\nEffort     ${s.effort.map((e) => `${e.stage} ${e.level}`).join(', ')}`);
console.log('\nExternal reviewers');
for (const r of s.reviewers) {
  console.log(`  ${r.label.padEnd(width)} on ${yes(r.enabled).padEnd(4)} cli ${yes(r.cliFound).padEnd(4)} ${r.model}${r.effort ? ` (${r.effort})` : ''}`);
}
const off = s.skills.filter((k) => k.disabled).map((k) => k.name);
console.log(`\nSkills     ${s.skills.length - off.length} on${off.length ? `, off: ${off.join(', ')}` : ''}`);

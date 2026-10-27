#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCheckoutLocation, BuildError, loadConfig } from '../build/config.mjs';
import { build } from '../build/install.mjs';

const USAGE = `Usage: node bin/build.mjs [--auto]

Renders skills/, agents/, AGENTS.md, and local/ into every target enabled in
config.json, and merges the build's own keys into each target's settings.

  --auto  Rebuild only when this checkout has built before and its inputs
          changed since. Silent when there is nothing to do. The hooks run this.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = args.filter((a) => a !== '--auto');
if (unknown.length) {
  console.error(`build: unknown argument ${unknown[0]}\n\n${USAGE}`);
  process.exit(2);
}
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`build: needs Node 20 or newer, this is ${process.versions.node}`);
  process.exit(1);
}

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
try {
  const auto = args.includes('--auto');
  // A checkout at ~/.agents can never have built, so auto has nothing to do there.
  if (!auto) assertCheckoutLocation(repo);
  for (const line of build(repo, loadConfig(repo), { auto })) console.log(line);
} catch (err) {
  if (!(err instanceof BuildError)) throw err;
  console.error(`build: ${err.message}`);
  process.exit(1);
}

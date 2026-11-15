#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError, loadConfig } from '../build/config.mjs';
import { syncLocal } from '../build/local.mjs';

if (process.argv.length > 2) {
  console.error('Usage: node bin/local.mjs');
  process.exit(2);
}
const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
try {
  const result = syncLocal(repo, loadConfig(repo).localRepository);
  console.log(result.line ?? 'local: no repository configured');
  if (result.state === 'modified') process.exitCode = 1;
} catch (error) {
  if (!(error instanceof BuildError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}

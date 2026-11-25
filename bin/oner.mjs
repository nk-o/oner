#!/usr/bin/env node
// The `oner` command the build links into ~/.local/bin: opens the panel in the browser.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length > 2) {
  console.error('Usage: oner\n\nOpens the oner panel in the browser, starting it when it is not running.');
  process.exit(2);
}
const ui = join(dirname(fileURLToPath(import.meta.url)), 'ui.mjs');
const { status, error } = spawnSync(process.execPath, [ui, '--open'], { stdio: 'inherit' });
if (error) throw error;
process.exit(status ?? 1);
